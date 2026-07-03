#!/usr/bin/env bash
# Deploy wisnia.dev — kopiuje stronę na serwer i przeładowuje nginx.
# Użycie:
#   SSHPASS=... ./deploy.sh               # sam frontend
#   SSHPASS=... ./deploy.sh --with-nginx  # frontend + konfiguracja nginx
#   ./deploy.sh                           # przy skonfigurowanym kluczu SSH
set -euo pipefail

SERVER="root@185.235.69.108"
WEBROOT="/var/www/html"
FILES=(index.html 404.html style.css script.js robots.txt sitemap.xml)
NGINX_CONF="wisnia.dev.conf"
NGINX_DEST="/etc/nginx/sites-enabled/wisnia.dev.conf"

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
for f in "${FILES[@]}"; do
  sed "s/?v=dev/?v=${VERSION}/g" "$f" > "$STAGE/$f"
done

echo "==> Wersja: ${VERSION}"
echo "==> Czyszczenie ${WEBROOT}"
"${SSH_CMD[@]}" "$SERVER" "mkdir -p ${WEBROOT} && rm -rf ${WEBROOT:?}/*"

echo "==> Wysyłanie plików"
(cd "$STAGE" && "${SCP_CMD[@]}" "${FILES[@]}" "$SERVER:${WEBROOT}/")

if [[ "${1:-}" == "--with-nginx" ]]; then
  # backup poza sites-enabled — nginx includuje stamtąd wszystko, także *.bak
  echo "==> Aktualizacja konfiguracji nginx (backup: /etc/nginx/backup/)"
  "${SSH_CMD[@]}" "$SERVER" "mkdir -p /etc/nginx/backup && cp ${NGINX_DEST} /etc/nginx/backup/wisnia.dev.conf.\$(date +%Y%m%d%H%M%S) 2>/dev/null || true"
  "${SCP_CMD[@]}" "$NGINX_CONF" "$SERVER:${NGINX_DEST}"
fi

echo "==> Test i przeładowanie nginx"
"${SSH_CMD[@]}" "$SERVER" "nginx -t && systemctl reload nginx"

echo "==> Gotowe: https://wisnia.dev"
