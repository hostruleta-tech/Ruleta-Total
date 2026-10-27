#!/bin/bash
# Health check básico para verificar que backend responde
# Ejemplo de uso: curl -f -s -o /dev/null https://ruleta-tudominio.com/api/health || exit 1
URL="${HEALTH_URL:-http://localhost:3001/api/health}"
curl -sf "${URL}" > /dev/null || { echo "Health check falló: ${URL}"; exit 1; }
echo "Health OK"
