# Tickets QR — Fase 1

Sistema de emisión de tickets con QR para la ruleta existente. Esta fase
**no canjea ni reserva tickets**: solo los genera, los guarda y permite
descargar/imprimir sus QR. La reserva temporal y el canje se implementarán
en la siguiente fase.

## Qué se implementó

- Tokens aleatorios de 256 bits (`crypto.randomBytes(32)`), no secuenciales.
- Hash SHA-256 para localizar cada ticket sin guardar el token en claro.
- Token cifrado con AES-256-GCM para poder reimprimir el QR sin almacenar el
  secreto en texto plano.
- QR generados en el servidor con `qrcode` (PNG).
- Tabla de tickets y de lotes, con estados preparados para la fase 2.
- Generación individual y por lotes (máximo 500 por lote).
- Descarga individual en PNG y descarga del lote completo en ZIP.
- Contraseña de operador para crear/editar ruletas y administrar tickets.
- Pruebas de unicidad, contenido real del QR, persistencia, cifrado,
  autorización y ZIP.

## Requisitos

Añade estas variables al `.env` local y a Vercel
(Settings → Environment Variables):

```env
PUBLIC_APP_URL=https://tu-dominio.com
OPERATOR_PASSWORD=una-contraseña-larga
TICKET_ENCRYPTION_KEY=...
```

Genera la clave de cifrado con:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

- `PUBLIC_APP_URL` debe ser la URL real desde la que se abre la ruleta. En
  producción se exige HTTPS.
- Si cambias `TICKET_ENCRYPTION_KEY`, los QR antiguos ya no se podrán
  reimprimir. Los tickets ya emitidos seguirán existiendo por su hash.
- Si no configuras `OPERATOR_PASSWORD`, las acciones protegidas responden
  `503` y el panel muestra el aviso correspondiente.

En local, usa el puerto que muestre Vite. Por ejemplo:

```env
PUBLIC_APP_URL=http://localhost:5173
```

## Migraciones

Aplica las migraciones manualmente:

```bash
npm run db:migrate
```

También se aplican automáticamente al arrancar el backend, porque
`backend/database.ts` llama al runner idempotente de `backend/migrations.ts`.
La tabla `schema_migrations` evita repetirlas.

Tablas creadas:

- `ticket_batches`: lote, etiqueta, cantidad, creación y expiración.
- `tickets`: id público, lote, hash, token cifrado, estado y fechas.
- `schema_migrations`: control de migraciones aplicadas.

## Generar tickets desde el panel

1. Abre `?view=admin`.
2. Entra en la pestaña **Tickets QR**.
3. Indica cantidad (1–500), etiqueta y, si quieres, fecha de expiración.
4. Pulsa **Generar ticket** o **Generar N tickets**.
5. Introduce la contraseña de operador cuando se solicite.

El ticket empieza en estado `available`. La contraseña se guarda solo en la
pestaña actual (`sessionStorage`) y se envía en la cabecera
`X-Operator-Password`; no hay sesión ni token de sesión.

## Descargar e imprimir

- **PNG individual:** botón `PNG` en cada vista previa del lote.
- **Lote completo:** botón **Descargar ZIP**. El ZIP contiene:
  - `tickets/ticket-XXXXXXXX.png` por cada ticket.
  - `manifest.csv` con ID, lote, estado y fechas. **No incluye tokens.**
- **Reimpresión:** en **Lotes recientes**, pulsa `Actualizar`, elige un lote
  y usa `Ver` o `ZIP`. El servidor descifra el token con la clave del entorno
  para volver a generar las imágenes.

El QR contiene únicamente:

```text
https://tu-dominio.com/?view=play#t=<token>
```

El token va en el fragmento (`#`), así no se envía al servidor ni se filtra
por `Referer`. No incluye premios, nombres, teléfonos ni IDs internos.

## API

Todas las rutas requieren `X-Operator-Password`.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/tickets` | Crea un ticket individual. |
| `POST` | `/api/tickets/batch` | Crea un lote (`quantity`, `batchLabel`, `expiresAt`). |
| `GET` | `/api/tickets` | Lista paginada de tickets (sin secretos). |
| `GET` | `/api/tickets/batches` | Lista de lotes con contadores. |
| `GET` | `/api/tickets/batches/:id` | Detalle y primeras vistas previas. |
| `GET` | `/api/tickets/:id/qr` | PNG individual. |
| `GET` | `/api/tickets/batches/:id/qr.zip` | ZIP del lote + manifiesto. |

Ejemplo:

```bash
curl -X POST http://localhost:3001/api/tickets/batch \
  -H "Content-Type: application/json" \
  -H "X-Operator-Password: tu-contraseña" \
  -d '{"quantity":10,"batchLabel":"Tienda Centro"}'
```

## Pruebas y verificación

```bash
npm test
npm run build:backend
npm run typecheck
npm run build
```

Las pruebas usan una base libSQL en memoria y no tocan Turso. Cubren:

- 10.000 tokens únicos y con formato seguro.
- Hash determinista y token no almacenado en claro.
- Cifrado/descifrado AES-GCM y detección de payload manipulado.
- QR decodificado con `jsqr`: cada PNG contiene la URL exacta de su ticket.
- Persistencia, estados, expiración, unicidad y listados sin secretos.
- Contraseña de operador, validaciones y endpoints de descarga.

## Seguridad

- No se registran tokens, contraseñas ni payloads en logs.
- Las descargas de QR y ZIP usan `Cache-Control: no-store`.
- La generación de QR y la descarga requieren contraseña.
- El QR no se consume al generarlo, escanearlo ni descargarlo.
- Los listados solo devuelven metadatos; nunca `token_hash` ni
  `token_encrypted`.

## Pendiente para la fase 2

- Leer el token desde `location.hash` al abrir `?view=play`.
- Reservar el ticket temporalmente (`reserved`, `reserved_until`).
- Canjearlo al confirmar el giro (`redeemed`, `redeemed_at`).
- Evitar múltiples giros y reclamaciones duplicadas.
- Asociar el premio obtenido al ticket.

La base ya tiene las columnas y estados necesarios; **no hay endpoints de
reserva ni canje en esta fase**.
