#!/bin/bash
# Script to update the application in production
# Ejecutar desde la raíz del proyecto
# Debe ser ejecutado como usuario con acceso de escritura en /opt/ruleta-TOTAL
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Update ruleta-TOTAL ==="

echo "1. Obteniendo últimos cambios..."
git pull

if [ $? -ne 0 ]; then
  echo "¡Error al obtener cambios del repositorio!"
  exit 1
fi

echo "2. Instalando dependencias..."
npm ci

if [ $? -ne 0 ]; then
  echo "¡Error instalando dependencias!"
  exit 1
fi

echo "3. Compilando frontend..."
npm run build

if [ $? -ne 0 ]; then
  echo "¡Error compila frontend!"
  exit 1
fi

echo "4. Compilando backend..."
npm run build:backend

if [ $? -ne 0 ]; then
  echo "¡Error compila backend!"
  exit 1
fi

echo "5. Reiniciando backend..."
# Detener el backend (servicio PM2, systemd, o script directo)
if [ -f /var/run/ruleta-backend.pid ]; then
  kill -TERM $(cat /var/run/ruleta-backend.pid)
  rm -f /var/run/ruleta-backend.pid
elif pgrep -f "node backend/dist/server.js" > /dev/null; then
  pkill -f "node backend/dist/server.js"
fi

# Iniciar el backend como servicio (PM2, systemd, o directo)
# El administrador debe configurar cómo reiniciar en su entorno

echo "=== Update completado ==="
echo "El backend debe ser reiniciado por el administrador del VPS según su sistema de gestión de procesos."
