# wisnia.dev

Portfolio Tomasza Wiszniewskiego — czysty HTML/CSS/JS, bez frameworków
i bez build stepu.

## Funkcje

- **Dynamiczna sekcja GitHub** — publiczne repozytoria, statystyki,
  pasek udziału języków i feed ostatniej aktywności pobierane na żywo
  z GitHub API (nowe repo pojawiają się automatycznie). Cache
  w `localStorage` (repo 30 min, aktywność 10 min) chroni przed limitem API.
- **Projekty live** — [metruj.pl](https://metruj.pl),
  [biuro.metruj.pl](https://biuro.metruj.pl), [autio.pl](https://autio.pl).
- **Motyw ciemny/jasny** z zapisem wyboru (ustawiany przed pierwszym
  renderem — bez mignięcia).
- Typowany podtytuł, spotlight za kursorem, tilt 3D, animowane liczniki,
  pasek postępu scrolla, marquee stacku, animacje wejścia.
- Pełne RWD, `prefers-reduced-motion`, easter egg 🍒 w stopce.
- **SEO**: JSON-LD (Person), canonical, OG, `sitemap.xml`, `robots.txt`,
  własna strona 404.

## Dashboard — dashboard.wisnia.dev

Rynek kryptowalut na żywo (katalog `dashboard/`):

- **Binance WebSocket** — ceny tykające w czasie rzeczywistym (taśma,
  tabela z flashami, nagłówek wykresu), auto-reconnect z backoffem.
- **Własny wykres na `<canvas>`** — świece + linia, wolumen, crosshair
  z tooltipem OHLC, live-aktualizacja ostatniej świecy (stream kline),
  interwały 15m–1T.
- **CoinGecko** — kapitalizacja, dominacja BTC (donut), top 20 monet
  ze sparkline'ami, sortowanie, wyszukiwarka; cache ze stale-fallbackiem.
- **Fear & Greed** (alternative.me) na wskaźniku SVG.

## Arcade — saper.wisnia.dev

Dwie gry bez frameworków (katalog `saper/`):

- **Saper** — bezpieczny pierwszy klik, flood fill z animacją kaskadową,
  chording, 3 poziomy, tryb flag + długie przytrzymanie na dotyku,
  rekordy czasu per poziom.
- **2048** — animacje na transform, COMBO za wielokrotne łączenia,
  swipe na mobile, rekord punktów.
- Wspólne: dźwięki syntezowane Web Audio (bez plików), wibracje,
  konfetti, motyw ciemny/jasny, zakładki z hash-routingiem.

## Struktura

| Plik | Rola |
|---|---|
| `index.html` | struktura strony + meta/JSON-LD |
| `style.css` | style (motywy, animacje, RWD) |
| `script.js` | GitHub API, motyw, typing, spotlight, tilt, liczniki |
| `404.html` | strona błędu (nginx `error_page`) |
| `wisnia.dev.conf` | konfiguracja nginx (nagłówki bezpieczeństwa, gzip, cache) |
| `deploy.sh` | deploy z cache-bustingiem `?v=<hash commita>` |

## Deploy

```bash
SSHPASS='<hasło>' ./deploy.sh               # sam frontend
SSHPASS='<hasło>' ./deploy.sh --with-nginx  # frontend + konfiguracja nginx
./deploy.sh                                 # przy skonfigurowanym kluczu SSH
```

Serwer: nginx (Ubuntu), webroot `/var/www/html`, SSL Let's Encrypt.
Backupy konfiguracji nginx lądują w `/etc/nginx/backup/` (celowo poza
`sites-enabled`, bo nginx includuje stamtąd każdy plik).
