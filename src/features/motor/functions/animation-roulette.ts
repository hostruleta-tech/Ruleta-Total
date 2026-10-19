import type { DefaultRouletteOptions } from "../config";
import type { Geometry, RotationDirection, RouletteItem } from "../types";
import { drawCanvas } from "./draw-canvas";
import { getResultName } from "./utils";

// Duración de un frame de referencia (60fps). Sirve para normalizar la
// velocidad entre pantallas con distinta frecuencia de refresco.
const FRAME_MS = 1000 / 60;

// Velocidad mínima para dar el giro por terminado y evitar un frenado infinito.
const MIN_SPEED = 0.04;

const calculateSpeed = (
	curSpeed: number,
	options: DefaultRouletteOptions,
	deltaFrames: number,
): number => {
	if (curSpeed <= options.maxSpeed) {
		return curSpeed + options.acceleration * deltaFrames;
	}
	return curSpeed;
};

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

export const animateRoulette = ({
	rouletteItemList,
	mergedOptions,
	context,
	status,
	geometry,
	rouletteRef,
	onFinish,
}: {
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
}) => {
	const getTotalRotation = calcTotalRotation(mergedOptions.rotationDirection);

	let animationFrameId = 0;
	let curSpeed = rouletteRef.current.speed;
	let prevTime = 0;

	// Estado del frenado suave.
	let endingStarted = false;
	let endingStartSpeed = 0;
	let endingElapsed = 0;

	const animate = (time: number) => {
		const dt = prevTime ? time - prevTime : FRAME_MS;
		prevTime = time;
		// Normalizamos a "frames de 60fps" y limitamos saltos grandes (p. ej. al
		// volver de una pestaña en segundo plano).
		const deltaFrames = Math.min(dt / FRAME_MS, 3);

		if (status === "ending") {
			if (!endingStarted) {
				endingStarted = true;
				endingStartSpeed = curSpeed > 0 ? curSpeed : mergedOptions.maxSpeed;
			}

			endingElapsed += dt;
			const progress = Math.min(endingElapsed / mergedOptions.stopDuration, 1);
			// Frenado progresivo (ease-out cúbico): comienza con una desaceleración
			// clara y se va suavizando hasta detenerse casi imperceptiblemente, en
			// lugar de frenar de golpe como una desaceleración lineal.
			const eased = (1 - progress) ** 3;
			curSpeed = endingStartSpeed * eased;

			rouletteRef.current.speed = curSpeed;
			rouletteRef.current.totalRotation = getTotalRotation(
				rouletteRef.current.totalRotation,
				curSpeed * deltaFrames,
			);

			drawCanvas({
				rouletteItemList,
				mergedOptions,
				context,
				geometry,
				rouletteRef,
			});

			if (progress >= 1 || curSpeed <= MIN_SPEED) {
				const rouletteResult = getResultName({
					rouletteItemList,
					rotationDirection: mergedOptions.rotationDirection,
					totalRotation: rouletteRef.current.totalRotation,
				});
				onFinish(rouletteResult);
				return;
			}

			animationFrameId = requestAnimationFrame(animate);
			return;
		}

		// Fase de giro: acelera hasta la velocidad máxima.
		curSpeed = calculateSpeed(curSpeed, mergedOptions, deltaFrames);
		rouletteRef.current.speed = curSpeed;
		rouletteRef.current.totalRotation = getTotalRotation(
			rouletteRef.current.totalRotation,
			curSpeed * deltaFrames,
		);

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
