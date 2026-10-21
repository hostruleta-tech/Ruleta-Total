# Tickets QR — Fases 1 y 2

Sistema de emisión de tickets con QR para la ruleta existente.

- **Fase 1:** genera, guarda, descarga e imprime los QR.
- **Fase 2:** valida el token del QR, reserva el ticket al girar y lo canjea
  guardando el premio obtenido. Un ticket solo puede generar un giro.

## Qué se implementó

- Tokens aleatorios de 256 bits (`crypto.randomBytes(32)`), no secuenciales.
- Hash SHA-256 para localizar cada ticket sin guardar el token en claro.
- Token cifrado con AES-256-GCM para poder reimprimir el QR sin almacenar el
  secreto en texto plano.
- QR generados en el servidor con `qrcode` (PNG).
- Tabla de tickets y de lotes, con estados `available`, `reserved`, `redeemed`,
  `expired` y `void`.
- Generación individual y por lotes (máximo 500 por lote).
- Descarga individual en PNG y descarga del lote completo en ZIP.
- Contraseña de operador para crear/editar ruletas y administrar tickets.
- Reserva temporal de 5 minutos y canje atómico con el premio guardado.
- Anulación de tickets desde el panel.
- Pruebas de unicidad, contenido real del QR, persistencia, cifrado,
  autorización, ZIP, reserva, canje, expiración y concurrencia.

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
- `tickets`: id público, lote, hash, token cifrado, estado, fechas y premio
  (`prize_id`, `prize_name`, `roulette_id`).
- `schema_migrations`: control de migraciones aplicadas.

## Girar con un ticket

1. El participante escanea el QR impreso. Se abre:

   ```text
   https://tu-dominio.com/?view=play#t=<token>
   ```

2. La vista `play` lee el token del fragmento (`#`), lo borra de la barra de
   direcciones y lo valida contra el servidor.
3. La tarjeta muestra si el ticket es válido, ya fue canjeado, expiró o está
   reservado en otra sesión.
4. Al pulsar **GIRAR RULETA** el servidor:
   - valida el ticket,
   - lo reserva por 5 minutos,
   - sortea el premio con la plantilla activa,
   - lo canjea y guarda el premio,
   - devuelve el premio y el ID del ticket como código de reclamación.
5. El botón queda deshabilitado: un ticket permite exactamente un giro.

Si el ticket estaba reservado y la reserva venció, se libera automáticamente
y puede volver a usarse. Un ticket canjeado no se puede anular ni reutilizar.

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
  - `manifest.csv` con ID, lote, estado, fechas, premio y fecha de canje.
  **No incluye tokens.**
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

Rutas públicas (no requieren contraseña; el token va en el cuerpo JSON,
nunca en la URL):

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/tickets/validate` | Valida `{ token }` y devuelve el estado sin consumirlo. |
| `POST` | `/api/tickets/reserve` | Reserva el ticket 5 minutos (`available → reserved`). |
| `POST` | `/api/spin` | Flujo completo del giro: valida, reserva, sortea y canjea. Requiere `{ token }`. |

El canje **no** es un endpoint público: el premio lo elige siempre el servidor
dentro de `/api/spin`.

Rutas de operador (requieren `X-Operator-Password`):

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/tickets` | Crea un ticket individual. |
| `POST` | `/api/tickets/batch` | Crea un lote (`quantity`, `batchLabel`, `expiresAt`). |
| `GET` | `/api/tickets` | Lista paginada de tickets (sin secretos). |
| `GET` | `/api/tickets/batches` | Lista de lotes con contadores. |
| `GET` | `/api/tickets/batches/:id` | Detalle y primeras vistas previas. |
| `GET` | `/api/tickets/:id/qr` | PNG individual. |
| `GET` | `/api/tickets/batches/:id/qr.zip` | ZIP del lote + manifiesto. |
| `POST` | `/api/tickets/:id/void` | Anula un ticket (`void`). No permite canjeados. |

Ejemplo de giro:

```bash
curl -X POST http://localhost:3001/api/spin \
  -H "Content-Type: application/json" \
  -d '{"token":"<token del QR>"}'
```

Ejemplo de lote:

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
- Reserva atómica: dos peticiones simultáneas, solo una gana.
- Liberación de reservas vencidas y rechazo de tickets expirados.
- Canje único, premio persistido e idempotencia en reintentos.
- Anulación de tickets y bloqueo al anular canjeados.

## Seguridad

- No se registran tokens, contraseñas ni payloads en logs.
- Las descargas de QR y ZIP usan `Cache-Control: no-store`.
- La generación de QR, la descarga y la anulación requieren contraseña.
- El QR no se consume al generarlo, escanearlo, validarlo ni descargarlo;
  solo se consume al girar.
- Los listados solo devuelven metadatos; nunca `token_hash` ni
  `token_encrypted`.
- El token se envía por POST en el cuerpo, no como parámetro de URL.
- Las actualizaciones de estado usan `UPDATE ... WHERE status = ...` y
  `rowsAffected` para evitar dobles giros por concurrencia.

## Notas y límites

- Un ticket que quedó en `reserved` se libera solo cuando vence su
  `reserved_until` (5 minutos), normalmente al volver a validarlo.
- Si la red falla justo después del canje, el ticket ya está `redeemed` y el
  premio quedó guardado: el operador puede consultarlo en el panel.
- El canje es idempotente por token: repetir la petición devuelve el premio
  ya guardado en lugar de girar otra vez.
- La reserva no está atada a una sesión de navegador; el TTL es lo que
  impide que un ticket quede bloqueado indefinidamente.
