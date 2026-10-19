import React, { useState, useEffect, useRef } from "react";
import { useRoulette } from "@/features/motor/hooks/use-roulette";
import type { RouletteItem } from "@/features/motor/types";
import { Roulette } from "@/features/motor/components/roulette";
import { PrizeModal } from "./prize-modal";
import { soundManager } from "@/shared/sound-manager";
import { API_URL } from "@/shared/api";

interface RouletteState {
	command: "stopped" | "spinning";
	targetPrize: string | null;
	timestamp: number;
}

// Hook para manejar el tamaño de la ventana
const useWindowSize = () => {
	const [size, setSize] = useState([window.innerWidth, window.innerHeight]);
	useEffect(() => {
		const handleResize = () => {
			setSize([window.innerWidth, window.innerHeight]);
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);
	return size;
};

const RouletteGame: React.FC<{
	items: RouletteItem[];
	onPrizeWon: (prize: string) => void;
	isPaused: boolean;
	size: number;
}> = ({ items, onPrizeWon, isPaused, size }) => {
	const { roulette, onStart, onStop } = useRoulette({
		items,
		onSpinEnd: (result: string) => {
			onPrizeWon(result);
		},
		options: {
			size, // Usamos el tamaño dinámico
			style: {
				canvas: {
					bg: "transparent",
				},
				arrow: {
					bg: "#a6192e",
				},
				pie: {
					borderWidth: 2,
					borderColor: "white",
					border: true,
				},
			},
		},
	});
	const lastCommandTimestamp = useRef<number>(0);
	const [isSpinning, setIsSpinning] = useState(false);

	useEffect(() => {
		const pollInterval = setInterval(async () => {
			try {
				if (isPaused) return;

				const response = await fetch(`${API_URL}/state`);
				if (!response.ok) return;

				const state: RouletteState = await response.json();

				if (state.timestamp > lastCommandTimestamp.current) {
					lastCommandTimestamp.current = state.timestamp;

					if (state.command === "spinning") {
						if (!isSpinning) {
							soundManager.playSpinStart();
							setIsSpinning(true);
							onStart();
						}
					} else if (state.command === "stopped" && isSpinning) {
						onStop();
						setIsSpinning(false);
					}
				}
			} catch (error) {
				console.error("Polling error:", error);
			}
		}, 2000);

		return () => clearInterval(pollInterval);
	}, [isSpinning, onStart, onStop, isPaused]);

	return <Roulette roulette={roulette} />;
};

export const RouletteViewHook: React.FC = () => {
	const [width, height] = useWindowSize();
	const [rouletteItems, setRouletteItems] = useState<RouletteItem[] | null>(
		null,
	);
	const [finalResult, setFinalResult] = useState<string | null>(null);
	const isModalOpen = finalResult !== null;

	// Calcula el tamaño de la ruleta para que sea responsiva
	const rouletteSize = Math.min(width, height) * 0.8;

	useEffect(() => {
		const fetchPrizes = async () => {
			if (isModalOpen) return;

			try {
				const response = await fetch(`${API_URL}/configuracion`);
				const data = await response.json();
				const formattedPrizes: RouletteItem[] = (data.prizes || []).map(
					(p: any) => ({
						name: p.name,
						bg: p.backgroundColor,
						weight: p.probability,
					}),
				);
				setRouletteItems(formattedPrizes);
			} catch (error) {
				console.error("Failed to fetch prizes", error);
			}
		};

		fetchPrizes();
		const configPollInterval = setInterval(fetchPrizes, 5000);
		return () => clearInterval(configPollInterval);
	}, [isModalOpen]);

	return (
		<div className="w-full h-screen flex gap-4 flex-col items-center justify-center relative">
			{rouletteItems ? (
				<RouletteGame
					items={rouletteItems}
					onPrizeWon={setFinalResult}
					isPaused={isModalOpen}
					size={rouletteSize}
				/>
			) : (
				<p>Cargando ruleta...</p>
			)}
			{isModalOpen ? (
				<PrizeModal prize={finalResult} onClose={() => setFinalResult(null)} />
			) : null}
		</div>
	);
};
