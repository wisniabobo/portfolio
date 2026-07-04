/* ============================================================
   arcade — wspólne: motyw, zakładki gier, dźwięk, konfetti
   ============================================================ */

"use strict";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- motyw ---------- */

document.getElementById("theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch {}
});

/* ---------- zakładki gier (#saper / #2048) ---------- */

const tabs = document.querySelectorAll(".tab");

function showGame(game) {
  tabs.forEach((t) => {
    const active = t.dataset.game === game;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active);
  });
  document.querySelectorAll(".game-view").forEach((v) => {
    v.hidden = v.id !== `view-${game}`;
  });
  history.replaceState(null, "", game === "g2048" ? "#2048" : "#saper");
}

tabs.forEach((t) => t.addEventListener("click", () => showGame(t.dataset.game)));
if (location.hash === "#2048") showGame("g2048");

/* ---------- dźwięk (WebAudio, zero plików) ---------- */

const Sound = (() => {
  let ctx = null;
  let on = true;
  try { on = localStorage.getItem("arcade-sound") !== "off"; } catch {}

  const btn = document.getElementById("sound-toggle");
  const paint = () => (btn.textContent = on ? "🔊" : "🔇");
  paint();
  btn.addEventListener("click", () => {
    on = !on;
    try { localStorage.setItem("arcade-sound", on ? "on" : "off"); } catch {}
    paint();
    if (on) blip(660, 0.06);
  });

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function blip(freq, dur = 0.08, type = "sine", gain = 0.15, when = 0) {
    if (!on) return;
    try {
      const a = ac();
      const t = a.currentTime + when;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {}
  }

  function noise(dur = 0.25, gain = 0.25) {
    if (!on) return;
    try {
      const a = ac();
      const t = a.currentTime;
      const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = a.createBufferSource();
      src.buffer = buf;
      const g = a.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(g).connect(a.destination);
      src.start(t);
    } catch {}
  }

  return {
    reveal: () => blip(300 + Math.random() * 120, 0.05, "triangle", 0.08),
    flag: () => blip(820, 0.07, "sine", 0.12),
    unflag: () => blip(520, 0.06, "sine", 0.1),
    boom: () => { noise(0.4, 0.3); blip(70, 0.5, "sawtooth", 0.25); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.18, "triangle", 0.14, i * 0.11)),
    move: () => blip(180, 0.04, "triangle", 0.05),
    merge: (v) => blip(240 * Math.pow(1.12, Math.log2(v)), 0.09, "square", 0.09),
    combo: () => [660, 880, 1100].forEach((f, i) => blip(f, 0.1, "square", 0.1, i * 0.06)),
    over: () => [392, 330, 262].forEach((f, i) => blip(f, 0.2, "sine", 0.12, i * 0.15)),
  };
})();

/* ---------- wibracje (mobilna dopamina) ---------- */

function buzz(ms) {
  if (navigator.vibrate && !REDUCED_MOTION) navigator.vibrate(ms);
}

/* ---------- konfetti ---------- */

const CONF_COLORS = ["#e94560", "#7c5cff", "#3ddc84", "#ffc14d", "#4da3ff", "#e879f9"];

function confetti(count = 90) {
  if (REDUCED_MOTION) return;
  for (let i = 0; i < count; i++) {
    const c = document.createElement("span");
    c.className = "confetti";
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = CONF_COLORS[i % CONF_COLORS.length];
    c.style.animationDuration = `${1.8 + Math.random() * 2.2}s`;
    c.style.animationDelay = `${Math.random() * 0.6}s`;
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5000);
  }
}
