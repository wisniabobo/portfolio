/* ============================================================
   dashboard.wisnia.dev — rynek krypto na żywo
   - ceny w czasie rzeczywistym: Binance WebSocket (miniTicker, kline)
   - dane rynkowe: CoinGecko (cache w localStorage + stale fallback)
   - Fear & Greed: alternative.me
   - wykres świecowy/liniowy: własny renderer na <canvas>
   Zero zależności.
   ============================================================ */

"use strict";

/* ---------- konfiguracja ---------- */

const CG = "https://api.coingecko.com/api/v3";
const BINANCE_REST = "https://api.binance.com/api/v3";
const BINANCE_WS = "wss://stream.binance.com:9443/stream";

// monety z topki bez pary USDT na Binance (stablecoiny, wrappery, delisty)
const NO_BINANCE = new Set([
  "usdt", "usdc", "steth", "wsteth", "wbtc", "weth", "weeth", "cbbtc",
  "usds", "usde", "susde", "dai", "fdusd", "tusd", "bsc-usd", "leo",
  "hype", "xmr", "bgb", "wbt", "reth", "meth", "solvbtc", "jitosol",
]);

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  coins: [],
  bySymbol: new Map(),       // BTCUSDT -> obiekt monety
  selected: null,            // moneta na wykresie
  interval: "1h",
  chartType: "candles",
  candles: [],
  chartLive: false,
  sortKey: "market_cap_rank",
  sortDir: 1,
  search: "",
  tickerWS: null,
  symbolWS: null,   // kline + depth + aggTrade wybranej pary
  wsRetry: 1000,
  book: { bids: [], asks: [] },
  lastMid: 0,
};

/* ---------- formatowanie (pl-PL) ---------- */

const nf = (min, max) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: min, maximumFractionDigits: max });

function fmtPrice(v) {
  if (v == null || isNaN(v)) return "–";
  if (v >= 1000) return nf(2, 2).format(v) + " $";
  if (v >= 1) return nf(2, 2).format(v) + " $";
  if (v >= 0.01) return nf(4, 4).format(v) + " $";
  return nf(6, 8).format(v) + " $";
}

function fmtBig(v) {
  if (v == null || isNaN(v)) return "–";
  if (v >= 1e12) return nf(2, 2).format(v / 1e12) + " bln $";
  if (v >= 1e9) return nf(2, 2).format(v / 1e9) + " mld $";
  if (v >= 1e6) return nf(2, 2).format(v / 1e6) + " mln $";
  return nf(0, 0).format(v) + " $";
}

function fmtQty(v) {
  if (v >= 1000) return nf(0, 0).format(v);
  if (v >= 1) return nf(2, 3).format(v);
  return nf(4, 5).format(v);
}

function fmtPct(v) {
  if (v == null || isNaN(v)) return "–";
  const s = v > 0 ? "+" : "";
  return s + nf(2, 2).format(v) + "%";
}

function pctClass(v) {
  return v > 0 ? "up" : v < 0 ? "down" : "";
}

/* ---------- fetch z cache ---------- */

function cacheRead(key, ttl, allowStale = false) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (!allowStale && Date.now() - ts > ttl) return null;
    return data;
  } catch {
    return null;
  }
}

function cacheWrite(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

async function cachedJSON(url, key, ttl) {
  const fresh = cacheRead(key, ttl);
  if (fresh) return fresh;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const data = await res.json();
    cacheWrite(key, data);
    return data;
  } catch (err) {
    // limit API / brak sieci — lepsze nieświeże dane niż żadne
    const stale = cacheRead(key, ttl, true);
    if (stale) return stale;
    throw err;
  }
}

/* ---------- motyw ---------- */

function setupTheme() {
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    drawChart(); // kolory wykresu czytane z CSS
  });
}

/* ---------- statystyki globalne ---------- */

async function loadGlobal() {
  const g = (await cachedJSON(`${CG}/global`, "dash-global-v1", 5 * 60 * 1000)).data;
  const mcap = g.total_market_cap.usd;
  const chg = g.market_cap_change_percentage_24h_usd;
  document.getElementById("mcap-value").textContent = fmtBig(mcap);
  const chgEl = document.getElementById("mcap-change");
  chgEl.innerHTML = `<span class="chg ${pctClass(chg)}">${fmtPct(chg)}</span> przez 24h`;

  const vol = g.total_volume.usd;
  document.getElementById("vol-value").textContent = fmtBig(vol);
  document.getElementById("vol-sub").textContent =
    `${nf(1, 1).format((vol / mcap) * 100)}% kapitalizacji rynku`;

  const btc = g.market_cap_percentage.btc;
  const eth = g.market_cap_percentage.eth;
  document.getElementById("btc-dom").textContent = nf(1, 1).format(btc) + "%";
  document.getElementById("eth-dom").textContent = `ETH: ${nf(1, 1).format(eth)}%`;
  const C = 2 * Math.PI * 50;
  document.getElementById("donut-btc").style.strokeDasharray =
    `${(btc / 100) * C} ${C}`;
}

const FNG_LABELS = {
  "Extreme Fear": "Skrajny strach",
  "Fear": "Strach",
  "Neutral": "Neutralnie",
  "Greed": "Chciwość",
  "Extreme Greed": "Skrajna chciwość",
};

async function loadFng() {
  const d = (await cachedJSON("https://api.alternative.me/fng/?limit=1", "dash-fng-v1", 30 * 60 * 1000)).data[0];
  const v = Number(d.value);
  document.getElementById("fng-value").textContent = v;
  document.getElementById("fng-label").textContent = FNG_LABELS[d.value_classification] || d.value_classification;
  document.getElementById("gauge-needle").style.transform = `rotate(${-90 + v * 1.8}deg)`;
}

/* ---------- tabela rynku ---------- */

async function loadCoins() {
  const url = `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=24h,7d`;
  const data = await cachedJSON(url, "dash-markets-v1", 2 * 60 * 1000);
  state.coins = data.map((c) => ({
    id: c.id,
    market_cap_rank: c.market_cap_rank,
    name: c.name,
    symbol: c.symbol,
    image: c.image,
    current_price: c.current_price,
    price_change_percentage_24h_in_currency: c.price_change_percentage_24h_in_currency,
    price_change_percentage_7d_in_currency: c.price_change_percentage_7d_in_currency,
    market_cap: c.market_cap,
    total_volume: c.total_volume,
    high_24h: c.high_24h,
    low_24h: c.low_24h,
    sparkline: c.sparkline_in_7d?.price || [],
    // brak pary USDT: lista wyjątków + symbole spoza [a-z0-9] (np. figr_heloc)
    binance: NO_BINANCE.has(c.symbol.toLowerCase()) || !/^[a-z0-9]+$/i.test(c.symbol)
      ? null
      : c.symbol.toUpperCase() + "USDT",
  }));
  state.bySymbol = new Map(state.coins.filter((c) => c.binance).map((c) => [c.binance, c]));
  if (!state.selected) {
    state.selected = state.coins.find((c) => c.id === "bitcoin") || state.coins.find((c) => c.binance);
  }
}

function sparkSVG(points, up) {
  if (!points.length) return "";
  const w = 110, h = 34;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  let d = "";
  points.forEach((p, i) => {
    const x = (i * step).toFixed(1);
    const y = (h - 3 - ((p - min) / span) * (h - 6)).toFixed(1);
    d += (i ? "L" : "M") + x + " " + y;
  });
  const color = up ? "var(--up)" : "var(--down)";
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path class="fill" d="${d} L ${w} ${h} L 0 ${h} Z" fill="${color}"></path>
    <path d="${d}" stroke="${color}"></path></svg>`;
}

function renderTable() {
  const tbody = document.getElementById("market-body");
  const q = state.search.trim().toLowerCase();
  let rows = state.coins.filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)
  );
  const k = state.sortKey, dir = state.sortDir;
  rows.sort((a, b) => {
    const av = a[k], bv = b[k];
    if (typeof av === "string") return av.localeCompare(bv) * dir;
    return ((av ?? -Infinity) - (bv ?? -Infinity)) * dir;
  });

  tbody.innerHTML = "";
  for (const c of rows) {
    const tr = document.createElement("tr");
    tr.dataset.id = c.id;
    if (state.selected && c.id === state.selected.id) tr.classList.add("selected");
    tr.title = c.binance ? `Pokaż wykres ${c.symbol.toUpperCase()}/USDT` : `${c.name} — brak pary na Binance`;

    const chg24 = c.price_change_percentage_24h_in_currency;
    const chg7 = c.price_change_percentage_7d_in_currency;
    tr.innerHTML = `
      <td class="num">${c.market_cap_rank ?? "–"}</td>
      <td><span class="coin-cell"><img src="${c.image}" alt="" width="24" height="24" loading="lazy">
        <span class="name">${c.name}</span> <span class="ticker">${c.symbol}</span></span></td>
      <td class="num price" data-cell="price">${fmtPrice(c.current_price)}</td>
      <td class="num"><span class="chg ${pctClass(chg24)}" data-cell="chg24">${fmtPct(chg24)}</span></td>
      <td class="num"><span class="chg ${pctClass(chg7)}">${fmtPct(chg7)}</span></td>
      <td class="num">${fmtBig(c.market_cap)}</td>
      <td class="num">${fmtBig(c.total_volume)}</td>
      <td class="num">${sparkSVG(c.sparkline, (chg7 ?? 0) >= 0)}</td>`;
    tr.addEventListener("click", () => c.binance && selectCoin(c));
    tbody.appendChild(tr);
    c.row = tr;
  }
}

function setupTableControls() {
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = 1; }
      document.querySelectorAll("th.sortable").forEach((t) => t.classList.remove("sorted-asc", "sorted-desc"));
      th.classList.add(state.sortDir === 1 ? "sorted-asc" : "sorted-desc");
      renderTable();
    });
  });
  document.getElementById("search").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderTable();
  });
}

/* ---------- taśma cen ---------- */

function buildTape() {
  const track = document.getElementById("tape-track");
  track.innerHTML = "";
  const coins = state.coins.filter((c) => c.binance).slice(0, 12);
  // duplikat dla płynnej pętli
  for (const c of [...coins, ...coins]) {
    const el = document.createElement("span");
    el.className = "tape-item";
    el.innerHTML = `<span class="sym">${c.symbol.toUpperCase()}</span>
      <span class="price" data-tape="${c.binance}">${fmtPrice(c.current_price)}</span>
      <span class="chg ${pctClass(c.price_change_percentage_24h_in_currency)}" data-tapechg="${c.binance}">
        ${fmtPct(c.price_change_percentage_24h_in_currency)}</span>`;
    track.appendChild(el);
  }
}

/* ---------- Binance WebSocket: miniTicker ---------- */

function setWSStatus(stateName, label) {
  const el = document.getElementById("ws-status");
  el.dataset.state = stateName;
  document.getElementById("ws-label").textContent = label;
}

function openTickerWS() {
  const symbols = state.coins.filter((c) => c.binance).map((c) => c.binance.toLowerCase());
  if (!symbols.length) return;
  const streams = symbols.map((s) => `${s}@miniTicker`).join("/");

  if (state.tickerWS) { state.tickerWS.onclose = null; state.tickerWS.close(); }
  const ws = new WebSocket(`${BINANCE_WS}?streams=${streams}`);
  state.tickerWS = ws;

  ws.onopen = () => { state.wsRetry = 1000; setWSStatus("live", "na żywo"); };
  ws.onmessage = (e) => {
    const { data } = JSON.parse(e.data);
    if (!data || data.e !== "24hrMiniTicker") return;
    onTick(data.s, Number(data.c), Number(data.o), Number(data.h), Number(data.l));
  };
  ws.onclose = () => {
    setWSStatus("connecting", "wznawianie…");
    setTimeout(openTickerWS, state.wsRetry);
    state.wsRetry = Math.min(state.wsRetry * 1.6, 30000);
  };
  ws.onerror = () => ws.close();
}

function flash(el, up) {
  if (REDUCED_MOTION || !el) return;
  el.classList.remove("flash-up", "flash-down");
  void el.offsetWidth; // restart animacji
  el.classList.add(up ? "flash-up" : "flash-down");
}

function onTick(symbol, price, open24, high24, low24) {
  const coin = state.bySymbol.get(symbol);
  if (!coin) return;
  const prev = coin.current_price;
  const chg = open24 ? ((price - open24) / open24) * 100 : coin.price_change_percentage_24h_in_currency;
  coin.current_price = price;
  coin.price_change_percentage_24h_in_currency = chg;
  if (high24) coin.high_24h = high24;
  if (low24) coin.low_24h = low24;

  // wiersz tabeli
  if (coin.row?.isConnected) {
    const cell = coin.row.querySelector('[data-cell="price"]');
    if (cell) {
      cell.textContent = fmtPrice(price);
      if (prev && price !== prev) flash(cell, price > prev);
    }
    const chgCell = coin.row.querySelector('[data-cell="chg24"]');
    if (chgCell) {
      chgCell.textContent = fmtPct(chg);
      chgCell.className = `chg ${pctClass(chg)}`;
    }
  }

  // taśma
  document.querySelectorAll(`[data-tape="${symbol}"]`).forEach((el) => (el.textContent = fmtPrice(price)));
  document.querySelectorAll(`[data-tapechg="${symbol}"]`).forEach((el) => {
    el.textContent = fmtPct(chg);
    el.className = `chg ${pctClass(chg)}`;
  });

  // nagłówek wykresu
  if (state.selected?.binance === symbol) updateChartHeader(price, chg, prev);
}

/* ---------- wykres: dane ---------- */

async function loadCandles() {
  const { selected, interval } = state;
  state.chartLive = false;
  try {
    const res = await fetch(`${BINANCE_REST}/klines?symbol=${selected.binance}&interval=${interval}&limit=180`);
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const raw = await res.json();
    state.candles = raw.map((k) => ({
      t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5],
    }));
    state.chartLive = true;
  } catch {
    // fallback: CoinGecko OHLC (bez wolumenu i bez live)
    const days = { "15m": 1, "1h": 7, "4h": 30, "1d": 180, "1w": 365 }[interval] || 7;
    const raw = await cachedJSON(
      `${CG}/coins/${selected.id}/ohlc?vs_currency=usd&days=${days}`,
      `dash-ohlc-${selected.id}-${days}`, 5 * 60 * 1000
    );
    state.candles = raw.map((k) => ({ t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: 0 }));
  }
  drawChart();
}

/* ---------- WS wybranej pary: kline + arkusz zleceń + transakcje ---------- */

function openSymbolWS() {
  if (state.symbolWS) { state.symbolWS.onclose = null; state.symbolWS.close(); }
  const sym = state.selected.binance.toLowerCase();
  const streams = [
    `${sym}@kline_${state.interval}`,
    `${sym}@depth20@100ms`,
    `${sym}@aggTrade`,
  ].join("/");
  const ws = new WebSocket(`${BINANCE_WS}?streams=${streams}`);
  state.symbolWS = ws;

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    const data = msg.data;
    if (!data) return;
    if (data.e === "kline") {
      const k = data.k;
      const candle = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
      const last = state.candles[state.candles.length - 1];
      if (last && last.t === candle.t) state.candles[state.candles.length - 1] = candle;
      else { state.candles.push(candle); state.candles.shift(); }
      drawChart();
    } else if (data.e === "aggTrade") {
      addTrade({ p: +data.p, q: +data.q, t: data.T, sell: data.m });
    } else if (data.bids && data.asks) {
      // partial book depth (bez pola e)
      state.book.bids = data.bids;
      state.book.asks = data.asks;
      scheduleBookRender();
    }
  };
}

/* ---------- arkusz zleceń ---------- */

let bookRenderPending = false;
function scheduleBookRender() {
  if (bookRenderPending) return;
  bookRenderPending = true;
  setTimeout(() => {
    bookRenderPending = false;
    renderBook();
  }, 250);
}

function bookRows(levels, el, cls, maxCum) {
  let cum = 0;
  const frag = document.createDocumentFragment();
  for (const [p, q] of levels) {
    cum += p * q;
    const row = document.createElement("div");
    row.className = "book-row";
    const depth = document.createElement("span");
    depth.className = "depth";
    depth.style.width = `${Math.min(100, (cum / maxCum) * 100)}%`;
    row.appendChild(depth);
    const price = document.createElement("span");
    price.className = "price";
    price.textContent = fmtPrice(+p).replace(" $", "");
    const qty = document.createElement("span");
    qty.textContent = fmtQty(+q);
    const total = document.createElement("span");
    total.textContent = fmtBig(cum).replace(" $", "");
    row.append(price, qty, total);
    frag.appendChild(row);
  }
  el.innerHTML = "";
  el.appendChild(frag);
}

function renderBook() {
  const { bids, asks } = state.book;
  if (!bids.length || !asks.length) return;
  const N_LVL = 9;
  const b = bids.slice(0, N_LVL).map(([p, q]) => [+p, +q]);
  const a = asks.slice(0, N_LVL).map(([p, q]) => [+p, +q]);
  const cumOf = (ls) => ls.reduce((s, [p, q]) => s + p * q, 0);
  const maxCum = Math.max(cumOf(b), cumOf(a));

  // aski od najniższej ceny na dole (jak na giełdzie) — rysujemy odwrócone
  bookRows([...a].reverse(), document.getElementById("book-asks"), "asks", maxCum);
  bookRows(b, document.getElementById("book-bids"), "bids", maxCum);

  const bestBid = b[0][0], bestAsk = a[0][0];
  const mid = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;
  const midEl = document.getElementById("book-mid");
  midEl.textContent = fmtPrice(mid);
  midEl.className = `book-mid mono ${mid >= state.lastMid ? "up" : "down"}`;
  state.lastMid = mid;
  const spreadPct = (spread / mid) * 100;
  document.getElementById("book-spread").textContent =
    `spread ${fmtPrice(spread)} (${spreadPct < 0.01 ? "<0,01" : nf(2, 2).format(spreadPct)}%)`;
}

/* ---------- transakcje na żywo ---------- */

const MAX_TRADES = 22;

function tradeRow({ p, q, t, sell }, fresh = true) {
  const li = document.createElement("li");
  li.className = (sell ? "sell" : "buy") + (fresh ? " fresh" : "");
  const price = document.createElement("span");
  price.className = "price";
  price.textContent = fmtPrice(p).replace(" $", "");
  const qty = document.createElement("span");
  qty.textContent = fmtQty(q);
  const time = document.createElement("span");
  time.textContent = new Date(t).toLocaleTimeString("pl-PL");
  li.append(price, qty, time);
  return li;
}

function addTrade(t) {
  const list = document.getElementById("trades-list");
  list.prepend(tradeRow(t));
  while (list.children.length > MAX_TRADES) list.lastChild.remove();
}

async function bootstrapBookAndTrades() {
  const sym = state.selected.binance;
  document.getElementById("trades-pair").textContent = `${state.selected.symbol.toUpperCase()}/USDT`;
  document.getElementById("trades-list").innerHTML = "";
  state.book = { bids: [], asks: [] };
  try {
    const [depth, trades] = await Promise.all([
      fetch(`${BINANCE_REST}/depth?symbol=${sym}&limit=20`).then((r) => r.json()),
      fetch(`${BINANCE_REST}/aggTrades?symbol=${sym}&limit=${MAX_TRADES}`).then((r) => r.json()),
    ]);
    state.book.bids = depth.bids;
    state.book.asks = depth.asks;
    renderBook();
    const list = document.getElementById("trades-list");
    trades.reverse().forEach((tr) =>
      list.appendChild(tradeRow({ p: +tr.p, q: +tr.q, t: tr.T, sell: tr.m }, false)));
  } catch (e) {
    console.warn("book/trades:", e);
  }
}

function updateChartHeader(price, chg, prev) {
  const priceEl = document.getElementById("chart-price");
  priceEl.textContent = fmtPrice(price);
  if (prev && price !== prev) {
    priceEl.style.color = price > prev ? "var(--up)" : "var(--down)";
    setTimeout(() => (priceEl.style.color = ""), 500);
  }
  const chgEl = document.getElementById("chart-change");
  chgEl.textContent = fmtPct(chg);
  chgEl.className = `chg ${pctClass(chg)}`;
  const sel = state.selected;
  if (sel) {
    document.getElementById("chart-high").textContent = fmtPrice(sel.high_24h);
    document.getElementById("chart-low").textContent = fmtPrice(sel.low_24h);
  }
}

function selectCoin(coin) {
  state.selected = coin;
  document.getElementById("chart-name").innerHTML =
    `${coin.name} <span class="pair" id="chart-pair">${coin.symbol.toUpperCase()}/USDT</span>`;
  const icon = document.getElementById("chart-icon");
  icon.src = coin.image;
  icon.hidden = false;
  updateChartHeader(coin.current_price, coin.price_change_percentage_24h_in_currency, null);
  document.querySelectorAll("#market-body tr").forEach((tr) =>
    tr.classList.toggle("selected", tr.dataset.id === coin.id));
  loadCandles();
  openSymbolWS();
  bootstrapBookAndTrades();
}

function setupChartControls() {
  document.querySelectorAll("[data-interval]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-interval]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.interval = btn.dataset.interval;
      loadCandles();
      openSymbolWS(); // stream kline z nowym interwałem
    });
  });
  document.querySelectorAll("[data-type]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-type]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.chartType = btn.dataset.type;
      drawChart();
    });
  });
}

/* ---------- wykres: renderer canvas ---------- */

const chart = {
  canvas: null,
  ctx: null,
  pad: { top: 14, right: 74, bottom: 26, left: 10 },
  hover: null, // indeks świecy pod kursorem
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartArea() {
  const { canvas, pad } = chart;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  return {
    w, h,
    plotW: w - pad.left - pad.right,
    plotH: h - pad.top - pad.bottom - 44, // 44px na wolumen
    volH: 38,
  };
}

function drawChart() {
  const { canvas, ctx, pad } = chart;
  if (!canvas || !state.candles.length) return;

  const dpr = window.devicePixelRatio || 1;
  const { w, h, plotW, plotH, volH } = chartArea();
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const candles = state.candles;
  const up = cssVar("--up") || "#3ddc84";
  const down = cssVar("--down") || "#ff4d6b";
  const dim = cssVar("--text-dim") || "#9aa4b8";
  const grid = cssVar("--border") || "rgba(255,255,255,0.09)";
  const accent2 = cssVar("--accent-2") || "#7c5cff";

  let min = Infinity, max = -Infinity, maxV = 0;
  for (const c of candles) {
    if (c.l < min) min = c.l;
    if (c.h > max) max = c.h;
    if (c.v > maxV) maxV = c.v;
  }
  const span = max - min || 1;
  min -= span * 0.04; max += span * 0.04;

  const x = (i) => pad.left + ((i + 0.5) / candles.length) * plotW;
  const y = (p) => pad.top + (1 - (p - min) / (max - min)) * plotH;
  const volY = pad.top + plotH + 6;

  // siatka + etykiety cen
  ctx.strokeStyle = grid;
  ctx.fillStyle = dim;
  ctx.font = "11px JetBrains Mono, monospace";
  ctx.textAlign = "left";
  ctx.lineWidth = 1;
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const p = min + ((max - min) * i) / steps;
    const yy = y(p);
    ctx.beginPath();
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(pad.left + plotW, yy);
    ctx.stroke();
    ctx.fillText(fmtPrice(p).replace(" $", ""), pad.left + plotW + 8, yy + 4);
  }

  // etykiety czasu
  ctx.textAlign = "center";
  const tStep = Math.ceil(candles.length / 6);
  for (let i = 0; i < candles.length; i += tStep) {
    const d = new Date(candles[i].t);
    const label = ["1d", "1w"].includes(state.interval)
      ? d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" })
      : d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    ctx.fillText(label, x(i), h - 8);
  }

  // wolumen
  if (maxV > 0) {
    const bw = Math.max(1, (plotW / candles.length) * 0.6);
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const vh = (c.v / maxV) * volH;
      ctx.fillStyle = c.c >= c.o ? up + "44" : down + "44";
      ctx.fillRect(x(i) - bw / 2, volY + volH - vh, bw, vh);
    }
  }

  if (state.chartType === "area") {
    // linia + gradient
    ctx.beginPath();
    candles.forEach((c, i) => (i ? ctx.lineTo(x(i), y(c.c)) : ctx.moveTo(x(i), y(c.c))));
    ctx.strokeStyle = accent2;
    ctx.lineWidth = 2;
    ctx.stroke();
    const g = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    g.addColorStop(0, accent2 + "55");
    g.addColorStop(1, accent2 + "00");
    ctx.lineTo(x(candles.length - 1), pad.top + plotH);
    ctx.lineTo(x(0), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  } else {
    // świece
    const bw = Math.max(1.5, (plotW / candles.length) * 0.62);
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const col = c.c >= c.o ? up : down;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x(i), y(c.h));
      ctx.lineTo(x(i), y(c.l));
      ctx.stroke();
      const yo = y(c.o), yc = y(c.c);
      ctx.fillRect(x(i) - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    }
  }

  // MA20 — prosta średnia krocząca z zamknięć
  if (candles.length > 20) {
    ctx.beginPath();
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].c;
      if (i >= 20) sum -= candles[i - 20].c;
      if (i >= 19) {
        const yy = y(sum / 20);
        i === 19 ? ctx.moveTo(x(i), yy) : ctx.lineTo(x(i), yy);
      }
    }
    ctx.strokeStyle = "#ffc14d";
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffc14d";
    ctx.textAlign = "left";
    ctx.fillText("MA20", pad.left + 6, pad.top + 12);
  }

  // linia ostatniej ceny
  const last = candles[candles.length - 1];
  const ly = y(last.c);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = last.c >= last.o ? up : down;
  ctx.beginPath();
  ctx.moveTo(pad.left, ly);
  ctx.lineTo(pad.left + plotW, ly);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = last.c >= last.o ? up : down;
  ctx.fillRect(pad.left + plotW + 2, ly - 9, chart.pad.right - 6, 18);
  ctx.fillStyle = "#0a0e17";
  ctx.textAlign = "left";
  ctx.fillText(fmtPrice(last.c).replace(" $", ""), pad.left + plotW + 8, ly + 4);

  // crosshair
  if (chart.hover != null && candles[chart.hover]) {
    const i = chart.hover;
    ctx.strokeStyle = dim;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x(i), pad.top);
    ctx.lineTo(x(i), pad.top + plotH + volH + 6);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function setupChartCanvas() {
  chart.canvas = document.getElementById("chart");
  chart.ctx = chart.canvas.getContext("2d");

  new ResizeObserver(() => drawChart()).observe(chart.canvas.parentElement);

  const tip = document.getElementById("chart-tip");
  chart.canvas.addEventListener("pointermove", (e) => {
    if (!state.candles.length) return;
    const r = chart.canvas.getBoundingClientRect();
    const { plotW } = chartArea();
    const i = Math.floor(((e.clientX - r.left - chart.pad.left) / plotW) * state.candles.length);
    if (i < 0 || i >= state.candles.length) { chart.hover = null; tip.hidden = true; drawChart(); return; }
    chart.hover = i;
    const c = state.candles[i];
    const d = new Date(c.t);
    const dir = c.c >= c.o ? "up" : "down";
    tip.innerHTML =
      `<strong>${d.toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</strong><br>
       O <span class="${dir}">${fmtPrice(c.o)}</span> · H <span class="${dir}">${fmtPrice(c.h)}</span><br>
       L <span class="${dir}">${fmtPrice(c.l)}</span> · C <span class="${dir}">${fmtPrice(c.c)}</span>` +
      (c.v ? `<br>Vol ${nf(0, 0).format(c.v)}` : "");
    tip.hidden = false;
    const tx = Math.min(e.clientX - r.left + 16, r.width - tip.offsetWidth - 8);
    const ty = Math.min(e.clientY - r.top + 16, r.height - tip.offsetHeight - 8);
    tip.style.left = `${Math.max(0, tx)}px`;
    tip.style.top = `${Math.max(0, ty)}px`;
    drawChart();
  });
  chart.canvas.addEventListener("pointerleave", () => {
    chart.hover = null;
    tip.hidden = true;
    drawChart();
  });
}

/* ---------- start ---------- */

async function init() {
  setupTheme();
  setupTableControls();
  setupChartControls();
  setupChartCanvas();

  // dane pomocnicze — niezależne od tabeli
  loadGlobal().catch((e) => console.warn("global:", e));
  loadFng().catch((e) => console.warn("fng:", e));

  try {
    await loadCoins();
  } catch (e) {
    console.error(e);
    document.getElementById("market-body").innerHTML = "";
    document.getElementById("table-error").hidden = false;
    setWSStatus("off", "offline");
    return;
  }

  renderTable();
  buildTape();
  openTickerWS();
  selectCoin(state.selected);
}

init();
