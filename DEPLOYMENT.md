# DEPLOYMENT.md � Ruleta TOTAL (Vercel + Turso)

## 1. Arquitectura

- **Frontend + Backend:** Monorepo desplegado en **Vercel** (una sola app)
- **Base de datos:** **Turso (libSQL)** - SQLite serverless, r�plicas globales
- **DNS:** Dominio personalizado apuntando a Vercel

## 2. Requisitos previos

- Cuenta en [Vercel](https://vercel.com)
- Cuenta en [Turso](https://turso.tech) (gratis hasta 500 DBs)
- CLI de Turso instalado: `curl -sSfL https://get.turso.tech/install.sh | bash`

## 3. Crear base de datos en Turso

```bash
# Crear la base de datos
turso db create ruleta-prod

# Obtener URL de conexi�n
turso db show ruleta-prod --url

# Crear token de autenticaci�n
turso db tokens create ruleta-prod
```

Guardar la **URL** (formato `libsql://...`) y el **token**.

## 4. Variables de entorno

### Frontend (configurar en Vercel Dashboard ? Settings ? Environment Variables)

| Variable | Valor | Descripci�n |
|----------|-------|-------------|
| `VITE_API_URL` | `/api` | En Vercel, el backend est� en el mismo dominio |
| `VITE_BASE_PATH` | `/` | Cambiar si se despliega en subdirectorio |

### Backend (configurar en Vercel Dashboard ? Settings ? Environment Variables)

| Variable | Valor | Descripci�n |
|----------|-------|-------------|
| `TURSO_DATABASE_URL` (o `DATABASE_URL`) | `libsql://ruleta-prod-usuario.turso.io` | URL de Turso. El c�digo acepta cualquiera de los dos nombres; define solo uno |
| `TURSO_AUTH_TOKEN` | `eyJ...` | Token de autenticaci�n de Turso |
| `OPERATOR_PASSWORD` | `contrase�a_segura` | Password para panel de operador |
| `SESSION_SECRET` | `32_bytes_hex` | Generar: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `TICKET_ENCRYPTION_KEY` | `32_bytes_base64` | Generar: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `PUBLIC_APP_URL` | `https://tudominio.com` | OPCIONAL: solo para URLs absolutas de QR. Si falta, en Vercel se usa `VERCEL_PROJECT_PRODUCTION_URL` autom�ticamente |
| `NODE_ENV` | `production` | Forzado en producci�n |

**?? IMPORTANTE:** Nunca subir archivos `.env` al repositorio. Todas las variables secretas se configuran en Vercel Dashboard.

## 5. Despliegue en Vercel

### Opci�n A: Desde Vercel Dashboard (recomendado)

1. Ir a [Vercel Dashboard](https://vercel.com/dashboard)
2. **Add New...** ? **Project**
3. Importar repositorio de GitHub/GitLab/Bitbucket
4. **Framework Preset:** Other
5. **Build Command:** `npm run build:backend && npm run build:frontend`
6. **Output Directory:** `dist`
7. **Install Command:** `npm ci`
8. Configurar **Environment Variables** (ver secci�n 4)
9. **Deploy**

### Opci�n B: Desde CLI

```bash
vercel --prod
```

## 6. Configurar dominio personalizado

1. En Vercel Dashboard ? Project ? Settings ? Domains
2. Agregar dominio (ej: `ruleta.tudominio.com`)
3. Configurar DNS seg�n instrucciones de Vercel:
   - **A record:** `76.76.21.21` (o CNAME a `cname.vercel-dns.com`)
   - **CNAME www:** `cname.vercel-dns.com`
4. Vercel provisiona SSL autom�ticamente (Let's Encrypt)

## 7. Inicializar base de datos

Despu�s del primer deploy, la base de datos se inicializa autom�ticamente (auto-seed) al recibir la primera petici�n. Para forzar el seed manualmente:

```bash
# En local con variables de entorno de Turso
npm run db:seed
# O directamente:
npx tsx backend/seed.ts
```

Para aplicar migraciones pendientes:

```bash
npm run db:migrate
```

## 8. Verificaci�n post-deploy

- **Health check:** `https://tudominio.com/api/health` ? `{"status":"OK"}`
- **Frontend:** `https://tudominio.com` ? carga la ruleta
- **Panel admin:** `https://tudominio.com/login-admin` ? login con `OPERATOR_PASSWORD`
- **Configuraci�n ruleta:** `https://tudominio.com/api/configuracion` ? JSON con premios activos

## 9. Comandos �tiles

```bash
# Desarrollo local (requiere .env con variables de Turso)
npm run dev:full          # Frontend (5177) + Backend (3001) concurrentemente
npm run dev               # Solo frontend
npm run dev:backend       # Solo backend

# Build local
npm run build:all         # Frontend + Backend

# Base de datos
npm run db:seed           # Forzar seed
npm run db:migrate        # Aplicar migraciones
npm run db:push           # Verificar conexi�n Turso

# Tests
npm test                  # Ejecutar tests
npm run typecheck         # Verificar tipos TypeScript
```

## 10. Estructura del monorepo

```
ruleta/
+-- api/index.ts          # Entry point serverless Vercel (carga backend/dist/app.js)
+-- backend/              # Backend Express + TypeScript
�   +-- app.ts           # Router principal (API routes)
�   +-- server.ts        # Servidor local (express + cors)
�   +-- database.ts      # Cliente Turso + queries
�   +-- migrations.ts    # Migraciones idempotentes
�   +-- wheel.ts         # Constantes y utilidades ruleta
�   +-- tickets/         # Sistema de tickets QR
�   +-- auth/            # Autenticaci�n operador (cookies firmadas)
+-- src/                 # Frontend React + Vite
+-- vercel.json          # Configuraci�n Vercel
+-- package.json         # Scripts y dependencias ra�z
+-- vite.config.ts       # Config Vite + proxy dev
```

## 11. Flujo de tickets (QR)

1. **Panel operador** ? Crear lote de tickets (con etiqueta opcional, expiraci�n)
2. **Descargar ZIP** con c�digos QR (PNG) + manifiesto CSV
3. **Usuario escanea QR** ? Abre `https://tudominio.com/?ticket=<token>#view=play&t=<token>`
4. **POST /api/spin** valida token, reserva ticket, sortea premio, canjea
5. **Panel operador** ve estado en tiempo real (polling `/api/tickets/batches/:id/live`)

## 12. Rollback

```bash
# En Vercel Dashboard ? Deployments ? Promote to Production (versi�n anterior)
# O desde CLI:
vercel rollback <deployment-url>
```

## 13. Backup y restauraci�n

- **Turso:** Backups autom�ticos diarios (plan gratis: 1 d�a, plan pago: 30 d�as)
- **Restauraci�n:** `turso db restore ruleta-prod --timestamp <timestamp>`
- **Im�genes de premios:** Almacenadas en la BD como data URI base64

## 14. Lista de verificaci�n al final

| Tarea | Estado |
|-------|--------|
| Base de datos Turso creada | |
| Variables de entorno configuradas en Vercel | |
| Dominio personalizado configurado + SSL | |
| Deploy exitoso en Vercel | |
| Health check `/api/health` OK | |
| Login operador funciona (cookie) | |
| SPA frontend carga correctamente | |
| Tickets QR generables desde panel | |
| Giro de ruleta funciona (con/sin ticket) | |

## 15. Criterio de finalizaci�n

- [ ] `DEPLOYMENT.md` actualizado para Vercel + Turso
- [ ] `.env.example` frontend actualizado (VITE_API_URL, VITE_BASE_PATH)
- [ ] `backend/.env.example` actualizado (DATABASE_URL, DATABASE_AUTH_TOKEN, etc.)
- [ ] `package.json` sin mysql2, con @libsql/client
- [ ] Build local exitoso (`npm run build:all`)
- [ ] Tests pasando (`npm test`)
- [ ] Deploy en Vercel funcionando
- [ ] DNS propagado y SSL activo
