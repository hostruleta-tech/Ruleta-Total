import { describe, expect, it } from "vitest";
import { sanitizePrizes } from "./app";
import {
	WHEEL_SECTOR_COUNT,
	hasCompleteSectorMapping,
	isValidSectorIndex,
	sanitizeCalibration,
	CalibrationValidationError,
} from "./wheel";

const prizeForSector = (sectorIndex: number) => ({
	name: `Premio ${sectorIndex + 1}`,
	backgroundColor: "#0A4E58",
	probability: 10,
	sectorIndex,
});

const completePrizes = () =>
	Array.from({ length: WHEEL_SECTOR_COUNT }, (_, index) =>
		prizeForSector(index),
	);

describe("sectores fijos de la ruleta", () => {
	it("reconoce índices de sector válidos", () => {
		expect(isValidSectorIndex(0)).toBe(true);
		expect(isValidSectorIndex(5)).toBe(true);
		expect(isValidSectorIndex(-1)).toBe(false);
		expect(isValidSectorIndex(6)).toBe(false);
		expect(isValidSectorIndex(1.5)).toBe(false);
		expect(isValidSectorIndex(null)).toBe(false);
	});

	it("acepta exactamente los 6 sectores sin duplicados", () => {
		const prizes = sanitizePrizes(completePrizes());
		expect(prizes).toHaveLength(WHEEL_SECTOR_COUNT);
		expect(hasCompleteSectorMapping(prizes)).toBe(true);
		expect(prizes.map((prize) => prize.sectorIndex)).toEqual([
			0, 1, 2, 3, 4, 5,
		]);
	});

	it("rechaza una cantidad distinta de 6 premios", () => {
		expect(() => sanitizePrizes(completePrizes().slice(0, 5))).toThrow(
			/exactamente 6 premios/,
		);
		expect(() =>
			sanitizePrizes([...completePrizes(), prizeForSector(0)]),
		).toThrow(/exactamente 6 premios/);
	});

	it("rechaza sectores duplicados", () => {
		const prizes = completePrizes();
		prizes[5] = prizeForSector(4);
		expect(() => sanitizePrizes(prizes)).toThrow(/más de un premio/);
	});

	it("rechaza sectores fuera de rango", () => {
		const prizes = completePrizes();
		prizes[5] = prizeForSector(6);
		expect(() => sanitizePrizes(prizes)).toThrow(/sector válido/);
	});

	it("detecta mapeos incompletos con sectores nulos o repetidos", () => {
		expect(
			hasCompleteSectorMapping([
				...completePrizes().slice(0, 5),
				{ ...prizeForSector(0), sectorIndex: null },
			]),
		).toBe(false);
		expect(
			hasCompleteSectorMapping([
				...completePrizes().slice(0, 5),
				prizeForSector(4),
			]),
		).toBe(false);
	});
});

describe("sanitizeCalibration", () => {
	it("acepta valores válidos dentro de rango", () => {
		expect(
			sanitizeCalibration({
				alignmentOffset: 2.5,
				initialAngle: 90,
				diskOffsetX: -12,
				diskOffsetY: 20,
				diskScale: 1.1,
				diskRotation: -45,
				centerOffsetX: 8,
				centerOffsetY: -3,
				centerScale: 1.2,
			}),
		).toEqual({
			alignmentOffset: 2.5,
			initialAngle: 90,
			diskOffsetX: -12,
			diskOffsetY: 20,
			diskScale: 1.1,
			diskRotation: -45,
			centerOffsetX: 8,
			centerOffsetY: -3,
			centerScale: 1.2,
		});
		expect(
			sanitizeCalibration({ alignmentOffset: 0, initialAngle: 75 }),
		).toEqual({
			alignmentOffset: 0,
			initialAngle: 75,
			diskOffsetX: 0,
			diskOffsetY: 16,
			diskScale: 1,
			diskRotation: 0,
			centerOffsetX: 0,
			centerOffsetY: 0,
			centerScale: 1,
		});
		expect(
			sanitizeCalibration({ alignmentOffset: -180, initialAngle: 360 }),
		).toEqual({
			alignmentOffset: -180,
			initialAngle: 360,
			diskOffsetX: 0,
			diskOffsetY: 16,
			diskScale: 1,
			diskRotation: 0,
			centerOffsetX: 0,
			centerOffsetY: 0,
			centerScale: 1,
		});
	});

	it("rechaza alignmentOffset fuera de rango", () => {
		expect(() =>
			sanitizeCalibration({ alignmentOffset: -181, initialAngle: 75 }),
		).toThrow(CalibrationValidationError);
		expect(() =>
			sanitizeCalibration({ alignmentOffset: 181, initialAngle: 75 }),
		).toThrow(CalibrationValidationError);
	});

	it("rechaza initialAngle fuera de rango o no numérico", () => {
		expect(() =>
			sanitizeCalibration({ alignmentOffset: 0, initialAngle: -1 }),
		).toThrow(CalibrationValidationError);
		expect(() =>
			sanitizeCalibration({ alignmentOffset: 0, initialAngle: 361 }),
		).toThrow(CalibrationValidationError);
		expect(() =>
			sanitizeCalibration({ alignmentOffset: "no", initialAngle: "vale" }),
		).toThrow(CalibrationValidationError);
	});

	it("rechaza desplazamiento del PNG fuera de rango", () => {
		expect(() =>
			sanitizeCalibration({
				alignmentOffset: 0,
				initialAngle: 75,
				diskOffsetX: -201,
			}),
		).toThrow(CalibrationValidationError);
		expect(() =>
			sanitizeCalibration({
				alignmentOffset: 0,
				initialAngle: 75,
				diskOffsetY: 201,
			}),
		).toThrow(CalibrationValidationError);
	});

	it("rechaza escala del PNG fuera de rango", () => {
		expect(() =>
			sanitizeCalibration({
				alignmentOffset: 0,
				initialAngle: 75,
				diskScale: 0.49,
			}),
		).toThrow(CalibrationValidationError);
		expect(() =>
			sanitizeCalibration({
				alignmentOffset: 0,
				initialAngle: 75,
				diskScale: 1.51,
			}),
		).toThrow(CalibrationValidationError);
	});

	it("rechaza desplazamiento del centro fuera de rango", () => {
		expect(() =>
			sanitizeCalibration({
				alignmentOffset: 0,
				initialAngle: 75,
				centerOffsetX: -201,
			}),
		).toThrow(CalibrationValidationError);
		expect(() =>
			sanitizeCalibration({
				alignmentOffset: 0,
				initialAngle: 75,
				centerOffsetY: 201,
			}),
		).toThrow(CalibrationValidationError);
	});

	it("rechaza escala del centro fuera de rango", () => {
		expect(() =>
			sanitizeCalibration({
				alignmentOffset: 0,
				initialAngle: 75,
				centerScale: 0.49,
			}),
		).toThrow(CalibrationValidationError);
		expect(() =>
			sanitizeCalibration({
				alignmentOffset: 0,
				initialAngle: 75,
				centerScale: 1.51,
			}),
		).toThrow(CalibrationValidationError);
	});
});
