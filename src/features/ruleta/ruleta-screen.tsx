import React, {
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Maximize, Minimize } from "lucide-react";
import { useRoulette } from "@/features/motor/hooks/use-roulette";
import type { RouletteItem } from "@/features/motor/types";
import { Roulette } from "@/features/motor/components/roulette";
import { PrizeModal } from "./prize-modal";
import { soundManager } from "@/shared/sound-manager";
import { useFullscreen } from "@/shared/use-fullscreen";
import { API_URL } from "@/shared/api";
import logoTotal from "@/assets/logotipo-total.png";

// Foto de taller usada como elemento decorativo difuminado
const TOOLS_PHOTO =
	"https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1400&q=80";

interface RouletteState {
	command: "stopped" | "spinning";
	targetPrize: string | null;
	timestamp: number;
}

// Reserva del marco cromado exterior (padding + bisel)
const FRAME_PADDING = 26;
const MIN_WHEEL = 180;
const MAX_WHEEL = 560;

/**
 * Tamaño de la ruleta calculado a partir del área realmente disponible
 * (medida con ResizeObserver), para que siempre quepa en pantalla sin scroll.
 */
const useWheelSize = () => {
	const areaRef = useRef<HTMLDivElement>(null);
	const [size, setSize] = useState(320);

	useEffect(() => {
		const element = areaRef.current;
		if (!element) return;

		const updateSize = () => {
			const rect = element.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;

			const available = Math.min(rect.width, rect.height) - FRAME_PADDING;
			const clamped = Math.min(Math.max(available, MIN_WHEEL), MAX_WHEEL);
			setSize(Math.round(clamped));
		};

		updateSize();

		const observer = new ResizeObserver(updateSize);
		observer.observe(element);
		window.addEventListener("resize", updateSize);

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", updateSize);
		};
	}, []);

	return { size, areaRef };
};

/** Controles imperativos del motor, expuestos al padre para disparar giros sin esperar al polling. */
interface RouletteControls {
	start: () => void;
	stop: () => void;
}

const RouletteGame: React.FC<{
	items: RouletteItem[];
	onPrizeWon: (prize: string) => void;
	isPaused: boolean;
	size: number;
	onSpinStateChange: (spinning: boolean) => void;
	onControlsReady?: (controls: RouletteControls) => void;
}> = ({
	items,
	onPrizeWon,
	isPaused,
	size,
	onSpinStateChange,
	onControlsReady,
}) => {
	const { roulette, onStart, onStop } = useRoulette({
		items,
		onSpinEnd: (result: string) => {
			onPrizeWon(result);
		},
		options: {
			size,
			style: {
				canvas: {
					bg: "transparent",
				},
				label: {
					// Fuente de la app, tamaño proporcional a la ruleta
					font: `700 ${Math.max(11, Math.round(size * 0.042))}px "Montserrat Variable", Arial, sans-serif`,
					align: "center",
					baseline: "middle",
					offset: 0.7,
				},
				arrow: {
					// Ocultamos la flecha por defecto del canvas ya que usamos el puntero metálico 3D superior
					bg: "transparent",
				},
				pie: {
					borderWidth: 2,
					borderColor: "#e2e8f0",
					border: true,
				},
			},
		},
	});

	const lastCommandTimestamp = useRef<number>(0);

	// Expone los controles del motor (girar/detener) al componente padre
	useEffect(() => {
		onControlsReady?.({ start: onStart, stop: onStop });
	}, [onControlsReady, onStart, onStop]);

	// Polling de comandos remotos
	useEffect(() => {
		const pollInterval = setInterval(async () => {
			try {
				if (isPaused) return;

				const response = await fetch(`${API_URL}/state`);
				if (!response.ok) return;

				const state: RouletteState = await response.json();

				if (state.timestamp > lastCommandTimestamp.current) {
					lastCommandTimestamp.current = state.timestamp;

					// Las órdenes se aplican siempre que lleguen: onStart/onStop del
					// motor ya son idempotentes (comprueban el estado interno). Así la
					// pantalla reacciona aunque el giro lo haya lanzado el panel y se
					// mantiene sincronizado el estado de "girando".
					if (state.command === "spinning") {
						soundManager.playSpinStart();
						onSpinStateChange(true);
						onStart();
					} else if (state.command === "stopped") {
						onSpinStateChange(false);
						onStop();
					}
				}
			} catch (error) {
				console.error("Polling error:", error);
			}
		}, 2000);

		return () => clearInterval(pollInterval);
	}, [onSpinStateChange, onStart, onStop, isPaused]);

	return (
		<div className="relative flex items-center justify-center">
			{/* MARCO CROMADO EXTERIOR */}
			<div
				className="relative rounded-full p-[14px] shadow-[0_20px_50px_rgba(0,0,0,0.35),0_10px_20px_rgba(0,0,0,0.2)]"
				style={{
					background:
						"linear-gradient(145deg, #d8dee3 0%, #ffffff 25%, #8f9ba6 50%, #f4f6f8 75%, #6a7682 100%)",
				}}
			>
				{/* BISEL INTERMEDIO (ANILLO DE PROFUNDIDAD) */}
				<div
					className="relative rounded-full p-[8px] shadow-inner"
					style={{
						background:
							"linear-gradient(135deg, #5b646c 0%, #a2adb7 40%, #ffffff 70%, #464f56 100%)",
					}}
				>
					{/* BORDE FINO BLANCO */}
					<div className="rounded-full bg-slate-900/10 p-[2px] overflow-hidden flex items-center justify-center">
						<Roulette roulette={roulette} />
					</div>
				</div>
			</div>

			{/* FLECHA / PUNTERO 3D ROJO EN LA PARTE SUPERIOR */}
			<div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none drop-shadow-[0_4px_6px_rgba(0,0,0,0.4)]">
				<svg
					width="42"
					height="48"
					viewBox="0 0 42 48"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d="M21 46L3.67949 11.5C1.75499 7.66987 4.54486 3 8.84937 3H33.1506C37.4551 3 40.245 7.66987 38.3205 11.5L21 46Z"
						fill="url(#arrow-gradient)"
						stroke="#8f0000"
						strokeWidth="1.5"
					/>
					<defs>
						<linearGradient
							id="arrow-gradient"
							x1="4"
							y1="3"
							x2="38"
							y2="46"
							gradientUnits="userSpaceOnUse"
						>
							<stop stopColor="#ff4d4d" />
							<stop offset="0.45" stopColor="#e30613" />
							<stop offset="1" stopColor="#8a0007" />
						</linearGradient>
					</defs>
				</svg>
			</div>

			{/* CENTRO DE LA RULETA (TOTAL BADGE) */}
			<div
				className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 rounded-full p-[6px] shadow-[0_4px_15px_rgba(0,0,0,0.45)] pointer-events-none"
				style={{
					background:
						"linear-gradient(135deg, #e6ecf0 0%, #83919c 50%, #ffffff 100%)",
					width: Math.round(size * 0.28),
					height: Math.round(size * 0.28),
				}}
			>
				<div className="w-full h-full rounded-full bg-[#035157] flex items-center justify-center border-2 border-white/80 shadow-inner">
					<img
						src={logoTotal}
						alt="TOTAL"
						draggable={false}
						className="w-[72%] h-auto object-contain select-none drop-shadow-md"
					/>
				</div>
			</div>
		</div>
	);
};

export const RouletteViewHook: React.FC = () => {
	const { size: wheelSize, areaRef } = useWheelSize();
	const { isFullscreen, toggleFullscreen } = useFullscreen();
	const [rouletteItems, setRouletteItems] = useState<RouletteItem[] | null>(null);
	const [finalResult, setFinalResult] = useState<string | null>(null);
	const [isSpinning, setIsSpinning] = useState<boolean>(false);
	const isModalOpen = finalResult !== null;

	// Controles del motor (girar/detener) expuestos por RouletteGame
	const controlsRef = useRef<RouletteControls | null>(null);
	const handleControlsReady = useCallback((controls: RouletteControls) => {
		controlsRef.current = controls;
	}, []);

	useEffect(() => {
		const fetchPrizes = async () => {
			if (isModalOpen) return;

			try {
				const response = await fetch(`${API_URL}/configuracion`);
				const data = await response.json();
				const formattedPrizes: RouletteItem[] = (
					(data?.prizes ?? []) as {
						name: string;
						backgroundColor?: string;
						probability: number;
					}[]
				).map((p) => ({
					name: p.name,
					bg: p.backgroundColor || "#0a4e58",
					weight: p.probability,
				}));
				setRouletteItems(formattedPrizes);
			} catch (error) {
				console.error("Failed to fetch prizes", error);
			}
		};

		fetchPrizes();
		const configPollInterval = setInterval(fetchPrizes, 5000);
		return () => clearInterval(configPollInterval);
	}, [isModalOpen]);

	const handleLocalSpin = async () => {
		if (isSpinning || isModalOpen) return;
		try {
			// Arranca el motor localmente (sin esperar al polling) y avisa al
			// backend para que el panel del operador quede sincronizado.
			setIsSpinning(true);
			controlsRef.current?.start();

			const response = await fetch(`${API_URL}/command`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "spin" }),
			});

			if (!response.ok) {
				const result = await response.json().catch(() => ({}));
				throw new Error(
					(result as { message?: string }).message || "Spin request failed",
				);
			}
		} catch (error) {
			console.error("Spin request failed", error);
			// Revierte el arranque local si el backend no aceptó el giro
			controlsRef.current?.stop();
			setIsSpinning(false);
		}
	};

	const handlePrizeWon = (prize: string) => {
		setIsSpinning(false);
		setFinalResult(prize);

		// Informa al backend que el giro terminó por sí solo, para dejar su
		// estado en "stopped" y evitar que la TV se ponga a girar sola al
		// recargar.
		fetch(`${API_URL}/command`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ action: "finished" }),
		}).catch((error) => console.error("Finish notification failed", error));
	};

	return (
		<div className="h-[100dvh] w-full overflow-hidden bg-[#eef2f5] relative flex flex-col items-center justify-center px-3 py-3 sm:px-4">
			{/* FONDO AMBIENTAL CON TEXTURA SUTIL TOTAL TOOLS */}
			<div
				className="absolute inset-0 pointer-events-none opacity-40 mix-blend-multiply"
				style={{
					backgroundImage:
						"radial-gradient(#94a3b8 1px, transparent 1px), radial-gradient(#94a3b8 1px, #eef2f5 1px)",
					backgroundSize: "40px 40px",
					backgroundPosition: "0 0, 20px 20px",
				}}
			/>
			{/* DETALLE SUPERIOR EN COLOR TEAL */}
			<div className="absolute top-0 left-0 right-0 h-2 bg-[#024a52] z-30" />

			{/* IMAGEN DECORATIVA DIFUMINADA (ESQUINA SUPERIOR DERECHA) */}
			<div
				className="pointer-events-none absolute -top-6 -right-8 z-0 h-[40%] w-[78%] max-w-[760px] opacity-40"
				aria-hidden="true"
				style={{
					filter: "blur(4px)",
					transform: "scale(1.05)",
					maskImage:
						"linear-gradient(to bottom left, #000 8%, rgba(0,0,0,0.6) 45%, transparent 88%)",
					WebkitMaskImage:
						"linear-gradient(to bottom left, #000 8%, rgba(0,0,0,0.6) 45%, transparent 88%)",
				}}
			>
				<img
					src={TOOLS_PHOTO}
					alt=""
					draggable={false}
					className="h-full w-full object-cover object-center"
				/>
				<div className="absolute inset-0 bg-gradient-to-bl from-[#035157]/45 via-[#0a4e58]/20 to-transparent mix-blend-multiply" />
			</div>

			{/* CONTENEDOR PRINCIPAL TIPO POSTER / APP */}
			<div className="relative z-10 w-full max-w-sm sm:max-w-md flex flex-col items-center min-h-0 flex-1 justify-center gap-3 sm:gap-4">
				{/* 1. TÍTULOS */}
				<div className="w-full text-left shrink-0">
					<h1 className="text-2xl sm:text-3xl font-black italic tracking-tight text-[#0a454d] leading-none">
						Ruleta <span className="font-black">Digital</span>
					</h1>
					<p className="text-slate-800 text-xs sm:text-sm font-bold mt-1 tracking-tight">
						¡Gira y gana con Total Tools!
					</p>
					{/* Línea roja de acento */}
					<div className="w-12 h-1.5 bg-[#e30613] rounded-full mt-2" />
				</div>

				{/* 2. ÁREA DE LA RULETA (medida para ajustarse a la pantalla) */}
				<div
					ref={areaRef}
					className="w-full flex-1 min-h-0 flex items-center justify-center"
				>
					{rouletteItems ? (
						<RouletteGame
							items={rouletteItems}
							onPrizeWon={handlePrizeWon}
							isPaused={isModalOpen}
							size={wheelSize}
							onSpinStateChange={setIsSpinning}
							onControlsReady={handleControlsReady}
						/>
					) : (
						<div className="h-64 flex flex-col items-center justify-center gap-3">
							<div className="w-10 h-10 border-4 border-[#035157] border-t-transparent rounded-full animate-spin" />
							<p className="text-sm font-semibold text-[#035157]">Cargando ruleta...</p>
						</div>
					)}
				</div>

				{/* 3. BOTÓN DE GIRO Y TARJETA INFERIOR */}
				<div className="w-full flex flex-col items-center gap-2.5 shrink-0 pb-1">
					{/* BOTÓN GIRAR RULETA */}
					<button
						onClick={handleLocalSpin}
						disabled={isSpinning || !rouletteItems}
						className={`
							w-full max-w-[340px] py-3 px-6 rounded-full flex items-center justify-center gap-3
							text-white font-black tracking-wider uppercase text-base sm:text-lg
							shadow-[0_8px_20px_rgba(227,6,19,0.38),inset_0_2px_4px_rgba(255,255,255,0.4)]
							transition-all duration-200 active:scale-95 active:shadow-sm
							${
								isSpinning
									? "opacity-80 cursor-not-allowed bg-gradient-to-b from-[#b8000b] to-[#800007]"
									: "bg-gradient-to-b from-[#ff2424] via-[#e30613] to-[#a80009] hover:brightness-105"
							}
						`}
					>
						{/* Icono de recargar / girar con animación */}
						<svg
							className={`w-6 h-6 ${isSpinning ? "animate-spin" : ""}`}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.8"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
							<path d="M3 3v5h5" />
							<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
							<path d="M16 21h5v-5" />
						</svg>
						<span>{isSpinning ? "Girando..." : "Girar Ruleta"}</span>
					</button>

					{/* TARJETA: "Tu premio aparecerá aquí" */}
					<div className="w-full max-w-[340px] bg-white/95 border border-slate-200/90 rounded-2xl p-3 flex items-center gap-3 shadow-sm backdrop-blur-sm">
						{/* Icono de regalo estilizado en Teal */}
						<div className="w-10 h-10 rounded-xl bg-[#035157]/10 flex items-center justify-center flex-shrink-0 text-[#035157]">
							<svg
								className="w-6 h-6"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polyline points="20 12 20 22 4 22 4 12" />
								<rect x="2" y="7" width="20" height="5" />
								<line x1="12" y1="22" x2="12" y2="7" />
								<path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
								<path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
							</svg>
						</div>

						{/* Información del premio */}
						<div className="flex flex-col text-left">
							<span className="text-slate-900 font-extrabold text-sm sm:text-base leading-tight">
								{finalResult ? finalResult : "Tu premio aparecerá aquí"}
							</span>
							<span className="text-slate-500 text-xs sm:text-sm font-medium mt-0.5">
								{finalResult ? "¡Felicidades por ganar!" : "¡Buena suerte!"}
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* BOTÓN FLOTANTE DE PANTALLA COMPLETA */}
			<button
				type="button"
				onClick={toggleFullscreen}
				aria-label={
					isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"
				}
				title={
					isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"
				}
				className="fixed bottom-4 right-4 z-40 h-10 w-10 sm:h-11 sm:w-11 rounded-full bg-white/70 text-[#0a454d] border border-slate-200/80 shadow-lg backdrop-blur-md flex items-center justify-center transition hover:bg-white active:scale-95"
			>
				{isFullscreen ? (
					<Minimize className="h-5 w-5" aria-hidden="true" />
				) : (
					<Maximize className="h-5 w-5" aria-hidden="true" />
				)}
			</button>

			{/* Modal cuando se gana un premio */}
			{isModalOpen && (
				<PrizeModal prize={finalResult} onClose={() => setFinalResult(null)} />
			)}
		</div>
	);
};