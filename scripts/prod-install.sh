#!/bin/bash
# Instalación limpia para producción (VPS Ubuntu 24.04 + OLS)
set -euo pipefail

cd "$(dirname "$0")/.."
echo "=== Install ==="
npm ci || { echo "npm ci falló"; exit 1; }
echo "=== Build ==="
npm run build || { echo "frontend build falló"; exit 1; }
npm run build:backend || { echo "backend build falló"; exit 1; }
echo "=== Check env ==="
if [ ! -f ".env" ]; then
  echo "Falta .env — copiar .env.example y completar valores reales"
  exit 1
fi
echo "=== OK ==="
