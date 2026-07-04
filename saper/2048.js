/* ============================================================
   2048 — płynne animacje kafelków (transform), combo,
   swipe na dotyku, rekord w localStorage.
   ============================================================ */

"use strict";

(() => {
  const N = 4;
  const boardEl = document.getElementById("g48-board");
  const tilesEl = document.getElementById("g48-tiles");
  const bgEl = boardEl.querySelector(".g48-bg");
  const scoreEl = document.getElementById("g48-score");
  const bestEl = document.getElementById("g48-best");
  const popEl = document.getElementById("g48-pop");
  const comboEl = document.getElementById("g48-combo");
  const overlay = document.getElementById("g48-overlay");
  const overlayText = document.getElementById("g48-overlay-text");
  const continueBtn = document.getElementById("g48-continue");

  // tło 4×4
  for (let i = 0; i < N * N; i++) {
    const d = document.createElement("div");
    d.className = "g48-cell";
    bgEl.appendChild(d);
  }

  let tiles = [];      // {id, v, r, c, el}
  let nextId = 1;
  let score = 0;
  let best = 0;
  let won = false;     // pokazano overlay 2048
  let keepGoing = false;
  let locked = false;  // blokada w trakcie animacji

  try { best = Number(localStorage.getItem("g48-best")) || 0; } catch {}
  bestEl.textContent = best;

  /* ---------- pozycjonowanie ---------- */

  function transformOf(r, c) {
    return `translate(calc(${c} * (var(--size) + var(--gap))), calc(${r} * (var(--size) + var(--gap))))`;
  }

  function place(tile, animate = true) {
    const tr = transformOf(tile.r, tile.c);
    tile.el.style.setProperty("--tr", tr);
    if (!animate) tile.el.style.transition = "none";
    tile.el.style.transform = tr;
    if (!animate) requestAnimationFrame(() => (tile.el.style.transition = ""));
  }

  function makeTile(v, r, c, isNew = true) {
    const el = document.createElement("div");
    el.className = "tile" + (isNew ? " new" : "");
    el.dataset.v = v <= 2048 ? v : "big";
    if (v > 2048) el.classList.add("big");
    el.textContent = v;
    tilesEl.appendChild(el);
    const tile = { id: nextId++, v, r, c, el };
    place(tile, false);
    return tile;
  }

  function setValue(tile, v) {
    tile.v = v;
    tile.el.textContent = v;
    tile.el.dataset.v = v <= 2048 ? v : "big";
    tile.el.classList.toggle("big", v > 2048);
  }

  /* ---------- gra ---------- */

  function newGame() {
    tilesEl.innerHTML = "";
    tiles = [];
    score = 0;
    won = false;
    keepGoing = false;
    locked = false;
    scoreEl.textContent = "0";
    overlay.hidden = true;
    spawn();
    spawn();
  }

  function cellAt(r, c) {
    return tiles.find((t) => t.r === r && t.c === c) || null;
  }

  function spawn() {
    const empty = [];
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) if (!cellAt(r, c)) empty.push([r, c]);
    if (!empty.length) return;
    const [r, c] = empty[Math.floor(Math.random() * empty.length)];
    tiles.push(makeTile(Math.random() < 0.9 ? 2 : 4, r, c));
  }

  // kolejność przechodzenia pól zależnie od kierunku
  function traversal(dr, dc) {
    const rs = [...Array(N).keys()], cs = [...Array(N).keys()];
    if (dr === 1) rs.reverse();
    if (dc === 1) cs.reverse();
    return { rs, cs };
  }

  function move(dr, dc) {
    if (locked || !overlay.hidden) return;
    const { rs, cs } = traversal(dr, dc);
    let moved = false;
    let gained = 0;
    let merges = 0;
    let maxMerged = 0;
    const mergedIds = new Set();
    const toRemove = [];

    for (const r of rs) {
      for (const c of cs) {
        const tile = cellAt(r, c);
        if (!tile) continue;
        let nr = tile.r, nc = tile.c;
        // przesuwaj dopóki puste
        while (true) {
          const tr = nr + dr, tc = nc + dc;
          if (tr < 0 || tr >= N || tc < 0 || tc >= N) break;
          const target = cellAt(tr, tc);
          if (target && !toRemove.includes(target)) {
            // łączenie: równe wartości, cel jeszcze nie łączony w tym ruchu
            if (target.v === tile.v && !mergedIds.has(target.id)) {
              nr = tr; nc = tc;
              tile.r = -1; tile.c = -1; // zdejmij z siatki na czas skanu
              const newV = target.v * 2;
              gained += newV;
              merges++;
              maxMerged = Math.max(maxMerged, newV);
              mergedIds.add(target.id);
              // animacja: dojedź pod target, potem podbij target
              tile.r = nr; tile.c = nc;
              place(tile);
              toRemove.push(tile);
              setTimeout(() => {
                setValue(target, newV);
                target.el.classList.remove("merged");
                void target.el.offsetWidth;
                target.el.classList.add("merged");
              }, 120);
              moved = true;
            }
            break;
          }
          nr = tr; nc = tc;
        }
        if (!toRemove.includes(tile) && (nr !== tile.r || nc !== tile.c)) {
          tile.r = nr; tile.c = nc;
          place(tile);
          moved = true;
        }
      }
    }

    if (!moved) return;
    locked = true;
    Sound.move();

    setTimeout(() => {
      // sprzątanie połkniętych kafelków
      toRemove.forEach((t) => {
        t.el.remove();
        tiles.splice(tiles.indexOf(t), 1);
      });

      if (gained) {
        score += gained;
        scoreEl.textContent = score;
        popEl.textContent = `+${gained}`;
        popEl.classList.remove("show");
        void popEl.offsetWidth;
        popEl.classList.add("show");
        Sound.merge(maxMerged);
        buzz(maxMerged >= 128 ? 25 : 10);
        if (best < score) {
          best = score;
          bestEl.textContent = best;
          try { localStorage.setItem("g48-best", best); } catch {}
        }
      }
      if (merges >= 2) {
        comboEl.textContent = `COMBO ×${merges}`;
        comboEl.hidden = false;
        comboEl.style.animation = "none";
        void comboEl.offsetWidth;
        comboEl.style.animation = "";
        Sound.combo();
        setTimeout(() => (comboEl.hidden = true), 900);
      }

      spawn();

      if (!won && !keepGoing && tiles.some((t) => t.v >= 2048)) {
        won = true;
        overlayText.textContent = "🎉 2048! Wygrana!";
        continueBtn.hidden = false;
        overlay.hidden = false;
        Sound.win();
        confetti(120);
      } else if (isGameOver()) {
        overlayText.textContent = "💀 Koniec gry";
        continueBtn.hidden = true;
        overlay.hidden = false;
        Sound.over();
      }
      locked = false;
    }, 140);
  }

  function isGameOver() {
    if (tiles.length < N * N) return false;
    for (const t of tiles) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const nb = cellAt(t.r + dr, t.c + dc);
        if (nb && nb.v === t.v) return false;
      }
    }
    return true;
  }

  /* ---------- sterowanie ---------- */

  const KEYS = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
  };

  document.addEventListener("keydown", (e) => {
    const dir = KEYS[e.key];
    if (!dir) return;
    // tylko gdy widok 2048 aktywny
    if (document.getElementById("view-g2048").hidden) return;
    e.preventDefault();
    move(dir[0], dir[1]);
  });

  let touchStart = null;
  boardEl.addEventListener("pointerdown", (e) => {
    touchStart = { x: e.clientX, y: e.clientY };
  });
  boardEl.addEventListener("pointerup", (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(0, dx > 0 ? 1 : -1);
    else move(dy > 0 ? 1 : -1, 0);
  });

  document.getElementById("g48-new").addEventListener("click", newGame);
  document.getElementById("g48-retry").addEventListener("click", newGame);
  continueBtn.addEventListener("click", () => {
    keepGoing = true;
    overlay.hidden = true;
  });

  newGame();
})();
