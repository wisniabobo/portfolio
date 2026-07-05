#!/usr/bin/env bash
# Deploy wisnia.dev — kopiuje stronę na serwer i przeładowuje nginx.
# Użycie:
#   SSHPASS=... ./deploy.sh               # sam frontend
#   SSHPASS=... ./deploy.sh --with-nginx  # frontend + konfiguracja nginx
#   ./deploy.sh                           # przy skonfigurowanym kluczu SSH
set -euo pipefail

SERVER="root@185.235.69.108"
WEBROOT="/var/www/html"
FILES=(index.html 404.html style.css script.js robots.txt sitemap.xml og.jpg)
WIZ_FILES=(wizytowka/index.html wizytowka/style.css)
DASH_ROOT="/var/www/dashboard"
DASH_FILES=(dashboard/index.html dashboard/style.css dashboard/script.js)
# saper.wisnia.dev.conf zostaje: sama subdomena przekierowuje na stronę główną
NGINX_CONFS=(wisnia.dev.conf dashboard.wisnia.dev.conf saper.wisnia.dev.conf)

SSH_CMD=(ssh -o StrictHostKeyChecking=accept-new)
# -O: legacy protokół scp — sshd na serwerze nie udostępnia subsystemu SFTP
SCP_CMD=(scp -O -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSHPASS:-}" ]]; then
  SSH_CMD=(sshpass -e "${SSH_CMD[@]}")
  SCP_CMD=(sshpass -e "${SCP_CMD[@]}")
fi

# cache-busting: ?v=dev -> ?v=<krótki hash commita>
VERSION=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/dashboard" "$STAGE/wizytowka"
for f in "${FILES[@]}" "${DASH_FILES[@]}" "${WIZ_FILES[@]}"; do
  case "$f" in
    *.jpg|*.png|*.ico) cp "$f" "$STAGE/$f" ;;
    *) sed "s/?v=dev/?v=${VERSION}/g" "$f" > "$STAGE/$f" ;;
  esac
done

echo "==> Wersja: ${VERSION}"
echo "==> Czyszczenie ${WEBROOT} i ${DASH_ROOT}"
"${SSH_CMD[@]}" "$SERVER" "mkdir -p ${WEBROOT} ${DASH_ROOT} && rm -rf ${WEBROOT:?}/* ${DASH_ROOT:?}/*"

echo "==> Wysyłanie plików"
(cd "$STAGE" && "${SCP_CMD[@]}" "${FILES[@]}" "$SERVER:${WEBROOT}/")
(cd "$STAGE" && "${SCP_CMD[@]}" -r wizytowka "$SERVER:${WEBROOT}/")
(cd "$STAGE/dashboard" && "${SCP_CMD[@]}" index.html style.css script.js "$SERVER:${DASH_ROOT}/")

if [[ "${1:-}" == "--with-nginx" ]]; then
  # backup poza sites-enabled — nginx includuje stamtąd wszystko, także *.bak
  echo "==> Aktualizacja konfiguracji nginx (backup: /etc/nginx/backup/)"
  STAMP=$(date +%Y%m%d%H%M%S)
  for conf in "${NGINX_CONFS[@]}"; do
    dest="/etc/nginx/sites-enabled/${conf}"
    "${SSH_CMD[@]}" "$SERVER" "mkdir -p /etc/nginx/backup && cp ${dest} /etc/nginx/backup/${conf}.${STAMP} 2>/dev/null || true"
    "${SCP_CMD[@]}" "$conf" "$SERVER:${dest}"
  done
fi

echo "==> Test i przeładowanie nginx"
"${SSH_CMD[@]}" "$SERVER" "nginx -t && systemctl reload nginx"

echo "==> Gotowe: https://wisnia.dev"
