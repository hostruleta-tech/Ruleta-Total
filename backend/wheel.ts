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
 */
export interface WheelCalibration {
	alignmentOffset: number;
	initialAngle: number;
}

/** Valores por defecto de la calibración (mismos que en wheel-design.ts). */
export const WHEEL_DEFAULT_ALIGNMENT_OFFSET = 0;
export const WHEEL_DEFAULT_INITIAL_ANGLE = 75;

/** Rango válido para `alignmentOffset` (grados). */
export const WHEEL_ALIGNMENT_OFFSET_MIN = -180;
export const WHEEL_ALIGNMENT_OFFSET_MAX = 180;

/** Rango válido para `initialAngle` (grados). */
export const WHEEL_INITIAL_ANGLE_MIN = 0;
export const WHEEL_INITIAL_ANGLE_MAX = 360;

/** Error de validación de calibración. */
export class CalibrationValidationError extends Error {}

/** Valida y normaliza la calibración recibida del panel. */
export function sanitizeCalibration(
	raw: unknown,
): WheelCalibration {
	const candidate = (raw ?? {}) as {
		alignmentOffset?: unknown;
		initialAngle?: unknown;
	};

	const alignmentOffset = Number(candidate.alignmentOffset);
	const initialAngle = Number(candidate.initialAngle);

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

	return { alignmentOffset, initialAngle };
}
