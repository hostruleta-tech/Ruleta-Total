/**
 * Diseño visual de la ruleta basado en las imágenes PNG del cliente.
 *
 * El disco (`ruleta-disco-v3.png`) ya trae los premios dibujados y su propio
 * borde; el centro (`ruleta-centro-v2.png`) es un PNG aparte que NO gira.
 * La flecha se dibuja con código y el marco cromado del diseño anterior se
 * elimina.
 *
 * Geometría medida del PNG actual (1254x1254px):
 * - 6 sectores exactos de 60°, costuras en ~30°+60k desde la parte superior
 *   (30°, 89°, 149.3°, 211.3°, 271°, 329.5°).
 * - El centro del sector superior (Premio 1) está en ~359.75° (≈ arriba),
 *   igual al PNG anterior, así que la calibración guardada (0°/75°) se mantiene.
 */

/** URL pública del disco (en `public/`). */
export const WHEEL_IMAGE_URL = "/ruleta-disco.png";

/** URL pública del centro (en `public/`). */
export const CENTER_IMAGE_URL = "/ruleta-centro-v2.png";

/** Número fijo de sectores dibujados en el PNG. */
export const WHEEL_SECTOR_COUNT = 6;

/** Ángulo del motor que corresponde a la parte superior (puntero). */
export const WHEEL_POINTER_ANGLE = 90;

/** `determineAngle` usado por el motor (mismo valor que el del canvas). */
export const WHEEL_DETERMINE_ANGLE = 45;

/**
 * `initialAngle` del motor en reposo: con 6 sectores de 60° y determineAngle
 * 45, el centro del sector 0 (Premio 1) queda exactamente bajo la flecha.
 */
export const WHEEL_INITIAL_ANGLE = 75;

/**
 * Rotación CSS del disco: `transform: rotate(WHEEL_ROTATION_OFFSET - totalRotation)`.
 *
 * Con 6 sectores y determineAngle=45, el motor coloca el centro del sector 0
 * en `(75 - totalRotation)` grados horarios desde la parte superior. El PNG
 * mide ese centro en ~359.75° (−0.25° respecto al 0° exacto), así que el
 * offset es 75.5 para que el sector 0 del PNG coincida con el sector 0 del
 * motor en cualquier rotación.
 */
export const WHEEL_ROTATION_OFFSET = 75.5;

/**
 * Ancho del PNG del centro como fracción del ancho del disco.
 * El emblema central (radio 298/1000 del lienzo) cubre la maza pintada del
 * disco (hasta ~300/1000); 1.02 asegura que no quede un anillo de la maza a
 * la vista.
 */
export const CENTER_SIZE_RATIO = 1.02;

/** Opacidad (0..1) de los PNG del disco y del centro en producción. */
export const WHEEL_PNG_OPACITY = 1;

/**
 * Desplazamiento y escala del bloque PNG (disco + centro) respecto a su caja.
 *
 * Son retoques visuales del cliente: mueven y agrandan/encogen el bloque sin
 * afectar la rotación ni la calibración angular. La flecha queda fija en la
 * parte superior de la caja. Se calibran con `?wheelDebug=1` y se guardan en
 * el servidor junto con la alineación.
 */
export const WHEEL_DISK_OFFSET_X_PX = 0;
export const WHEEL_DISK_OFFSET_Y_PX = 16;
export const WHEEL_DISK_SCALE = 1;
export const WHEEL_DISK_ROTATION = 0;

/**
 * Desplazamiento y escala EXTRA del centro PNG respecto al bloque (disco +
 * centro). Son independientes del bloque: mueven y agrandan/encogen SOLO el
 * centro, útil para que cuadre con la maza del disco en calibración.
 */
export const WHEEL_CENTER_OFFSET_X_PX = 0;
export const WHEEL_CENTER_OFFSET_Y_PX = 0;
export const WHEEL_CENTER_SCALE = 1;

/** Rango de calibración para el desplazamiento del bloque PNG (px). */
export const WHEEL_DISK_OFFSET_MIN = -200;
export const WHEEL_DISK_OFFSET_MAX = 200;

/** Rango de calibración para la escala del bloque PNG (1 = tamaño natural). */
export const WHEEL_DISK_SCALE_MIN = 0.5;
export const WHEEL_DISK_SCALE_MAX = 1.5;

/** Rango de calibración para la rotación extra del bloque PNG (grados). */
export const WHEEL_DISK_ROTATION_MIN = -180;
export const WHEEL_DISK_ROTATION_MAX = 180;

/** Rango de calibración para el desplazamiento del centro PNG (px). */
export const WHEEL_CENTER_OFFSET_MIN = -200;
export const WHEEL_CENTER_OFFSET_MAX = 200;

/** Rango de calibración para la escala del centro PNG (1 = tamaño natural). */
export const WHEEL_CENTER_SCALE_MIN = 0.5;
export const WHEEL_CENTER_SCALE_MAX = 1.5;

/**
 * Ajuste (en grados) de la capa PNG respecto a la geometría del motor.
 *
 * El motor aterriza siempre en `75 + 60·sector`; este valor desplaza el PNG
 * (en reposo y en cada aterrizaje) para que sus costuras cuadren con los
 * sectores del motor. Se calibra con `?wheelDebug=1` y luego se fija aquí.
 */
export const WHEEL_ALIGNMENT_OFFSET = 0;

/** Rango de calibración para `WHEEL_ALIGNMENT_OFFSET` (grados). */
export const WHEEL_ALIGNMENT_OFFSET_MIN = -180;
export const WHEEL_ALIGNMENT_OFFSET_MAX = 180;

/** Rango de calibración para la pose inicial de la ruleta (grados). */
export const WHEEL_INITIAL_ANGLE_MIN = 0;
export const WHEEL_INITIAL_ANGLE_MAX = 360;

/** Indica si el modo debug de sectores está activo (`?wheelDebug=1`). */
export const isWheelDebugMode = (): boolean =>
	typeof window !== "undefined" &&
	new URLSearchParams(window.location.search).get("wheelDebug") === "1";

/** Lee un número desde un query param; null si falta o no es válido. */
export const readParamNumber = (name: string): number | null => {
	if (typeof window === "undefined") return null;
	const value = new URLSearchParams(window.location.search).get(name);
	if (value == null || value.trim() === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};