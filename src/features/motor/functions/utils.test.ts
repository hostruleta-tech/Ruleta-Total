import { describe, expect, it } from "vitest";
import {
	POINTER_ANGLE,
	calculateSegmentAngle,
	calculateTargetRotation,
	getSegmentIndexAtPointer,
} from "./utils";

const ITEM_COUNT = 6;
const START_ANGLE = 45;
const ANGLE_PER_SECTOR = calculateSegmentAngle(ITEM_COUNT); // 60

/** Rotación final (mod 360) con la que el sector ganador queda bajo el puntero. */
const expectedLanding = (winner: number): number =>
	(POINTER_ANGLE -
		START_ANGLE +
		(winner + 1 - 0.5) * ANGLE_PER_SECTOR) %
	360;

const targetFor = (winner: number): number =>
	calculateTargetRotation({
		currentRotation: 0,
		winnerIndex: winner,
		itemCount: ITEM_COUNT,
		rotationDirection: "clockwise",
		startAngle: START_ANGLE,
		desiredDistance: 2000,
		minTurns: 1,
		pointerAngle: POINTER_ANGLE,
	});

describe("alineación del sector ganador con el puntero", () => {
	for (let winner = 0; winner < ITEM_COUNT; winner += 1) {
		it(`el sector ${winner} termina bajo el puntero (90°)`, () => {
			const target = targetFor(winner);
			const indexAtPointer = getSegmentIndexAtPointer({
				totalRotation: target,
				itemCount: ITEM_COUNT,
				startAngle: START_ANGLE,
				pointerAngle: POINTER_ANGLE,
			});
			expect(indexAtPointer).toBe(winner);
			expect(((target % 360) + 360) % 360).toBe(expectedLanding(winner));
		});
	}
});

describe("getSegmentIndexAtPointer en los límites de sector", () => {
	it("centro del sector 0 (rotación 75) -> índice 0", () => {
		expect(
			getSegmentIndexAtPointer({
				totalRotation: 75,
				itemCount: ITEM_COUNT,
				startAngle: START_ANGLE,
				pointerAngle: POINTER_ANGLE,
			}),
		).toBe(0);
	});

	it("centro del sector 1 (rotación 135) -> índice 1", () => {
		expect(
			getSegmentIndexAtPointer({
				totalRotation: 135,
				itemCount: ITEM_COUNT,
				startAngle: START_ANGLE,
				pointerAngle: POINTER_ANGLE,
			}),
		).toBe(1);
	});

	it("centro del sector 5 (rotación 15) -> índice 5", () => {
		expect(
			getSegmentIndexAtPointer({
				totalRotation: 15,
				itemCount: ITEM_COUNT,
				startAngle: START_ANGLE,
				pointerAngle: POINTER_ANGLE,
			}),
		).toBe(5);
	});

	it("centro del sector 4 (rotación 315) -> índice 4", () => {
		expect(
			getSegmentIndexAtPointer({
				totalRotation: 315,
				itemCount: ITEM_COUNT,
				startAngle: START_ANGLE,
				pointerAngle: POINTER_ANGLE,
			}),
		).toBe(4);
	});

	it("costura exacta en 0° (rotación 45) resuelve al último sector", () => {
		// El borde entre el sector 5 y el 0: se resuelve al sector anterior.
		expect(
			getSegmentIndexAtPointer({
				totalRotation: 45,
				itemCount: ITEM_COUNT,
				startAngle: START_ANGLE,
				pointerAngle: POINTER_ANGLE,
			}),
		).toBe(5);
	});
});