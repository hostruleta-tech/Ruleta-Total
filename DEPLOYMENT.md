# DEPLOYMENT.md — Ruleta TOTAL (Ubuntu 24.04 + MariaDB + ServerAvatar Panel)

## 1. Requisitos y entorno del VPS

- **Ubuntu 24.04** con **ServerAvatar** (panel web, **sin SSH**)
- **MariaDB** disponible en el VPS
- Acceso al panel web de ServerAvatar para:
  - Crear base de datos y usuario MariaDB
  - Configurar dominio y SSL (certificado Let's Encrypt)
  - Crear el sitio web/aplicación y configurar proxy inverso
- **No hay acceso SSH**; todo se hace desde el panel de ServerAvatar

## 2. Información previa que debe proporcionar el administrador

| Variable | Valor a proporcionar por el admin |
|----------|----------------------------|
| `MARIADB_HOST` | Ej. `127.0.0.1` o `localhost` |
| `MARIADB_PORT` | Ej. `3306` |
| `MARIADB_DATABASE` | Nombre de la base de datos MariaDB |
| `MARIADB_USER` | Usuario MariaDB (con privilegios mínimos: SELECT, INSERT, UPDATE, DELETE) |
| `MARIADB_PASSWORD` | Contraseña del usuario MariaDB |
| `OPERATOR_PASSWORD` | Contraseña fuerte para panel de operador |
| `TICKET_ENCRYPTION_KEY` | 32 bytes base64 (generar con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) |
| `PUBLIC_APP_URL` | Ej. `https://ruleta.tudominio.com` |
| `PORT` | (opcional) puerto del backend, default `3001` |
| `NODE_ENV` | `production` (se fuerza en el script de inicio) |
| `SESSION_SECRET` | Secreto para sesiones (opcional) |

## 3. Crear base de datos y usuario en MariaDB (panel ServerAvatar)

Desde el panel de ServerAvatar:

1. Ir a la sección **Bases de datos** → MariaDB
2. Crear una nueva base de datos, por ejemplo `ruleta_prod`
3. Crear un nuevo usuario, por ejemplo `ruleta_app`
4. Asignar privilegios mínimos al usuario sobre la base de datos:
   - `SELECT`, `INSERT`, `UPDATE`, `DELETE`
5. Anotar las credenciales para el archivo `.env`

## 4. Variables de entorno (`.env`)

Copiar `.env.example` → `.env` y completar valores reales:

```bash
cp .env.example .env
```

Editar `.env` con las credenciales reales de MariaDB y los demás valores.

**Nota:** El usuario prefiere que los secretos estén en `.env` (no en variables de entorno del panel). El archivo `.env` debe subirse al servidor por medio del panel de archivos de ServerAvatar.

## 5. Instalación y compilación

El código ya está preparado para MariaDB. Instalar dependencias y compilar:

```bash
cd /opt/ruleta-TOTAL
npm ci
npm run build:all
```

Scripts disponibles:
- `npm run build:backend` — compila solo el backend (TypeScript → JavaScript)
- `npm run build` — compila el frontend
- `npm run build:all` — compila todo
- `npm start` — inicia el backend (`node backend/dist/server.js`)

## 6. Configuración del sitio en ServerAvatar

### 6.1 Crear sitio web

Desde el panel de ServerAvatar:
1. Ir a **Sitios web** → Crear sitio
2. Dominio: `ruleta.tudominio.com`
3. Tipo de aplicación: **Node.js** (o aplicación personalizada)
4. Directorio raíz: `/opt/ruleta-TOTAL` (o donde esté el repositorio)

### 6.2 Proxy inverso para la API

Configurar proxy inverso para que las peticiones a `/api/*` lleguen al backend Node.js:

- **Origen:** `http://127.0.0.1:3001/` (o el puerto definido en `.env`)
- **Ruta proxy:** `/api/`

### 6.3 SPA (Frontend) catch-all

Configurar regla de reescritura para que el SPA del frontend maneje rutas no encontradas:

```
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteCond %{REQUEST_URI} !^/api
RewriteRule ^(.*)$ /index.html [L]
```

### 6.4 SSL / HTTPS

1. En ServerAvatar, ir a **SSL** para el dominio
2. Solicitar certificado Let's Encrypt
3. Forzar HTTPS (redirigir HTTP → HTTPS)

## 7. Inicio del backend

El backend debe correr como un proceso persistente. Desde el panel de ServerAvatar:

### Opción A: Usar el gestor de procesos de ServerAvatar (recomendado)

Si ServerAvatar soporta iniciar aplicaciones Node.js, usar:
- **Comando de inicio:** `npm start` (o `node backend/dist/server.js`)
- **Directorio de trabajo:** `/opt/ruleta-TOTAL`
- **Variables de entorno:** cargar desde `.env`

### Opción B: Script de inicio personalizado

Crear un script `scripts/prod-start.sh`:

```bash
#!/bin/bash
cd /opt/ruleta-TOTAL
export NODE_ENV=production
node backend/dist/server.js
```

Y configurarlo para que se ejecute al iniciar el servidor (si el panel lo permite).

### Opción C: PM2 (si está instalado en el VPS)

```bash
pm2 start backend/dist/server.js --name ruleta-backend
pm2 save
```

## 8. Health check

```bash
curl -f -s http://localhost:3001/api/health
```

Desde fuera del servidor (detrás del proxy de ServerAvatar):

```bash
curl -f -s -o /dev/null https://ruleta.tudominio.com/api/health || exit 1
```

## 9. Logs y diagnóstico

- **Backend:** stdout/stderr del proceso Node (consola del panel de ServerAvatar o archivos de log)
- **Servidor web:** logs de nginx/Apache según lo configurado en ServerAvatar

## 10. Actualización

1. Pull del repositorio:
   ```bash
   cd /opt/ruleta-TOTAL
   git pull
   npm ci
   npm run build:all
   ```
2. Reiniciar el backend desde el panel de ServerAvatar

## 11. Rollback

Si un deploy introduce regresiones:

- Usar `git checkout <commit>` para volver a una versión anterior
- Recompilar (`npm run build:all`)
- Reiniciar el backend

## 12. Backup y restauración

- **Base de datos MariaDB:** Usar las herramientas de backup de ServerAvatar para MariaDB (o `mysqldump` desde el panel si está disponible)
- **Imágenes de premios:** Almacenadas en la BD como data URI base64; se respaldan automáticamente con la BD.

## 13. Tareas de acceso administrativo (solo admin del VPS)

- Crear base de datos y usuario MariaDB (panel ServerAvatar)
- Configurar dominio, DNS y SSL (panel ServerAvatar)
- Crear el sitio web y configurar proxy inverso (panel ServerAvatar)
- Subir el archivo `.env` con los secretos (gestor de archivos de ServerAvatar)
- Configurar el proceso persistente del backend (panel ServerAvatar)

## 14. Lista de verificación al final

| Tarea | Estado |
|-------|--------|
| MariaDB creada con usuario y privilegios mínimos | |
| `.env` subido con credenciales reales | |
| Dependencias instaladas (`npm ci`) | |
| Backend compilado (`npm run build:all`) | |
| Sitio web creado en ServerAvatar | |
| Proxy inverso configurado para `/api/` | |
| SSL/HTTPS activo | |
| Backend corriendo como proceso persistente | |
| Health check exitoso (`/api/health`) | |
| Login de operador funciona (cookie) | |
| SPA del frontend carga correctamente | |

## 15. Criterio de finalización

- [ ] Scripts de producción verificados
- [ ] `.env.example` actualizado con variables MariaDB
- [ ] `package.json` corregido (`start` → `node backend/dist/server.js`)
- [ ] Seguridad verificada (CORS, rate-limit, cookies seguras)
- [ ] Tests (`npm test`) pasando
- [ ] `DEPLOYMENT.md` entregado al admin
- [ ] Plan de rollback documentado