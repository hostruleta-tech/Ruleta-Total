#!/bin/bash
# Inicio del backend en modo producción standalone
# Se recomienda usar este script con un servicio persistente (systemd / PM2 / panel)
set -euo pipefail

cd "$(dirname "$0")/.."
export NODE_ENV=production
node backend/dist/server.js
