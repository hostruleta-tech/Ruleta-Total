# Plan — Ruleta con diseño PNG y 6 sectores fijos

## Objetivo

Reemplazar el aspecto visual generado por código por el diseño PNG del cliente,
manteniendo la lógica del sorteo, los tickets y el frenado de la ruleta.

Decisiones acordadas:

- La ruleta tiene **6 sectores fijos**.
- El mapeo es **Premio 1 → Sector 1** ... **Premio 6 → Sector 6**, en sentido
  horario empezando por arriba.
- El mapeo **no se edita desde el panel**; solo se cambia por código/migración.
- El panel queda bloqueado a **6 filas fijas** (sin agregar, borrar ni reordenar).
- Se elimina el 7º premio de la plantilla activa (`10% de descuento`).
- El disco PNG ya incluye los premios dibujados.
- El centro es un PNG aparte y **no gira**.
- La flecha se dibuja con código.
- Se elimina el marco cromado actual.

---

## Fase 1 — Modelo fijo de 6 sectores (BD + backend + panel)

Esta fase no toca todavía la parte visual de la ruleta.

### Base de datos

- Agregar `sector_index` (0–5) a la tabla `prizes`.
- Migración idempotente:
  - Agrega la columna si no existe.
  - Asigna `0..5` a los primeros 6 premios de cada plantilla.
  - En la plantilla activa elimina los premios sobrantes (el 7º).
  - Deja los sobrantes de plantillas inactivas sin sector (ignorados).
- Cada plantilla nueva se crea automáticamente con 6 premios base
  (`Premio 1` ... `Premio 6`) y sectores `0..5`.

### API

- `GET /api/roulettes/:id` devuelve siempre 6 filas de sector (completa con
  placeholders si falta alguna).
- `PUT /api/roulettes/:id` exige exactamente 6 premios con sectores `0..5`
  únicos.
- `GET /api/configuracion` y `POST /api/spin` usan solo los 6 premios con
  sector, ordenados por `sector_index`.
- La respuesta del giro incluye `prizeSector`.
- No se puede activar una plantilla que no tenga los 6 sectores completos.
- `POST /api/spin` responde con error claro si la plantilla activa está
  incompleta.

### Panel

- `PrizeManager` muestra exactamente **6 filas fijas**: Sector 1 a Sector 6.
- El sector es de solo lectura.
- Se eliminan:
  - Agregar premio.
  - Borrar premio.
  - Reordenar con drag & drop.
- Se mantiene la edición de:
  - Nombre.
  - Imagen.
  - Modo de texto.
  - Color.
  - Peso/probabilidad.
  - “Inténtalo de nuevo”.
- Se muestra un aviso si la configuración no tiene los 6 sectores completos.

### Seed y datos iniciales

- `seed-data.ts` y `seed.ts` actualizados a 6 premios por plantilla con
  `sectorIndex`.
- La plantilla activa de ejemplo queda con 6 premios (sin el 7º).

### Pruebas de la fase 1

- Validación de exactamente 6 sectores.
- Rechazo de sectores duplicados o fuera de rango.
- Typecheck y tests existentes.

---

## Fase 2 — Capa visual PNG

> Requiere que estén disponibles:
> - `public/ruleta-disco.png`
> - `public/ruleta-centro.png`

### Archivos y configuración

- Crear `src/features/ruleta/wheel-design.ts`:
  - Rutas de las imágenes.
  - `WHEEL_SECTOR_COUNT = 6`.
  - `WHEEL_ROTATION_OFFSET` (calibración).
  - `CENTER_SIZE_RATIO`.
  - Flags de marco/flecha/debug.

### Disco giratorio

- La imagen del disco va por encima del canvas actual.
- El canvas queda como fallback y mantiene la lógica.
- Sincronizar la rotación con el motor mediante un callback por frame:
  - `animation-roulette.ts` emite la rotación actual.
  - `roulette-wheel.tsx` actualiza el `transform` de la imagen sin
    re-renderizar React.
- Fórmula inicial:
  - `initialAngle = 75°` para que el Sector 1 quede arriba en reposo.
  - `transform: rotate(75° - totalRotation)`.
- Ajustar el offset con la imagen real usando `?wheelDebug=1`.
- Si la imagen falla, mostrar la ruleta dibujada por código.

### Centro fijo

- `<img>` del centro en una capa aparte, centrada y sin rotación.
- `pointer-events-none`.
- Tamaño calibrado con `CENTER_SIZE_RATIO`.

### Flecha y marco

- Mantener la flecha SVG actual, ajustada visualmente.
- Eliminar el marco cromado y el fondo blanco.
- Ajustar `ruleta-screen.tsx` para el nuevo tamaño sin marco.

### Modo debug

- `?wheelDebug=1` dibuja:
  - Líneas de sectores.
  - Números de sector.
  - Línea del puntero.
- Sirve para verificar que la imagen coincide con el cálculo del motor.

---

## Fase 3 — Integración del giro y verificación

### Frontend

- Agregar `sectorIndex` a `RouletteItem`.
- Agregar `prizeSector` a `SpinResponse`.
- Ordenar los premios por `sectorIndex`.
- Usar `prizeSector` como índice objetivo del motor:
  - `controls.start(prizeSector)`.
- Validar que haya 6 sectores antes de permitir girar.
- Mantener el modal, tickets, “Inténtalo de nuevo” y probabilidades.

### Calibración

1. Verificar que el Sector 1 esté arriba en reposo.
2. Confirmar sentido horario.
3. Girar en modo admin una vez por cada sector.
4. Comprobar que el sector bajo la flecha coincide con el premio del modal.
5. Probar móvil, escritorio y pantalla completa.

### Pruebas

- Test de que cada `winnerIndex` termina bajo el puntero.
- Test del mapeo premio → sector.
- `npm run typecheck`.
- `npm test`.
- `npm run build:backend`.

---

## Archivos afectados

### Fase 1

- `backend/database.ts`
- `backend/app.ts`
- `backend/seed-data.ts`
- `backend/seed.ts`
- `backend/wheel.ts` (nuevo, constantes/validación)
- `backend/wheel.test.ts` (nuevo)
- `src/features/panel/prize-manager.tsx`

### Fase 2

- `src/features/ruleta/wheel-design.ts` (nuevo)
- `src/features/ruleta/roulette-wheel.tsx`
- `src/features/ruleta/ruleta-screen.tsx`
- `src/features/motor/hooks/use-roulette.ts`
- `src/features/motor/functions/animation-roulette.ts`
- `src/features/motor/types.ts`
- `src/features/motor/config.ts`
- `public/ruleta-disco.png`
- `public/ruleta-centro.png`

### Fase 3

- `src/features/ruleta/ruleta-screen.tsx`
- `src/features/motor/functions/utils.ts`
- `src/features/motor/functions/utils.test.ts` (nuevo)

---

## Despliegue

1. Backup de la base de datos.
2. Desplegar backend + frontend.
3. Verificar que la migración dejó la plantilla activa con 6 sectores.
4. Revisar/editar los 6 premios desde el panel.
5. Activar la plantilla.
6. Probar un giro por cada sector.

## Nota importante

Como el disco PNG trae los nombres dibujados, editar el nombre de un premio en
el panel cambia el modal y los tickets, pero **no la imagen de la ruleta**.
Si cambian los premios visuales, hay que cambiar el PNG o el mapeo por código.
