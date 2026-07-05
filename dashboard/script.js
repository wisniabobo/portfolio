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
  view: { start: 0, end: 0 }, // okno widocznych świec (indeksy)
  follow: true,               // trzymaj się prawej krawędzi przy nowych świecach
  indicators: { ma20: true, ema50: false, rsi: false },
  logScale: false,
  range: null,                // aktywny preset zakresu (1d/1w/1mo/3mo/1y/max)
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

// presety zakresu: interwał + liczba widocznych świec
const RANGES = {
  "1d": { interval: "15m", count: 96 },
  "1w": { interval: "1h", count: 168 },
  "1mo": { interval: "4h", count: 186 },
  "3mo": { interval: "1d", count: 90 },
  "1y": { interval: "1d", count: 365 },
  "max": { interval: "1w", count: Infinity },
};
const DEFAULT_VISIBLE = 180;

async function loadCandles() {
  const { selected, interval } = state;
  state.chartLive = false;
  try {
    const res = await fetch(`${BINANCE_REST}/klines?symbol=${selected.binance}&interval=${interval}&limit=1000`);
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const raw = await res.json();
    state.candles = raw.map((k) => ({
      t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5],
    }));
    state.chartLive = true;
  } catch {
    // fallback: CoinGecko OHLC (bez wolumenu i bez live)
    const days = { "1m": 1, "5m": 1, "15m": 1, "1h": 7, "4h": 30, "1d": 180, "1w": 365, "1M": "max" }[interval] || 7;
    const raw = await cachedJSON(
      `${CG}/coins/${selected.id}/ohlc?vs_currency=usd&days=${days}`,
      `dash-ohlc-${selected.id}-${days}`, 5 * 60 * 1000
    );
    state.candles = raw.map((k) => ({ t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: 0 }));
  }
  const len = state.candles.length;
  const wanted = state.range ? RANGES[state.range].count : DEFAULT_VISIBLE;
  state.view.end = len;
  state.view.start = Math.max(0, len - Math.min(wanted, len));
  state.follow = true;
  chart.hover = null;
  drawChart();
}

/* ---------- wskaźniki ---------- */

function calcSMA(closes, n) {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

function calcEMA(closes, n) {
  const out = new Array(closes.length).fill(null);
  const k = 2 / (n + 1);
  let ema = closes[0];
  for (let i = 0; i < closes.length; i++) {
    ema = i === 0 ? closes[0] : closes[i] * k + ema * (1 - k);
    if (i >= n - 1) out[i] = ema;
  }
  return out;
}

function calcRSI(closes, n = 14) {
  const out = new Array(closes.length).fill(null);
  let avgG = 0, avgL = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i <= n) {
      avgG += g / n; avgL += l / n;
      if (i === n) out[i] = 100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL));
    } else {
      avgG = (avgG * (n - 1) + g) / n;
      avgL = (avgL * (n - 1) + l) / n;
      out[i] = 100 - 100 / (1 + (avgL === 0 ? 100 : avgG / avgL));
    }
  }
  return out;
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
      else {
        state.candles.push(candle);
        if (state.follow) { state.view.start++; state.view.end++; }
      }
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

function setActiveInterval(interval) {
  document.querySelectorAll("[data-interval]").forEach((b) =>
    b.classList.toggle("active", b.dataset.interval === interval));
}

function setupChartControls() {
  document.querySelectorAll("[data-interval]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.interval = btn.dataset.interval;
      state.range = null;
      document.querySelectorAll("[data-range]").forEach((b) => b.classList.remove("active"));
      setActiveInterval(state.interval);
      loadCandles();
      openSymbolWS(); // stream kline z nowym interwałem
    });
  });

  document.querySelectorAll("[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.range = btn.dataset.range;
      state.interval = RANGES[state.range].interval;
      document.querySelectorAll("[data-range]").forEach((b) =>
        b.classList.toggle("active", b === btn));
      setActiveInterval(state.interval);
      loadCandles();
      openSymbolWS();
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

  document.querySelectorAll("[data-ind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.ind;
      state.indicators[key] = !state.indicators[key];
      btn.classList.toggle("active", state.indicators[key]);
      drawChart();
    });
  });

  document.getElementById("chart-log").addEventListener("click", (e) => {
    state.logScale = !state.logScale;
    e.currentTarget.classList.toggle("active", state.logScale);
    drawChart();
  });

  document.getElementById("zoom-in").addEventListener("click", () => zoomBy(1 / 1.35));
  document.getElementById("zoom-out").addEventListener("click", () => zoomBy(1.35));

  const fsBtn = document.getElementById("chart-fs");
  fsBtn.addEventListener("click", () => {
    const card = document.querySelector(".chart-card");
    if (document.fullscreenElement) document.exitFullscreen();
    else card.requestFullscreen?.().catch(() => {});
  });
}

function clampView(len) {
  const v = state.view;
  const span = Math.max(20, Math.min(v.end - v.start, len));
  if (v.end > len) v.end = len;
  if (v.end < span) v.end = Math.min(span, len);
  v.start = Math.max(0, v.end - span);
}

function zoomBy(factor, anchorIdx = null) {
  const len = state.candles.length;
  if (!len) return;
  const v = state.view;
  const span = v.end - v.start;
  const newSpan = Math.round(Math.min(Math.max(span * factor, 20), len));
  const anchor = anchorIdx ?? v.end - 1; // domyślnie prawa krawędź
  const frac = span ? (anchor - v.start) / span : 1;
  v.start = Math.round(anchor - frac * newSpan);
  v.end = v.start + newSpan;
  if (v.end > len) { v.end = len; v.start = len - newSpan; }
  if (v.start < 0) { v.start = 0; v.end = newSpan; }
  state.follow = v.end >= len;
  drawChart();
}

/* ---------- wykres: renderer canvas ---------- */

const chart = {
  canvas: null,
  ctx: null,
  pad: { top: 8, right: 76, bottom: 22, left: 8 },
  hover: null,   // absolutny indeks świecy pod kursorem
  hoverY: null,  // pozycja Y kursora (crosshair poziomy)
  geom: null,    // geometria ostatniego rysowania (dla interakcji)
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawChart() {
  const { canvas, ctx, pad } = chart;
  if (!canvas || !state.candles.length) return;

  const candles = state.candles;
  const len = candles.length;
  clampView(len);
  const { start, end } = state.view;
  const span = end - start;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const up = cssVar("--up") || "#3ddc84";
  const down = cssVar("--down") || "#ff4d6b";
  const dim = cssVar("--text-dim") || "#9aa4b8";
  const grid = cssVar("--border") || "rgba(255,255,255,0.09)";
  const accent2 = cssVar("--accent-2") || "#7c5cff";
  const MA_COL = "#ffc14d", EMA_COL = "#4da3ff";

  // układ pionowy: cena | wolumen | RSI
  const plotW = w - pad.left - pad.right;
  const volH = 36;
  const rsiH = state.indicators.rsi ? 62 : 0;
  const plotH = h - pad.top - pad.bottom - volH - 6 - (rsiH ? rsiH + 8 : 0);

  // zakres cen z widocznego okna
  let min = Infinity, max = -Infinity, maxV = 0;
  for (let i = start; i < end; i++) {
    const c = candles[i];
    if (c.l < min) min = c.l;
    if (c.h > max) max = c.h;
    if (c.v > maxV) maxV = c.v;
  }
  const padPct = 0.04;
  if (state.logScale) {
    min = Math.max(min, 1e-9);
    const lmin0 = Math.log(min), lmax0 = Math.log(max);
    const lpad = (lmax0 - lmin0 || 1) * padPct;
    var lmin = lmin0 - lpad, lmax = lmax0 + lpad;
  } else {
    const s = max - min || 1;
    min -= s * padPct; max += s * padPct;
  }

  const x = (i) => pad.left + ((i - start + 0.5) / span) * plotW;
  const y = state.logScale
    ? (p) => pad.top + (1 - (Math.log(Math.max(p, 1e-9)) - lmin) / (lmax - lmin)) * plotH
    : (p) => pad.top + (1 - (p - min) / (max - min)) * plotH;
  const priceAtY = state.logScale
    ? (yy) => Math.exp(lmin + (1 - (yy - pad.top) / plotH) * (lmax - lmin))
    : (yy) => min + (1 - (yy - pad.top) / plotH) * (max - min);
  const volY = pad.top + plotH + 6;
  const rsiY = volY + volH + 8;

  chart.geom = { plotW, plotH, volH, rsiH, x, y, priceAtY, start, end, span, w, h };

  // siatka + etykiety cen
  ctx.strokeStyle = grid;
  ctx.fillStyle = dim;
  ctx.font = "11px JetBrains Mono, monospace";
  ctx.textAlign = "left";
  ctx.lineWidth = 1;
  const steps = 5;
  for (let i = 0; i <= steps; i++) {
    const yy = pad.top + (plotH * i) / steps;
    ctx.beginPath();
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(pad.left + plotW, yy);
    ctx.stroke();
    ctx.fillText(fmtPrice(priceAtY(yy)).replace(" $", ""), pad.left + plotW + 8, yy + 4);
  }

  // etykiety czasu
  ctx.textAlign = "center";
  const tStep = Math.max(1, Math.ceil(span / 6));
  const longIv = ["1d", "1w", "1M"].includes(state.interval);
  for (let i = start; i < end; i += tStep) {
    const d = new Date(candles[i].t);
    const label = longIv
      ? d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: span > 300 ? "2-digit" : undefined })
      : d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    ctx.fillText(label, x(i), h - 8);
  }

  // wolumen
  if (maxV > 0) {
    const bw = Math.max(1, (plotW / span) * 0.6);
    for (let i = start; i < end; i++) {
      const c = candles[i];
      const vh = (c.v / maxV) * volH;
      ctx.fillStyle = c.c >= c.o ? up + "44" : down + "44";
      ctx.fillRect(x(i) - bw / 2, volY + volH - vh, bw, vh);
    }
  }

  // cena: świece albo linia
  if (state.chartType === "area") {
    ctx.beginPath();
    for (let i = start; i < end; i++) {
      i === start ? ctx.moveTo(x(i), y(candles[i].c)) : ctx.lineTo(x(i), y(candles[i].c));
    }
    ctx.strokeStyle = accent2;
    ctx.lineWidth = 2;
    ctx.stroke();
    const g = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    g.addColorStop(0, accent2 + "55");
    g.addColorStop(1, accent2 + "00");
    ctx.lineTo(x(end - 1), pad.top + plotH);
    ctx.lineTo(x(start), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  } else {
    const bw = Math.max(1, (plotW / span) * 0.62);
    for (let i = start; i < end; i++) {
      const c = candles[i];
      const col = c.c >= c.o ? up : down;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 1;
      if (bw > 2.5) {
        ctx.beginPath();
        ctx.moveTo(x(i), y(c.h));
        ctx.lineTo(x(i), y(c.l));
        ctx.stroke();
      }
      const yo = y(c.o), yc = y(c.c);
      ctx.fillRect(x(i) - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    }
  }

  // wskaźniki na cenie
  const closes = candles.map((c) => c.c);
  const drawLine = (vals, color) => {
    ctx.beginPath();
    let started = false;
    for (let i = start; i < end; i++) {
      if (vals[i] == null) continue;
      const yy = y(vals[i]);
      started ? ctx.lineTo(x(i), yy) : ctx.moveTo(x(i), yy);
      started = true;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  let ma = null, ema = null, rsi = null;
  if (state.indicators.ma20 && len > 20) { ma = calcSMA(closes, 20); drawLine(ma, MA_COL); }
  if (state.indicators.ema50 && len > 50) { ema = calcEMA(closes, 50); drawLine(ema, EMA_COL); }

  // panel RSI
  if (rsiH) {
    rsi = calcRSI(closes);
    ctx.strokeStyle = grid;
    ctx.strokeRect(pad.left, rsiY, plotW, rsiH);
    const ry = (v) => rsiY + (1 - v / 100) * rsiH;
    ctx.setLineDash([3, 3]);
    for (const lvl of [30, 70]) {
      ctx.beginPath();
      ctx.moveTo(pad.left, ry(lvl));
      ctx.lineTo(pad.left + plotW, ry(lvl));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = dim;
    ctx.textAlign = "left";
    ctx.fillText("RSI 14", pad.left + 6, rsiY + 12);
    ctx.fillText("70", pad.left + plotW + 8, ry(70) + 4);
    ctx.fillText("30", pad.left + plotW + 8, ry(30) + 4);
    ctx.beginPath();
    let started = false;
    for (let i = start; i < end; i++) {
      if (rsi[i] == null) continue;
      started ? ctx.lineTo(x(i), ry(rsi[i])) : ctx.moveTo(x(i), ry(rsi[i]));
      started = true;
    }
    ctx.strokeStyle = accent2;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // linia ostatniej ceny (gdy widać prawą krawędź)
  const last = candles[len - 1];
  if (end >= len) {
    const lyRaw = y(last.c);
    const ly = Math.max(pad.top, Math.min(pad.top + plotH, lyRaw));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = last.c >= last.o ? up : down;
    ctx.beginPath();
    ctx.moveTo(pad.left, ly);
    ctx.lineTo(pad.left + plotW, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = last.c >= last.o ? up : down;
    ctx.fillRect(pad.left + plotW + 2, ly - 9, pad.right - 6, 18);
    ctx.fillStyle = "#0a0e17";
    ctx.textAlign = "left";
    ctx.fillText(fmtPrice(last.c).replace(" $", ""), pad.left + plotW + 8, ly + 4);
  }

  // crosshair (pion + poziom z ceną)
  if (chart.hover != null && candles[chart.hover] && chart.hover >= start && chart.hover < end) {
    const i = chart.hover;
    ctx.strokeStyle = dim;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x(i), pad.top);
    ctx.lineTo(x(i), rsiH ? rsiY + rsiH : volY + volH);
    ctx.stroke();
    if (chart.hoverY != null && chart.hoverY >= pad.top && chart.hoverY <= pad.top + plotH) {
      ctx.beginPath();
      ctx.moveTo(pad.left, chart.hoverY);
      ctx.lineTo(pad.left + plotW, chart.hoverY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = dim;
      ctx.fillRect(pad.left + plotW + 2, chart.hoverY - 9, pad.right - 6, 18);
      ctx.fillStyle = cssVar("--bg") || "#0a0e17";
      ctx.textAlign = "left";
      ctx.fillText(fmtPrice(priceAtY(chart.hoverY)).replace(" $", ""), pad.left + plotW + 8, chart.hoverY + 4);
    }
    ctx.setLineDash([]);
  }

  updateLegend(ma, ema, rsi);
}

/* legenda OHLC (jak na platformach tradingowych) */
function updateLegend(ma, ema, rsi) {
  const el = document.getElementById("chart-legend");
  const candles = state.candles;
  if (!candles.length) { el.innerHTML = ""; return; }
  const i = chart.hover != null && candles[chart.hover] ? chart.hover : candles.length - 1;
  const c = candles[i];
  const chg = ((c.c - c.o) / c.o) * 100;
  const cls = chg >= 0 ? "up" : "down";
  const p = (v) => fmtPrice(v).replace(" $", "");
  let html =
    `<b>${state.selected ? state.selected.symbol.toUpperCase() + "/USDT" : ""}</b> · ${state.interval} ` +
    `&nbsp;O <span class="${cls}">${p(c.o)}</span> H <span class="${cls}">${p(c.h)}</span> ` +
    `L <span class="${cls}">${p(c.l)}</span> C <span class="${cls}">${p(c.c)}</span> ` +
    `<span class="${cls}">${fmtPct(chg)}</span>`;
  const parts = [];
  if (ma && ma[i] != null) parts.push(`<span class="ma">MA20 ${p(ma[i])}</span>`);
  if (ema && ema[i] != null) parts.push(`<span class="ema">EMA50 ${p(ema[i])}</span>`);
  if (rsi && rsi[i] != null) parts.push(`RSI ${nf(1, 1).format(rsi[i])}`);
  if (parts.length) html += `<br>${parts.join(" · ")}`;
  el.innerHTML = html;
}

function setupChartCanvas() {
  chart.canvas = document.getElementById("chart");
  chart.ctx = chart.canvas.getContext("2d");
  const canvas = chart.canvas;

  new ResizeObserver(() => drawChart()).observe(canvas.parentElement);
  document.addEventListener("fullscreenchange", () => setTimeout(drawChart, 60));

  const tip = document.getElementById("chart-tip");
  let drag = null;

  const idxAt = (clientX) => {
    const r = canvas.getBoundingClientRect();
    const g = chart.geom;
    if (!g) return null;
    const i = g.start + Math.floor(((clientX - r.left - chart.pad.left) / g.plotW) * g.span);
    return i >= 0 && i < state.candles.length ? i : null;
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (!state.candles.length) return;
    drag = { x: e.clientX, start: state.view.start, end: state.view.end, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!state.candles.length || !chart.geom) return;
    const g = chart.geom;

    if (drag) {
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) {
        drag.moved = true;
        canvas.classList.add("dragging");
        tip.hidden = true;
        chart.hover = null;
        const len = state.candles.length;
        const span = drag.end - drag.start;
        const shift = Math.round(dx / (g.plotW / span));
        let ns = Math.max(0, Math.min(drag.start - shift, len - span));
        state.view.start = ns;
        state.view.end = ns + span;
        state.follow = state.view.end >= len;
        drawChart();
      }
      return;
    }

    // crosshair + tooltip
    const r = canvas.getBoundingClientRect();
    const i = idxAt(e.clientX);
    if (i == null) { chart.hover = null; tip.hidden = true; drawChart(); return; }
    chart.hover = i;
    chart.hoverY = e.clientY - r.top;
    const c = state.candles[i];
    const d = new Date(c.t);
    const dir = c.c >= c.o ? "up" : "down";
    tip.innerHTML =
      `<strong>${d.toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</strong><br>
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

  const endDrag = () => {
    drag = null;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", () => {
    endDrag();
    chart.hover = null;
    chart.hoverY = null;
    tip.hidden = true;
    drawChart();
  });

  // zoom kółkiem wokół kursora
  canvas.addEventListener("wheel", (e) => {
    if (!state.candles.length) return;
    e.preventDefault();
    const anchor = idxAt(e.clientX) ?? state.view.end - 1;
    zoomBy(e.deltaY > 0 ? 1.18 : 1 / 1.18, anchor);
  }, { passive: false });
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
