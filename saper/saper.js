/* ============================================================
   Saper — pierwszy klik bezpieczny, flood fill, chording,
   długie przytrzymanie = flaga (dotyk), rekordy w localStorage.
   ============================================================ */

"use strict";

(() => {
  const DIFFS = {
    easy: { rows: 9, cols: 9, mines: 10, label: "Łatwy" },
    medium: { rows: 16, cols: 16, mines: 40, label: "Średni" },
    hard: { rows: 16, cols: 30, mines: 99, label: "Trudny" },
  };

  const boardEl = document.getElementById("ms-board");
  const minesEl = document.getElementById("ms-mines");
  const timerEl = document.getElementById("ms-timer");
  const faceEl = document.getElementById("ms-face");
  const bestEl = document.getElementById("ms-best");
  const flagModeBtn = document.getElementById("ms-flagmode");

  let diff = "easy";
  let grid = [];        // {mine, open, flag, n, el}
  let started = false;  // miny rozmieszczone
  let over = false;
  let flags = 0;
  let opened = 0;
  let timer = 0;
  let timerId = null;
  let flagMode = false;

  const R = () => DIFFS[diff].rows;
  const C = () => DIFFS[diff].cols;
  const M = () => DIFFS[diff].mines;
  const idx = (r, c) => r * C() + c;

  function* neighbors(r, c) {
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < R() && nc >= 0 && nc < C()) yield [nr, nc];
      }
  }

  /* ---------- cykl gry ---------- */

  function newGame() {
    stopTimer();
    grid = [];
    started = false;
    over = false;
    flags = 0;
    opened = 0;
    timer = 0;
    timerEl.textContent = "⏱ 0";
    faceEl.textContent = "🙂";
    minesEl.textContent = `💣 ${M()}`;
    paintBest();
    buildBoard();
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    boardEl.style.setProperty("--cols", C());
    fitCells();
    for (let r = 0; r < R(); r++) {
      for (let c = 0; c < C(); c++) {
        const el = document.createElement("button");
        el.className = "cell";
        el.setAttribute("aria-label", `pole ${r + 1}×${c + 1}`);
        bindCell(el, r, c);
        boardEl.appendChild(el);
        grid.push({ mine: false, open: false, flag: false, n: 0, el });
      }
    }
  }

  function fitCells() {
    const avail = Math.min(boardEl.parentElement.clientWidth || 320, 860) - 8;
    const size = Math.max(22, Math.min(36, Math.floor((avail - (C() - 1) * 3) / C())));
    boardEl.style.setProperty("--cell", size + "px");
  }
  window.addEventListener("resize", fitCells);

  function placeMines(safeR, safeC) {
    const forbidden = new Set([idx(safeR, safeC)]);
    for (const [nr, nc] of neighbors(safeR, safeC)) forbidden.add(idx(nr, nc));
    let placed = 0;
    while (placed < M()) {
      const i = Math.floor(Math.random() * grid.length);
      if (grid[i].mine || forbidden.has(i)) continue;
      grid[i].mine = true;
      placed++;
    }
    for (let r = 0; r < R(); r++)
      for (let c = 0; c < C(); c++) {
        let n = 0;
        for (const [nr, nc] of neighbors(r, c)) if (grid[idx(nr, nc)].mine) n++;
        grid[idx(r, c)].n = n;
      }
    started = true;
    startTimer();
  }

  function startTimer() {
    timerId = setInterval(() => {
      timer++;
      timerEl.textContent = `⏱ ${timer}`;
    }, 1000);
  }
  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

  /* ---------- interakcje ---------- */

  function bindCell(el, r, c) {
    let pressTimer = null;
    let longPressed = false;

    el.addEventListener("click", () => {
      if (longPressed) { longPressed = false; return; }
      if (flagMode && !grid[idx(r, c)].open) toggleFlag(r, c);
      else clickCell(r, c);
    });

    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      toggleFlag(r, c);
    });

    // długie przytrzymanie = flaga (dotyk)
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      pressTimer = setTimeout(() => {
        longPressed = true;
        toggleFlag(r, c);
        buzz(20);
      }, 320);
    });
    const cancel = () => clearTimeout(pressTimer);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointercancel", cancel);
  }

  function clickCell(r, c) {
    if (over) return;
    const cell = grid[idx(r, c)];
    if (cell.flag) return;
    if (cell.open) { chord(r, c); return; }
    if (!started) placeMines(r, c);
    if (cell.mine) { lose(r, c); return; }
    faceEl.textContent = "😮";
    setTimeout(() => !over && (faceEl.textContent = "🙂"), 250);
    reveal(r, c);
    Sound.reveal();
    checkWin();
  }

  function chord(r, c) {
    const cell = grid[idx(r, c)];
    if (!cell.n) return;
    let f = 0;
    for (const [nr, nc] of neighbors(r, c)) if (grid[idx(nr, nc)].flag) f++;
    if (f !== cell.n) return;
    for (const [nr, nc] of neighbors(r, c)) {
      const n = grid[idx(nr, nc)];
      if (n.open || n.flag) continue;
      if (n.mine) { lose(nr, nc); return; }
      reveal(nr, nc);
    }
    Sound.reveal();
    checkWin();
  }

  // BFS z opóźnieniem animacji rosnącym z falą
  function reveal(r0, c0) {
    const queue = [[r0, c0, 0]];
    const seen = new Set([idx(r0, c0)]);
    while (queue.length) {
      const [r, c, d] = queue.shift();
      const cell = grid[idx(r, c)];
      if (cell.open || cell.flag || cell.mine) continue;
      cell.open = true;
      opened++;
      cell.el.classList.add("open");
      cell.el.style.setProperty("--d", `${Math.min(d * 0.02, 0.4)}s`);
      if (cell.n) {
        cell.el.textContent = cell.n;
        cell.el.classList.add(`n${cell.n}`);
      } else {
        for (const [nr, nc] of neighbors(r, c)) {
          const i = idx(nr, nc);
          if (!seen.has(i)) { seen.add(i); queue.push([nr, nc, d + 1]); }
        }
      }
    }
  }

  function toggleFlag(r, c) {
    if (over) return;
    const cell = grid[idx(r, c)];
    if (cell.open) return;
    cell.flag = !cell.flag;
    flags += cell.flag ? 1 : -1;
    cell.el.textContent = cell.flag ? "🚩" : "";
    cell.el.classList.toggle("flagged", cell.flag);
    minesEl.textContent = `💣 ${M() - flags}`;
    cell.flag ? Sound.flag() : Sound.unflag();
  }

  /* ---------- koniec gry ---------- */

  function lose(r, c) {
    over = true;
    stopTimer();
    faceEl.textContent = "💀";
    Sound.boom();
    buzz([60, 40, 80]);
    boardEl.classList.add("shake");
    setTimeout(() => boardEl.classList.remove("shake"), 550);
    grid.forEach((cell) => {
      if (cell.mine && !cell.flag) {
        cell.el.textContent = "💣";
        cell.el.classList.add("mine");
      }
      if (!cell.mine && cell.flag) cell.el.classList.add("wrong");
    });
    grid[idx(r, c)].el.classList.add("mine-src");
  }

  function checkWin() {
    if (opened !== R() * C() - M()) return;
    over = true;
    stopTimer();
    faceEl.textContent = "😎";
    grid.forEach((cell) => {
      if (cell.mine && !cell.flag) {
        cell.el.textContent = "🚩";
        cell.el.classList.add("flagged");
      }
    });
    minesEl.textContent = "💣 0";
    Sound.win();
    buzz([30, 30, 30, 30, 60]);
    confetti();
    saveBest();
  }

  /* ---------- rekordy ---------- */

  const bestKey = () => `ms-best-${diff}`;

  function saveBest() {
    try {
      const prev = Number(localStorage.getItem(bestKey())) || Infinity;
      if (timer < prev) localStorage.setItem(bestKey(), timer);
    } catch {}
    paintBest();
  }

  function paintBest() {
    let best = null;
    try { best = localStorage.getItem(bestKey()); } catch {}
    bestEl.textContent = best ? `🏆 rekord (${DIFFS[diff].label.toLowerCase()}): ${best}s` : "";
  }

  /* ---------- sterowanie ---------- */

  document.querySelectorAll("[data-diff]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-diff]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      diff = btn.dataset.diff;
      newGame();
    });
  });

  faceEl.addEventListener("click", newGame);

  flagModeBtn.addEventListener("click", () => {
    flagMode = !flagMode;
    flagModeBtn.setAttribute("aria-pressed", flagMode);
  });

  newGame();
})();
