/* ============================================================
   wisnia.dev — pobieranie repozytoriów z GitHub API
   - nowe publiczne repo pojawiają się automatycznie
   - cache w localStorage (30 min) chroni przed limitem API
   ============================================================ */

const GH_USER = "wisniabobo";
const CACHE_KEY = "gh-repos-v1";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minut

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

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "dzisiaj";
  if (days === 1) return "wczoraj";
  if (days < 30) return `${days} dni temu`;
  const months = Math.floor(days / 30);
  if (months === 1) return "miesiąc temu";
  if (months < 12) return `${months} mies. temu`;
  const years = Math.floor(months / 12);
  return years === 1 ? "rok temu" : `${years} lat temu`;
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, repos } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return repos;
  } catch {
    return null;
  }
}

function writeCache(repos) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), repos }));
  } catch {
    /* brak miejsca / tryb prywatny — trudno, po prostu bez cache */
  }
}

async function fetchRepos() {
  const cached = readCache();
  if (cached) return cached;

  const res = await fetch(
    `https://api.github.com/users/${GH_USER}/repos?sort=pushed&per_page=100`,
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (!res.ok) throw new Error(`GitHub API: ${res.status}`);

  const data = await res.json();
  // tylko to, czego używamy — mniejszy cache
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
  writeCache(repos);
  return repos;
}

function repoCard(repo) {
  const a = document.createElement("a");
  a.className = "repo-card reveal";
  a.href = repo.html_url;
  a.target = "_blank";
  a.rel = "noopener";

  const name = document.createElement("div");
  name.className = "repo-name";
  name.innerHTML =
    '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/></svg>';
  name.appendChild(document.createTextNode(repo.name));

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

  a.append(name, desc, meta);
  return a;
}

function renderStats(repos) {
  const stats = document.getElementById("gh-stats");
  document.getElementById("stat-repos").textContent = repos.length;
  document.getElementById("stat-stars").textContent = repos.reduce(
    (sum, r) => sum + r.stargazers_count,
    0
  );
  document.getElementById("stat-langs").textContent = new Set(
    repos.map((r) => r.language).filter(Boolean)
  ).size;
  stats.hidden = false;
}

function setupReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("visible");
          observer.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal:not(.visible)").forEach((el) => observer.observe(el));
}

async function init() {
  document.getElementById("year").textContent = new Date().getFullYear();
  setupReveal();

  const grid = document.getElementById("repo-grid");
  try {
    const repos = await fetchRepos();
    grid.innerHTML = "";
    repos.forEach((r) => grid.appendChild(repoCard(r)));
    renderStats(repos);
    setupReveal();
  } catch (err) {
    console.error(err);
    grid.innerHTML = "";
    document.getElementById("gh-error").hidden = false;
  }
}

init();
