import type { DefaultRouletteOptions } from "../config";
import type { Geometry, RotationDirection, RouletteItem } from "../types";
import { drawCanvas } from "./draw-canvas";
import { calculateTargetRotation } from "./utils";

// Duración de un frame de referencia (60fps). Sirve para normalizar la
// velocidad entre pantallas con distinta frecuencia de refresco.
const FRAME_MS = 1000 / 60;

const calcTotalRotation = (rotationDirection: RotationDirection) => {
	if (rotationDirection === "clockwise") {
		return (totalRotation: number, curSpeed: number) => {
			return totalRotation - curSpeed;
		};
	}
	return (totalRotation: number, curSpeed: number) => {
		return totalRotation + curSpeed;
	};
};

interface AnimateRouletteParams {
	rouletteItemList: RouletteItem[];
	mergedOptions: DefaultRouletteOptions;
	context: CanvasRenderingContext2D;
	status: "running" | "ending";
	geometry: Geometry;
	rouletteRef: React.MutableRefObject<{
		speed: number;
		totalRotation: number;
	}>;
	onFinish: (rouletteResult: string) => void;
	// Índice del premio ganador, ya decidido por el servidor.
	// Si no se proporciona, se sortea internamente (compatibilidad/fallback).
	targetWinnerIndex?: number;
	/**
	 * Notifica la rotación total (grados) en cada frame, para sincronizar una
	 * versión visual (por ejemplo, una imagen giratoria) sin re-renderizar.
	 */
	onRotationChange?: (totalRotation: number) => void;
}

export const animateRoulette = ({
	rouletteItemList,
	mergedOptions,
	context,
	status,
	geometry,
	rouletteRef,
	onFinish,
	targetWinnerIndex,
	onRotationChange,
}: AnimateRouletteParams) => {
	const getTotalRotation = calcTotalRotation(mergedOptions.rotationDirection);

	let animationFrameId = 0;
	let curSpeed = rouletteRef.current.speed;
	let prevTime = 0;

	// Estado del frenado: el ganador y el punto de aterrizaje se deciden una
	// sola vez, al comenzar a detenerse.
	let endingStarted = false;
	let endingElapsed = 0;
	let endingStartRotation = 0;
	let endingTargetRotation = 0;
	let endingWinnerName = "No Result";

	const animate = (time: number) => {
		const dt = prevTime ? time - prevTime : FRAME_MS;
		prevTime = time;
		// Normalizamos a "frames de 60fps" y limitamos saltos grandes (p. ej. al
		// volver de una pestaña en segundo plano).
		const deltaFrames = Math.min(dt / FRAME_MS, 3);

		if (status === "ending") {
			const stopDuration = Math.max(1, mergedOptions.stopDuration);

			if (!endingStarted) {
				endingStarted = true;
				endingElapsed = 0;
				endingStartRotation = rouletteRef.current.totalRotation;

				const itemCount = rouletteItemList.length;
				if (itemCount === 0) {
					onFinish("No Result");
					return;
				}

				// El ganador: si viene del servidor (targetWinnerIndex), se usa ese;
				// si no, se sortea según la probabilidad (peso) de cada premio.
				const winnerIndex =
					targetWinnerIndex != null && targetWinnerIndex >= 0 &&
					targetWinnerIndex < itemCount
						? targetWinnerIndex
						: pickWeightedIndexLocal(rouletteItemList);

				endingWinnerName =
					rouletteItemList[winnerIndex]?.name ?? "No Result";

				const startSpeed = curSpeed > 0 ? curSpeed : mergedOptions.maxSpeed;
				// Distancia aproximada del frenado anterior: mantiene la misma
				// duración y sensación de giro.
				const totalFrames = stopDuration / FRAME_MS;
				const desiredDistance = (startSpeed * totalFrames) / 4;

				endingTargetRotation = calculateTargetRotation({
					currentRotation: endingStartRotation,
					winnerIndex,
					itemCount,
					rotationDirection: mergedOptions.rotationDirection,
					startAngle: mergedOptions.determineAngle,
					desiredDistance,
				});

				rouletteRef.current.speed = 0;
			}

			endingElapsed += dt;
			const progress = Math.min(endingElapsed / stopDuration, 1);
			// Ease-out cuártico: arranca con la velocidad actual y frena suave.
			const eased = 1 - (1 - progress) ** 4;

			rouletteRef.current.totalRotation =
				endingStartRotation +
				(endingTargetRotation - endingStartRotation) * eased;

			onRotationChange?.(rouletteRef.current.totalRotation);

			drawCanvas({
				rouletteItemList,
				mergedOptions,
				context,
				geometry,
				rouletteRef,
			});

			if (progress >= 1) {
				rouletteRef.current.totalRotation =
					((endingTargetRotation % 360) + 360) % 360;
				rouletteRef.current.speed = 0;
				// Sincroniza la rotación exacta final de la imagen.
				onRotationChange?.(rouletteRef.current.totalRotation);
				onFinish(endingWinnerName);
				return;
			}

			animationFrameId = requestAnimationFrame(animate);
			return;
		}

		// Fase de giro: a velocidad máxima constante hasta que el hook
		// cambie el status a "ending" (tras spinDuration).
		curSpeed = mergedOptions.maxSpeed;
		rouletteRef.current.speed = curSpeed;
		rouletteRef.current.totalRotation = getTotalRotation(
			rouletteRef.current.totalRotation,
			curSpeed * deltaFrames,
		);

		onRotationChange?.(rouletteRef.current.totalRotation);

		drawCanvas({
			rouletteItemList,
			mergedOptions,
			context,
			geometry,
			rouletteRef,
		});

		animationFrameId = requestAnimationFrame(animate);
	};

	animationFrameId = requestAnimationFrame(animate);
	return () => cancelAnimationFrame(animationFrameId);
};

// Sorteo ponderado local (fallback si no viene targetWinnerIndex)
function pickWeightedIndexLocal(pieList: RouletteItem[]): number {
	if (pieList.length === 0) return -1;

	const weights = pieList.map((pie) => {
		const value = pie.weight == null ? 1 : Number(pie.weight);
		return Number.isFinite(value) && value > 0 ? value : 0;
	});
	const total = weights.reduce((acc, weight) => acc + weight, 0);

	if (total <= 0) {
		return Math.floor(Math.random() * pieList.length);
	}

	let random = Math.random() * total;
	for (let index = 0; index < pieList.length; index += 1) {
		random -= weights[index];
		if (random < 0) return index;
	}
	return pieList.length - 1;
}