/**
 * Configuración fija de la ruleta.
 *
 * El diseño PNG tiene 6 sectores. El mapeo es fijo y no se edita desde el
 * panel: el sector 0 corresponde al Premio 1, el 1 al Premio 2, y así hasta
 * el sector 5 (Premio 6), en sentido horario empezando por arriba.
 */
export const WHEEL_SECTOR_COUNT = 6;

/** Índices válidos de sector: 0, 1, 2, 3, 4 y 5. */
export const WHEEL_SECTOR_INDEXES = Array.from(
	{ length: WHEEL_SECTOR_COUNT },
	(_, index) => index,
);

/** Indica si un valor es un índice de sector válido. */
export function isValidSectorIndex(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 0 &&
		value < WHEEL_SECTOR_COUNT
	);
}

/**
 * Comprueba que una lista de premios tenga exactamente los 6 sectores,
 * sin duplicados y todos dentro del rango permitido.
 */
export function hasCompleteSectorMapping(
	prizes: Array<{ sectorIndex?: number | null }>,
): boolean {
	if (prizes.length !== WHEEL_SECTOR_COUNT) return false;

	const sectors = new Set<number>();
	for (const prize of prizes) {
		if (!isValidSectorIndex(prize.sectorIndex)) return false;
		if (sectors.has(prize.sectorIndex)) return false;
		sectors.add(prize.sectorIndex);
	}

	return sectors.size === WHEEL_SECTOR_COUNT;
}

/**
 * Calibración visual del PNG de la ruleta.
 * - `alignmentOffset`: desplaza el PNG (en reposo y en cada aterrizaje) para
 *   que sus sectores cuadren con la geometría del motor.
 * - `initialAngle`: pose de reposo de la ruleta antes del primer giro.
 * - `diskOffsetX` / `diskOffsetY`: desplazamiento del bloque PNG (disco +
 *   centro) respecto a su caja, en px CSS.
 * - `diskScale`: escala del bloque PNG (1 = tamaño natural).
 * - `diskRotation`: rotación extra del bloque PNG (grados).
 * - `centerOffsetX` / `centerOffsetY`: desplazamiento EXTRA del centro PNG
 *   respecto al bloque (disco + centro), en px CSS. Mueven solo el centro.
 * - `centerScale`: escala EXTRA del centro PNG (1 = tamaño natural). Solo
 *   agranda/encoge el centro, no el disco.
 */
export interface WheelCalibration {
	alignmentOffset: number;
	initialAngle: number;
	diskOffsetX: number;
	diskOffsetY: number;
	diskScale: number;
	diskRotation: number;
	centerOffsetX: number;
	centerOffsetY: number;
	centerScale: number;
}

/** Valores por defecto de la calibración (mismos que en wheel-design.ts). */
export const WHEEL_DEFAULT_ALIGNMENT_OFFSET = 0;
export const WHEEL_DEFAULT_INITIAL_ANGLE = 75;
export const WHEEL_DEFAULT_DISK_OFFSET_X = 0;
export const WHEEL_DEFAULT_DISK_OFFSET_Y = 16;
export const WHEEL_DEFAULT_DISK_SCALE = 1;
export const WHEEL_DEFAULT_DISK_ROTATION = 0;
export const WHEEL_DEFAULT_CENTER_OFFSET_X = 0;
export const WHEEL_DEFAULT_CENTER_OFFSET_Y = 0;
export const WHEEL_DEFAULT_CENTER_SCALE = 1;

/** Rango válido para `alignmentOffset` (grados). */
export const WHEEL_ALIGNMENT_OFFSET_MIN = -180;
export const WHEEL_ALIGNMENT_OFFSET_MAX = 180;

/** Rango válido para `initialAngle` (grados). */
export const WHEEL_INITIAL_ANGLE_MIN = 0;
export const WHEEL_INITIAL_ANGLE_MAX = 360;

/** Rango válido para el desplazamiento del bloque PNG (px). */
export const WHEEL_DISK_OFFSET_MIN = -200;
export const WHEEL_DISK_OFFSET_MAX = 200;

/** Rango válido para la escala del bloque PNG. */
export const WHEEL_DISK_SCALE_MIN = 0.5;
export const WHEEL_DISK_SCALE_MAX = 1.5;

/** Rango válido para la rotación extra del bloque PNG (grados). */
export const WHEEL_DISK_ROTATION_MIN = -180;
export const WHEEL_DISK_ROTATION_MAX = 180;

/** Rango válido para el desplazamiento extra del centro PNG (px). */
export const WHEEL_CENTER_OFFSET_MIN = -200;
export const WHEEL_CENTER_OFFSET_MAX = 200;

/** Rango válido para la escala extra del centro PNG. */
export const WHEEL_CENTER_SCALE_MIN = 0.5;
export const WHEEL_CENTER_SCALE_MAX = 1.5;

/** Error de validación de calibración. */
export class CalibrationValidationError extends Error {}

/** Lee un número opcional: usa el valor por defecto si falta o viene vacío. */
function readOptionalNumber(value: unknown, fallback: number): number {
	if (value == null || value === "") return fallback;
	return Number(value);
}

/** Valida y normaliza la calibración recibida del panel. */
export function sanitizeCalibration(
	raw: unknown,
): WheelCalibration {
	const candidate = (raw ?? {}) as {
		alignmentOffset?: unknown;
		initialAngle?: unknown;
		diskOffsetX?: unknown;
		diskOffsetY?: unknown;
		diskScale?: unknown;
		diskRotation?: unknown;
		centerOffsetX?: unknown;
		centerOffsetY?: unknown;
		centerScale?: unknown;
	};

	const alignmentOffset = Number(candidate.alignmentOffset);
	const initialAngle = Number(candidate.initialAngle);
	const diskOffsetX = readOptionalNumber(
		candidate.diskOffsetX,
		WHEEL_DEFAULT_DISK_OFFSET_X,
	);
	const diskOffsetY = readOptionalNumber(
		candidate.diskOffsetY,
		WHEEL_DEFAULT_DISK_OFFSET_Y,
	);
	const diskScale = readOptionalNumber(
		candidate.diskScale,
		WHEEL_DEFAULT_DISK_SCALE,
	);
	const diskRotation = readOptionalNumber(
		candidate.diskRotation,
		WHEEL_DEFAULT_DISK_ROTATION,
	);
	const centerOffsetX = readOptionalNumber(
		candidate.centerOffsetX,
		WHEEL_DEFAULT_CENTER_OFFSET_X,
	);
	const centerOffsetY = readOptionalNumber(
		candidate.centerOffsetY,
		WHEEL_DEFAULT_CENTER_OFFSET_Y,
	);
	const centerScale = readOptionalNumber(
		candidate.centerScale,
		WHEEL_DEFAULT_CENTER_SCALE,
	);

	if (
		!Number.isFinite(alignmentOffset) ||
		alignmentOffset < WHEEL_ALIGNMENT_OFFSET_MIN ||
		alignmentOffset > WHEEL_ALIGNMENT_OFFSET_MAX
	) {
		throw new CalibrationValidationError(
			`alignmentOffset debe estar entre ${WHEEL_ALIGNMENT_OFFSET_MIN} y ${WHEEL_ALIGNMENT_OFFSET_MAX}.`,
		);
	}

	if (
		!Number.isFinite(initialAngle) ||
		initialAngle < WHEEL_INITIAL_ANGLE_MIN ||
		initialAngle > WHEEL_INITIAL_ANGLE_MAX
	) {
		throw new CalibrationValidationError(
			`initialAngle debe estar entre ${WHEEL_INITIAL_ANGLE_MIN} y ${WHEEL_INITIAL_ANGLE_MAX}.`,
		);
	}

	if (
		!Number.isFinite(diskOffsetX) ||
		diskOffsetX < WHEEL_DISK_OFFSET_MIN ||
		diskOffsetX > WHEEL_DISK_OFFSET_MAX
	) {
		throw new CalibrationValidationError(
			`diskOffsetX debe estar entre ${WHEEL_DISK_OFFSET_MIN} y ${WHEEL_DISK_OFFSET_MAX}.`,
		);
	}

	if (
		!Number.isFinite(diskOffsetY) ||
		diskOffsetY < WHEEL_DISK_OFFSET_MIN ||
		diskOffsetY > WHEEL_DISK_OFFSET_MAX
	) {
		throw new CalibrationValidationError(
			`diskOffsetY debe estar entre ${WHEEL_DISK_OFFSET_MIN} y ${WHEEL_DISK_OFFSET_MAX}.`,
		);
	}

	if (
		!Number.isFinite(diskScale) ||
		diskScale < WHEEL_DISK_SCALE_MIN ||
		diskScale > WHEEL_DISK_SCALE_MAX
	) {
		throw new CalibrationValidationError(
			`diskScale debe estar entre ${WHEEL_DISK_SCALE_MIN} y ${WHEEL_DISK_SCALE_MAX}.`,
		);
	}

	if (
		!Number.isFinite(diskRotation) ||
		diskRotation < WHEEL_DISK_ROTATION_MIN ||
		diskRotation > WHEEL_DISK_ROTATION_MAX
	) {
		throw new CalibrationValidationError(
			`diskRotation debe estar entre ${WHEEL_DISK_ROTATION_MIN} y ${WHEEL_DISK_ROTATION_MAX}.`,
		);
	}

	if (
		!Number.isFinite(centerOffsetX) ||
		centerOffsetX < WHEEL_CENTER_OFFSET_MIN ||
		centerOffsetX > WHEEL_CENTER_OFFSET_MAX
	) {
		throw new CalibrationValidationError(
			`centerOffsetX debe estar entre ${WHEEL_CENTER_OFFSET_MIN} y ${WHEEL_CENTER_OFFSET_MAX}.`,
		);
	}

	if (
		!Number.isFinite(centerOffsetY) ||
		centerOffsetY < WHEEL_CENTER_OFFSET_MIN ||
		centerOffsetY > WHEEL_CENTER_OFFSET_MAX
	) {
		throw new CalibrationValidationError(
			`centerOffsetY debe estar entre ${WHEEL_CENTER_OFFSET_MIN} y ${WHEEL_CENTER_OFFSET_MAX}.`,
		);
	}

	if (
		!Number.isFinite(centerScale) ||
		centerScale < WHEEL_CENTER_SCALE_MIN ||
		centerScale > WHEEL_CENTER_SCALE_MAX
	) {
		throw new CalibrationValidationError(
			`centerScale debe estar entre ${WHEEL_CENTER_SCALE_MIN} y ${WHEEL_CENTER_SCALE_MAX}.`,
		);
	}

	return {
		alignmentOffset,
		initialAngle,
		diskOffsetX,
		diskOffsetY,
		diskScale,
		diskRotation,
		centerOffsetX,
		centerOffsetY,
		centerScale,
	};
}
