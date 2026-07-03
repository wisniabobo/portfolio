#!/usr/bin/env bash
# Deploy wisnia.dev — kopiuje stronę na serwer i przeładowuje nginx.
# Użycie: SSHPASS=... ./deploy.sh   (albo z kluczem SSH: ./deploy.sh)
set -euo pipefail

SERVER="root@185.235.69.108"
WEBROOT="/var/www/html"
FILES=(index.html style.css script.js)

SSH_CMD=(ssh -o StrictHostKeyChecking=accept-new)
# -O: legacy protokół scp — sshd na serwerze nie udostępnia subsystemu SFTP
SCP_CMD=(scp -O -o StrictHostKeyChecking=accept-new)
if [[ -n "${SSHPASS:-}" ]]; then
  SSH_CMD=(sshpass -e "${SSH_CMD[@]}")
  SCP_CMD=(sshpass -e "${SCP_CMD[@]}")
fi

echo "==> Czyszczenie ${WEBROOT}"
"${SSH_CMD[@]}" "$SERVER" "mkdir -p ${WEBROOT} && rm -rf ${WEBROOT:?}/*"

echo "==> Wysyłanie plików"
"${SCP_CMD[@]}" "${FILES[@]}" "$SERVER:${WEBROOT}/"

echo "==> Test i przeładowanie nginx"
"${SSH_CMD[@]}" "$SERVER" "nginx -t && systemctl reload nginx"

echo "==> Gotowe: https://wisnia.dev"
