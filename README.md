# wisnia.dev

Portfolio Tomasza Wiszniewskiego — czysty HTML/CSS/JS, bez build stepu.

## Funkcje

- **Dynamiczna sekcja GitHub** — publiczne repozytoria pobierane na żywo
  z GitHub API (nowe repo pojawiają się automatycznie), z cachem
  w `localStorage` (30 min) chroniącym przed limitem API.
- **Projekty live** — [metruj.pl](https://metruj.pl),
  [biuro.metruj.pl](https://biuro.metruj.pl), [autio.pl](https://autio.pl).
- Dark theme, animacje wejścia (`IntersectionObserver`),
  pełna responsywność, wsparcie `prefers-reduced-motion`.

## Struktura

| Plik | Rola |
|---|---|
| `index.html` | struktura strony |
| `style.css` | style (dark theme, animacje, RWD) |
| `script.js` | integracja z GitHub API + animacje |
| `deploy.sh` | deploy na serwer (nginx, `/var/www/html`) |

## Deploy

```bash
SSHPASS='<hasło>' ./deploy.sh   # przez sshpass
./deploy.sh                     # przy skonfigurowanym kluczu SSH
```

Serwer: nginx (Ubuntu), webroot `/var/www/html`, SSL przez Let's Encrypt.
