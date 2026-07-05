/* ============================================================
   wisnia.dev — logika strony
   - repozytoria + aktywność na żywo z GitHub API
   - cache w localStorage chroni przed limitem API
   - motyw, typing, spotlight, tilt, liczniki, reveal
   ============================================================ */

const GH_USER = "wisniabobo";
const REPO_CACHE_KEY = "gh-repos-v2";
const EVENTS_CACHE_KEY = "gh-events-v1";
const REPO_TTL_MS = 30 * 60 * 1000; // 30 minut
const EVENTS_TTL_MS = 10 * 60 * 1000; // 10 minut

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const LANG_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Python: "#3572A5",
  PHP: "#4F5D95",
  Java: "#b07219",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Go: "#00ADD8",
  Rust: "#dea584",
  Shell: "#89e051",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Dart: "#00B4AB",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
};

/* ---------- narzędzia ---------- */

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? "przed chwilą" : `${mins} min temu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? "godzinę temu" : `${hours} godz. temu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "wczoraj";
  if (days < 30) return `${days} dni temu`;
  const months = Math.floor(days / 30);
  if (months === 1) return "miesiąc temu";
  if (months < 12) return `${months} mies. temu`;
  const years = Math.floor(months / 12);
  return years === 1 ? "rok temu" : `${years} lat temu`;
}

function cacheRead(key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) return null;
    return data;
  } catch {
    return null;
  }
}

function cacheWrite(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* tryb prywatny / brak miejsca — działamy bez cache */
  }
}

async function ghFetch(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json();
}

/* ---------- motyw ---------- */

function setupTheme() {
  const btn = document.getElementById("theme-toggle");
  btn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
  });
}

/* ---------- pasek postępu scrolla ---------- */

function setupScrollProgress() {
  const bar = document.querySelector(".scroll-progress");
  let ticking = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = max > 0 ? `${(scrollY / max) * 100}%` : "0";
    ticking = false;
  };
  addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
  update();
}

/* ---------- typowany podtytuł ---------- */

function setupTyping() {
  const el = document.getElementById("typed");
  const words = [
    "portale ogłoszeniowe",
    "strony firmowe",
    "aplikacje webowe",
    "narzędzia dla biznesu",
  ];
  if (REDUCED_MOTION) return; // zostaje statyczny pierwszy wpis

  let wordIdx = 0;
  let charIdx = words[0].length;
  let deleting = true;

  function tick() {
    const word = words[wordIdx];
    charIdx += deleting ? -1 : 1;
    el.textContent = word.slice(0, charIdx);

    let delay = deleting ? 45 : 85;
    if (!deleting && charIdx === word.length) {
      delay = 2600; // pauza na przeczytanie
      deleting = true;
    } else if (deleting && charIdx === 0) {
      wordIdx = (wordIdx + 1) % words.length;
      deleting = false;
      delay = 350;
    }
    setTimeout(tick, delay);
  }
  setTimeout(tick, 2200);
}

/* ---------- spotlight na kartach ---------- */

function attachSpotlight(scope = document) {
  scope.querySelectorAll(".glow-card").forEach((card) => {
    if (card.dataset.spot) return;
    card.dataset.spot = "1";
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });
}

/* ---------- delikatny tilt 3D ---------- */

function attachTilt(scope = document) {
  if (REDUCED_MOTION || !matchMedia("(hover: hover)").matches) return;
  scope.querySelectorAll(".tilt").forEach((card) => {
    if (card.dataset.tilt) return;
    card.dataset.tilt = "1";
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const rx = ((e.clientY - r.top) / r.height - 0.5) * -6;
      const ry = ((e.clientX - r.left) / r.width - 0.5) * 6;
      card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
    });
    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  });
}

/* ---------- animowane liczniki ---------- */

function animateCount(el, target) {
  if (REDUCED_MOTION || target === 0) {
    el.textContent = target;
    return;
  }
  const duration = 900;
  const start = performance.now();
  function frame(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))); // ease-out
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------- animacje wejścia ---------- */

const revealObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        revealObserver.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12 }
);

function setupReveal(scope = document) {
  scope.querySelectorAll(".reveal:not(.visible)").forEach((el) => revealObserver.observe(el));
}

/* ---------- GitHub: repozytoria ---------- */

async function fetchRepos() {
  const cached = cacheRead(REPO_CACHE_KEY, REPO_TTL_MS);
  if (cached) return cached;

  const data = await ghFetch(`/users/${GH_USER}/repos?sort=pushed&per_page=100`);
  const repos = data
    .filter((r) => !r.fork && !r.archived)
    .map((r) => ({
      name: r.name,
      description: r.description,
      html_url: r.html_url,
      language: r.language,
      stargazers_count: r.stargazers_count,
      pushed_at: r.pushed_at,
    }));
  cacheWrite(REPO_CACHE_KEY, repos);
  return repos;
}

// działające dema aplikacji hostowane na GitHub Pages
const DEMOS = {
  "ekw": "https://wisniabobo.github.io/ekw/",
  "Ustr-j-Organ-w-Ochrony-Prawnej": "https://wisniabobo.github.io/Ustr-j-Organ-w-Ochrony-Prawnej/",
  "etyka-prawnicza": "https://wisniabobo.github.io/etyka-prawnicza/",
};

function repoCard(repo) {
  const card = document.createElement("div");
  card.className = "repo-card glow-card reveal";
  // cała karta klikalna, ale linki w środku mają pierwszeństwo
  card.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    window.open(repo.html_url, "_blank", "noopener");
  });

  const name = document.createElement("div");
  name.className = "repo-name";
  name.innerHTML =
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>';
  const nameLink = document.createElement("a");
  nameLink.href = repo.html_url;
  nameLink.target = "_blank";
  nameLink.rel = "noopener";
  nameLink.textContent = repo.name;
  name.appendChild(nameLink);

  const desc = document.createElement("p");
  desc.className = "repo-desc";
  desc.textContent = repo.description || "Brak opisu — ale kod mówi sam za siebie.";

  const meta = document.createElement("div");
  meta.className = "repo-meta";

  if (repo.language) {
    const lang = document.createElement("span");
    lang.className = "lang";
    const dot = document.createElement("span");
    dot.className = "lang-dot";
    dot.style.background = LANG_COLORS[repo.language] || "#9aa4b8";
    lang.append(dot, document.createTextNode(repo.language));
    meta.appendChild(lang);
  }

  if (repo.stargazers_count > 0) {
    const stars = document.createElement("span");
    stars.textContent = `★ ${repo.stargazers_count}`;
    meta.appendChild(stars);
  }

  const updated = document.createElement("span");
  updated.textContent = `aktualizacja: ${timeAgo(repo.pushed_at)}`;
  meta.appendChild(updated);

  card.append(name, desc, meta);

  if (DEMOS[repo.name]) {
    const demo = document.createElement("a");
    demo.className = "repo-demo";
    demo.href = DEMOS[repo.name];
    demo.target = "_blank";
    demo.rel = "noopener";
    demo.innerHTML = "▶ Zobacz demo na żywo <span class=\"arrow\">→</span>";
    card.appendChild(demo);
  }

  return card;
}

function renderStats(repos) {
  const stats = document.getElementById("gh-stats");
  stats.hidden = false;
  const totals = {
    "stat-repos": repos.length,
    "stat-stars": repos.reduce((s, r) => s + r.stargazers_count, 0),
    "stat-langs": new Set(repos.map((r) => r.language).filter(Boolean)).size,
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        animateCount(e.target, totals[e.target.id]);
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.5 });
  Object.keys(totals).forEach((id) => io.observe(document.getElementById(id)));
}

function renderLangBar(repos) {
  const counts = {};
  repos.forEach((r) => {
    if (r.language) counts[r.language] = (counts[r.language] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return;

  const total = entries.reduce((s, [, n]) => s + n, 0);
  const bar = document.getElementById("lang-bar");
  const legend = document.getElementById("lang-legend");

  for (const [lang, n] of entries) {
    const pct = (n / total) * 100;
    const seg = document.createElement("span");
    seg.style.width = `${pct}%`;
    seg.style.background = LANG_COLORS[lang] || "#9aa4b8";
    seg.title = `${lang}: ${pct.toFixed(0)}%`;
    bar.appendChild(seg);

    const item = document.createElement("span");
    item.className = "lang";
    const dot = document.createElement("span");
    dot.className = "lang-dot";
    dot.style.background = LANG_COLORS[lang] || "#9aa4b8";
    item.append(dot, document.createTextNode(`${lang} ${pct.toFixed(0)}%`));
    legend.appendChild(item);
  }
  document.getElementById("lang-bar-wrap").hidden = false;
}

/* ---------- GitHub: ostatnia aktywność ---------- */

const EVENT_LABELS = {
  PushEvent: (e) => {
    const n = e.payload?.commits?.length || 1;
    return `wypchnięcie ${n} ${n === 1 ? "commita" : "commitów"} do`;
  },
  CreateEvent: (e) =>
    e.payload?.ref_type === "repository" ? "utworzenie repozytorium" : "utworzenie gałęzi w",
  PublicEvent: () => "upublicznienie repozytorium",
  WatchEvent: () => "gwiazdka dla",
  ForkEvent: () => "fork repozytorium",
  ReleaseEvent: () => "nowe wydanie w",
  IssuesEvent: () => "aktywność w issues:",
  PullRequestEvent: () => "pull request w",
};

async function fetchEvents() {
  const cached = cacheRead(EVENTS_CACHE_KEY, EVENTS_TTL_MS);
  if (cached) return cached;

  const data = await ghFetch(`/users/${GH_USER}/events/public?per_page=30`);
  const events = data
    .filter((e) => EVENT_LABELS[e.type])
    .slice(0, 6)
    .map((e) => ({
      label: EVENT_LABELS[e.type](e),
      repo: e.repo.name.replace(`${GH_USER}/`, ""),
      url: `https://github.com/${e.repo.name}`,
      created_at: e.created_at,
    }));
  cacheWrite(EVENTS_CACHE_KEY, events);
  return events;
}

function renderActivity(events) {
  if (!events.length) return;
  const list = document.getElementById("activity-list");
  for (const ev of events) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = ev.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = ev.repo;
    const time = document.createElement("time");
    time.textContent = ` · ${timeAgo(ev.created_at)}`;
    li.append(`${ev.label} `, link, time);
    list.appendChild(li);
  }
  document.getElementById("activity").hidden = false;
}

/* ---------- easter egg 🍒 ---------- */

function setupCherryRain() {
  const drop = () => {
    if (REDUCED_MOTION) return;
    for (let i = 0; i < 14; i++) {
      const c = document.createElement("span");
      c.className = "falling-cherry";
      c.textContent = "🍒";
      c.style.left = `${Math.random() * 100}vw`;
      c.style.fontSize = `${14 + Math.random() * 22}px`;
      c.style.animationDuration = `${2.2 + Math.random() * 2.5}s`;
      c.style.animationDelay = `${Math.random() * 0.8}s`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 6000);
    }
  };
  document.getElementById("cherry")?.addEventListener("click", drop);
}

/* ---------- start ---------- */

async function init() {
  document.getElementById("year").textContent = new Date().getFullYear();
  setupTheme();
  setupScrollProgress();
  setupTyping();
  setupCherryRain();
  setupReveal();
  attachSpotlight();
  attachTilt();

  const grid = document.getElementById("repo-grid");
  try {
    const repos = await fetchRepos();
    grid.innerHTML = "";
    repos.forEach((r) => grid.appendChild(repoCard(r)));
    renderStats(repos);
    renderLangBar(repos);
    setupReveal();
    attachSpotlight();
  } catch (err) {
    console.error(err);
    grid.innerHTML = "";
    document.getElementById("gh-error").hidden = false;
  }

  // aktywność jest bonusem — cichy fallback
  try {
    renderActivity(await fetchEvents());
    setupReveal();
  } catch (err) {
    console.warn("Aktywność GitHub niedostępna:", err);
  }
}

init();
