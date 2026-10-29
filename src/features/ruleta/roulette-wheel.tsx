import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRoulette } from "@/features/motor/hooks/use-roulette";
import type { RouletteItem } from "@/features/motor/types";
import { Roulette } from "@/features/motor/components/roulette";
import { API_URL } from "@/shared/api";
import { APP_FONT_FAMILY } from "@/shared/typography";
import {
	CENTER_IMAGE_URL,
	CENTER_SIZE_RATIO,
	WHEEL_ALIGNMENT_OFFSET,
	WHEEL_ALIGNMENT_OFFSET_MAX,
	WHEEL_ALIGNMENT_OFFSET_MIN,
	WHEEL_CENTER_OFFSET_MAX,
	WHEEL_CENTER_OFFSET_MIN,
	WHEEL_CENTER_OFFSET_X_PX,
	WHEEL_CENTER_OFFSET_Y_PX,
	WHEEL_CENTER_SCALE,
	WHEEL_CENTER_SCALE_MAX,
	WHEEL_CENTER_SCALE_MIN,
	WHEEL_DETERMINE_ANGLE,
	WHEEL_DISK_OFFSET_MAX,
	WHEEL_DISK_OFFSET_MIN,
	WHEEL_DISK_OFFSET_X_PX,
	WHEEL_DISK_OFFSET_Y_PX,
	WHEEL_DISK_ROTATION,
	WHEEL_DISK_ROTATION_MAX,
	WHEEL_DISK_ROTATION_MIN,
	WHEEL_DISK_SCALE,
	WHEEL_DISK_SCALE_MAX,
	WHEEL_DISK_SCALE_MIN,
	WHEEL_IMAGE_URL,
	WHEEL_INITIAL_ANGLE,
	WHEEL_INITIAL_ANGLE_MAX,
	WHEEL_INITIAL_ANGLE_MIN,
	WHEEL_PNG_OPACITY,
	WHEEL_POINTER_ANGLE,
	WHEEL_ROTATION_OFFSET,
	WHEEL_SECTOR_COUNT,
	isWheelDebugMode,
	readParamNumber,
} from "./wheel-design";

const WHEEL_ANGLE_PER_SECTOR = 360 / WHEEL_SECTOR_COUNT;

/** Controles del motor expuestos al padre. */
export interface RouletteWheelControls {
	start: (targetIndex?: number) => void;
}

export interface RouletteWheelProps {
	items: RouletteItem[];
	onPrizeWon: (prize: string) => void;
	onSpinStart: () => void;
	onSpinEnd: () => void;
	size: number;
	onControlsReady?: (controls: RouletteWheelControls) => void;
	/** Calibración guardada en el servidor (alineación PNG + pose inicial). */
	calibration?: WheelCalibration;
	/** Se dispara cuando el operador guarda una calibración desde el panel. */
	onCalibrationSaved?: (calibration: WheelCalibration) => void;
}

/**
 * Convierte un ángulo lógico del motor (90 = arriba, crece en sentido
 * antihorario) a coordenadas SVG (x, y) para un radio dado, con el ángulo
 * medido en sentido horario desde arriba.
 */
const polarPosition = (logicalAngle: number, radius: number) => {
	const psi = ((WHEEL_POINTER_ANGLE - logicalAngle) % 360 + 360) % 360;
	const rad = (psi * Math.PI) / 180;
	return { x: radius * Math.sin(rad), y: -radius * Math.cos(rad) };
};

interface DebugWheelOverlayProps {
	size: number;
	rotation: number;
	items: RouletteItem[];
}

/**
 * Overlay de depuración (`?wheelDebug=1`): dibuja los bordes que calcula el
 * motor y los números de sector sobre el PNG, para calibrar la alineación.
 */
const DebugWheelOverlay: React.FC<DebugWheelOverlayProps> = ({
	size,
	rotation,
	items,
}) => {
	const center = size / 2;
	const radius = size / 2;

	const boundaryLines = Array.from(
		{ length: WHEEL_SECTOR_COUNT + 1 },
		(_, index) => {
			// Borde entre el sector index-1 y index (lógica del drawRoulette).
			const logical = rotation + WHEEL_DETERMINE_ANGLE - index * WHEEL_ANGLE_PER_SECTOR;
			return polarPosition(logical, radius * 0.94);
		},
	);

	const sectorLabels = Array.from({ length: WHEEL_SECTOR_COUNT }, (_, index) => {
		const logical =
			rotation +
			WHEEL_DETERMINE_ANGLE -
			(index + 0.5) * WHEEL_ANGLE_PER_SECTOR;
		const pos = polarPosition(logical, radius * 0.55);
		const name = items[index]?.name ?? `#${index + 1}`;
		return { index, pos, name };
	});

	return (
		<svg
			className="pointer-events-none absolute inset-0 z-30"
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
		>
			{/* Línea del puntero (arriba) */}
			<line
				x1={center}
				y1={center}
				x2={center}
				y2={0}
				stroke="#00ffff"
				strokeWidth={2}
				strokeDasharray="6 4"
			/>
			{/* Bordes de sectores */}
			{boundaryLines.map((p, index) => (
				<line
					key={`b-${index}`}
					x1={center}
					y1={center}
					x2={center + p.x}
					y2={center + p.y}
					stroke="#ff00ff"
					strokeWidth={2}
				/>
			))}
			{/* Número de sector */}
			{sectorLabels.map(({ index, pos, name }) => (
				<g key={`s-${index}`}>
					<circle
						cx={center + pos.x}
						cy={center + pos.y}
						r={13}
						fill="rgba(0,0,0,0.65)"
					/>
					<text
						x={center + pos.x}
						y={center + pos.y + 4}
						textAnchor="middle"
						fontSize={12}
						fontWeight={800}
						fill="#00ffff"
					>
						{index}
					</text>
					<text
						x={center + pos.x}
						y={center + pos.y + 18}
						textAnchor="middle"
						fontSize={8}
						fill="#ffffff"
					>
						{name.length > 10 ? `${name.slice(0, 10)}…` : name}
					</text>
				</g>
			))}
			{/* Rotación actual (grados acumulados) */}
			<text x={8} y={16} fontSize={11} fontWeight={700} fill="#ffffff">
				{rotation.toFixed(1)}°
			</text>
		</svg>
	);
};

/** Calibración guardada en el servidor (alineación + pose inicial + PNG). */
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

/** Ajustes de visualización SOLO de calibración (opacidad y canvas). */
interface ViewSettings {
	pngOpacity: number;
	showCanvas: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const VIEW_STORAGE_KEY = "ruleta:wheelDebugView";
const PNG_OPACITY_MIN = 0.05;
const PNG_OPACITY_MAX = 1;
const DEFAULT_VIEW: ViewSettings = { pngOpacity: 0.55, showCanvas: true };

const clampNumber = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

/**
 * Activa el modo debug (`?wheelDebug=1`) SOLO si hay sesión de operador.
 * Sin el parámetro, o sin sesión confirmada, la ruleta se ve normal.
 */
const useWheelDebugAccess = (): boolean => {
	const requested = isWheelDebugMode();
	const [authenticated, setAuthenticated] = useState<boolean | null>(null);

	useEffect(() => {
		if (!requested) return;
		let cancelled = false;
		setAuthenticated(null);
		fetch(`${API_URL}/auth/me`, {
			credentials: "same-origin",
			cache: "no-store",
		})
			.then((res) => res.json().catch(() => ({})))
			.then((data) => {
				if (!cancelled) {
					setAuthenticated(
						(data as { authenticated?: boolean }).authenticated === true,
					);
				}
			})
			.catch(() => {
				if (!cancelled) setAuthenticated(false);
			});
		return () => {
			cancelled = true;
		};
	}, [requested]);

	return requested && authenticated === true;
};

/**
 * Ajustes locales de visualización del panel debug. Solo se persisten en el
 * navegador y nunca en el servidor (no afectan la ruleta de producción).
 *
 * IMPORTANTE: `debugMode` se confirma de forma asíncrona (sesión). Como el
 * inicializador de useState solo corre una vez (con debugMode aún false), aquí
 * usamos un efecto que recarga los ajustes cuando debugMode cambia.
 */
const useViewSettings = (debugMode: boolean) => {
	const [view, setView] = useState<ViewSettings>(() => ({
		pngOpacity: WHEEL_PNG_OPACITY,
		showCanvas: false,
	}));

	useEffect(() => {
		// Producción: PNG opacos y canvas oculto (comportamiento normal).
		if (!debugMode) {
			setView({ pngOpacity: WHEEL_PNG_OPACITY, showCanvas: false });
			return;
		}

		// Debug confirmado: cargar ajustes guardados (o los por defecto).
		try {
			const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
			if (!raw) {
				setView(DEFAULT_VIEW);
				return;
			}
			const parsed = JSON.parse(raw) as Partial<ViewSettings>;
			setView({
				pngOpacity: clampNumber(
					Number(parsed.pngOpacity) || DEFAULT_VIEW.pngOpacity,
					PNG_OPACITY_MIN,
					PNG_OPACITY_MAX,
				),
				showCanvas: parsed.showCanvas !== false,
			});
		} catch {
			setView(DEFAULT_VIEW);
		}
	}, [debugMode]);

	const updateView = useCallback(
		(patch: Partial<ViewSettings>) => {
			setView((previous) => {
				const next = { ...previous, ...patch };
				if (debugMode) {
					try {
						window.localStorage.setItem(
							VIEW_STORAGE_KEY,
							JSON.stringify(next),
						);
					} catch {
						// Noop: sin localStorage.
					}
				}
				return next;
			});
		},
		[debugMode],
	);

	return { view, updateView };
};

/** Panel de calibración flotante (solo operador con `?wheelDebug=1`). */
const CalibrationPanel: React.FC<{
	view: ViewSettings;
	alignmentOffset: number;
	initialAngle: number;
	diskOffsetX: number;
	diskOffsetY: number;
	diskScale: number;
	diskRotation: number;
	centerOffsetX: number;
	centerOffsetY: number;
	centerScale: number;
	saveState: SaveState;
	onChangeView: (patch: Partial<ViewSettings>) => void;
	onChangeAlignment: (alignmentOffset: number) => void;
	onChangePose: (initialAngle: number) => void;
	onChangeGeometry: (
		patch: Partial<
			Pick<
				WheelCalibration,
				"diskOffsetX" | "diskOffsetY" | "diskScale" | "diskRotation"
			>
		>,
	) => void;
	onChangeCenter: (
		patch: Partial<
			Pick<
				WheelCalibration,
				"centerOffsetX" | "centerOffsetY" | "centerScale"
			>
		>,
	) => void;
	onSave: () => void;
	onReset: () => void;
}> = ({
	view,
	alignmentOffset,
	initialAngle,
	diskOffsetX,
	diskOffsetY,
	diskScale,
	diskRotation,
	centerOffsetX,
	centerOffsetY,
	centerScale,
	saveState,
	onChangeView,
	onChangeAlignment,
	onChangePose,
	onChangeGeometry,
	onChangeCenter,
	onSave,
	onReset,
}) => {
	const [collapsed, setCollapsed] = useState(false);

	const { pngOpacity, showCanvas } = view;

	const handleOpacity = (event: React.ChangeEvent<HTMLInputElement>) =>
		onChangeView({ pngOpacity: Number(event.target.value) / 100 });

	/** Mueve el bloque PNG; con Shift el paso es de 10 px. */
	const nudge = (dx: number, dy: number, step = 1) => {
		onChangeGeometry({
			diskOffsetX: clampNumber(
				diskOffsetX + dx * step,
				WHEEL_DISK_OFFSET_MIN,
				WHEEL_DISK_OFFSET_MAX,
			),
			diskOffsetY: clampNumber(
				diskOffsetY + dy * step,
				WHEEL_DISK_OFFSET_MIN,
				WHEEL_DISK_OFFSET_MAX,
			),
		});
	};

	/** Mueve SOLO el centro PNG; con Shift el paso es de 10 px. */
	const nudgeCenter = (dx: number, dy: number, step = 1) => {
		onChangeCenter({
			centerOffsetX: clampNumber(
				centerOffsetX + dx * step,
				WHEEL_CENTER_OFFSET_MIN,
				WHEEL_CENTER_OFFSET_MAX,
			),
			centerOffsetY: clampNumber(
				centerOffsetY + dy * step,
				WHEEL_CENTER_OFFSET_MIN,
				WHEEL_CENTER_OFFSET_MAX,
			),
		});
	};

	const handleCopy = async () => {
		const snippet = [
			`export const WHEEL_ALIGNMENT_OFFSET = ${alignmentOffset};`,
			`export const WHEEL_INITIAL_ANGLE = ${initialAngle};`,
			`export const WHEEL_DISK_OFFSET_X_PX = ${diskOffsetX};`,
			`export const WHEEL_DISK_OFFSET_Y_PX = ${diskOffsetY};`,
			`export const WHEEL_DISK_SCALE = ${diskScale};`,
			`export const WHEEL_DISK_ROTATION = ${diskRotation};`,
			`export const WHEEL_CENTER_OFFSET_X_PX = ${centerOffsetX};`,
			`export const WHEEL_CENTER_OFFSET_Y_PX = ${centerOffsetY};`,
			`export const WHEEL_CENTER_SCALE = ${centerScale};`,
		].join("\n");
		try {
			if (navigator.clipboard) {
				await navigator.clipboard.writeText(snippet);
			}
		} catch {
			// Sin permisos de clipboard: no es crítico en calibración.
		}
	};

	if (collapsed) {
		return (
			<div className="absolute right-2 top-2 z-50">
				<button
					type="button"
					onClick={() => setCollapsed(false)}
					className="rounded-lg border border-white/20 bg-black/75 px-2.5 py-1.5 text-[11px] font-bold text-cyan-300 shadow"
				>
					⚙ Calibración
				</button>
			</div>
		);
	}

	return (
		<div className="absolute right-2 top-2 z-50 max-h-[calc(100%-1rem)] w-[232px] overflow-y-auto rounded-xl border border-white/20 bg-black/80 p-3 text-[11px] text-white shadow-2xl">
			<div className="mb-2 flex items-center justify-between">
				<span className="text-[12px] font-extrabold uppercase tracking-wide text-cyan-300">
					Calibración
				</span>
				<button
					type="button"
					onClick={() => setCollapsed(true)}
					className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] leading-none"
					title="Contraer"
				>
					✕
				</button>
			</div>

			<label className="mb-1 block">
				Opacidad PNG <b>{Math.round(pngOpacity * 100)}%</b>
			</label>
			<input
				type="range"
				min={Math.round(PNG_OPACITY_MIN * 100)}
				max={Math.round(PNG_OPACITY_MAX * 100)}
				step={1}
				value={Math.round(pngOpacity * 100)}
				onChange={handleOpacity}
				className="w-full accent-cyan-400"
			/>

			<label className="mt-2 flex items-center justify-between">
				<span>Canvas motor detrás</span>
				<input
					type="checkbox"
					checked={showCanvas}
					onChange={(event) =>
						onChangeView({ showCanvas: event.target.checked })
					}
					className="accent-cyan-400"
				/>
			</label>

			<label className="mt-2 mb-1 block">
				Alineación PNG <b>{alignmentOffset.toFixed(1)}°</b>
			</label>
			<input
				type="range"
				min={WHEEL_ALIGNMENT_OFFSET_MIN}
				max={WHEEL_ALIGNMENT_OFFSET_MAX}
				step={0.5}
				value={alignmentOffset}
				onChange={(event) =>
					onChangeAlignment(Number(event.target.value))
				}
				className="w-full accent-cyan-400"
			/>

			<label className="mt-2 mb-1 block">
				Pose inicial <b>{Math.round(initialAngle)}°</b>
			</label>
			<input
				type="range"
				min={WHEEL_INITIAL_ANGLE_MIN}
				max={WHEEL_INITIAL_ANGLE_MAX}
				step={1}
				value={initialAngle}
				onChange={(event) => onChangePose(Number(event.target.value))}
				className="w-full accent-cyan-400"
			/>

			<fieldset className="mt-3 rounded-lg border border-white/15 p-2">
				<legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-cyan-300/80">
					Posición / tamaño PNG
				</legend>

				{/* Flechas de movimiento (Shift = paso de 10 px) */}
				<div className="mx-auto mb-2 grid w-[86px] grid-cols-3 grid-rows-2 gap-1">
					<button
						type="button"
						title="Mover arriba (Shift = 10 px)"
						onClick={(event) => nudge(0, -1, event.shiftKey ? 10 : 1)}
						className="col-start-2 row-start-1 rounded bg-white/10 py-0.5 font-bold leading-none hover:bg-white/20"
					>
						↑
					</button>
					<button
						type="button"
						title="Mover a la izquierda (Shift = 10 px)"
						onClick={(event) => nudge(-1, 0, event.shiftKey ? 10 : 1)}
						className="col-start-1 row-start-2 rounded bg-white/10 py-0.5 font-bold leading-none hover:bg-white/20"
					>
						←
					</button>
					<button
						type="button"
						title="Mover abajo (Shift = 10 px)"
						onClick={(event) => nudge(0, 1, event.shiftKey ? 10 : 1)}
						className="col-start-2 row-start-2 rounded bg-white/10 py-0.5 font-bold leading-none hover:bg-white/20"
					>
						↓
					</button>
					<button
						type="button"
						title="Mover a la derecha (Shift = 10 px)"
						onClick={(event) => nudge(1, 0, event.shiftKey ? 10 : 1)}
						className="col-start-3 row-start-2 rounded bg-white/10 py-0.5 font-bold leading-none hover:bg-white/20"
					>
						→
					</button>
				</div>

				<label className="mb-1 flex items-center justify-between">
					<span>Horizontal (X)</span>
					<b>{Math.round(diskOffsetX)} px</b>
				</label>
				<input
					type="range"
					min={WHEEL_DISK_OFFSET_MIN}
					max={WHEEL_DISK_OFFSET_MAX}
					step={1}
					value={diskOffsetX}
					onChange={(event) =>
						onChangeGeometry({ diskOffsetX: Number(event.target.value) })
					}
					className="w-full accent-cyan-400"
				/>

				<label className="mt-2 mb-1 flex items-center justify-between">
					<span>Vertical (Y)</span>
					<b>{Math.round(diskOffsetY)} px</b>
				</label>
				<input
					type="range"
					min={WHEEL_DISK_OFFSET_MIN}
					max={WHEEL_DISK_OFFSET_MAX}
					step={1}
					value={diskOffsetY}
					onChange={(event) =>
						onChangeGeometry({ diskOffsetY: Number(event.target.value) })
					}
					className="w-full accent-cyan-400"
				/>

				<label className="mt-2 mb-1 flex items-center justify-between">
					<span>Escala</span>
					<b>{Math.round(diskScale * 100)}%</b>
				</label>
				<input
					type="range"
					min={Math.round(WHEEL_DISK_SCALE_MIN * 100)}
					max={Math.round(WHEEL_DISK_SCALE_MAX * 100)}
					step={1}
					value={Math.round(diskScale * 100)}
					onChange={(event) =>
						onChangeGeometry({
							diskScale: Number(event.target.value) / 100,
						})
					}
					className="w-full accent-cyan-400"
				/>

				<label className="mt-2 mb-1 flex items-center justify-between">
					<span>Rotación</span>
					<b>{Math.round(diskRotation)}°</b>
				</label>
				<input
					type="range"
					min={WHEEL_DISK_ROTATION_MIN}
					max={WHEEL_DISK_ROTATION_MAX}
					step={1}
					value={diskRotation}
					onChange={(event) =>
						onChangeGeometry({
							diskRotation: Number(event.target.value),
						})
					}
					className="w-full accent-cyan-400"
				/>
			</fieldset>

			<fieldset className="mt-3 rounded-lg border border-white/15 p-2">
				<legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-cyan-300/80">
					Centro (independiente)
				</legend>

				{/* Flechas de movimiento del centro (Shift = paso de 10 px) */}
				<div className="mx-auto mb-2 grid w-[86px] grid-cols-3 grid-rows-2 gap-1">
					<button
						type="button"
						title="Mover centro arriba (Shift = 10 px)"
						onClick={(event) =>
							nudgeCenter(0, -1, event.shiftKey ? 10 : 1)
						}
						className="col-start-2 row-start-1 rounded bg-white/10 py-0.5 font-bold leading-none hover:bg-white/20"
					>
						↑
					</button>
					<button
						type="button"
						title="Mover centro a la izquierda (Shift = 10 px)"
						onClick={(event) =>
							nudgeCenter(-1, 0, event.shiftKey ? 10 : 1)
						}
						className="col-start-1 row-start-2 rounded bg-white/10 py-0.5 font-bold leading-none hover:bg-white/20"
					>
						←
					</button>
					<button
						type="button"
						title="Mover centro abajo (Shift = 10 px)"
						onClick={(event) =>
							nudgeCenter(0, 1, event.shiftKey ? 10 : 1)
						}
						className="col-start-2 row-start-2 rounded bg-white/10 py-0.5 font-bold leading-none hover:bg-white/20"
					>
						↓
					</button>
					<button
						type="button"
						title="Mover centro a la derecha (Shift = 10 px)"
						onClick={(event) =>
							nudgeCenter(1, 0, event.shiftKey ? 10 : 1)
						}
						className="col-start-3 row-start-2 rounded bg-white/10 py-0.5 font-bold leading-none hover:bg-white/20"
					>
						→
					</button>
				</div>

				<label className="mb-1 flex items-center justify-between">
					<span>Horizontal (X)</span>
					<b>{Math.round(centerOffsetX)} px</b>
				</label>
				<input
					type="range"
					min={WHEEL_CENTER_OFFSET_MIN}
					max={WHEEL_CENTER_OFFSET_MAX}
					step={1}
					value={centerOffsetX}
					onChange={(event) =>
						onChangeCenter({ centerOffsetX: Number(event.target.value) })
					}
					className="w-full accent-cyan-400"
				/>

				<label className="mt-2 mb-1 flex items-center justify-between">
					<span>Vertical (Y)</span>
					<b>{Math.round(centerOffsetY)} px</b>
				</label>
				<input
					type="range"
					min={WHEEL_CENTER_OFFSET_MIN}
					max={WHEEL_CENTER_OFFSET_MAX}
					step={1}
					value={centerOffsetY}
					onChange={(event) =>
						onChangeCenter({ centerOffsetY: Number(event.target.value) })
					}
					className="w-full accent-cyan-400"
				/>

				<label className="mt-2 mb-1 flex items-center justify-between">
					<span>Escala</span>
					<b>{Math.round(centerScale * 100)}%</b>
				</label>
				<input
					type="range"
					min={Math.round(WHEEL_CENTER_SCALE_MIN * 100)}
					max={Math.round(WHEEL_CENTER_SCALE_MAX * 100)}
					step={1}
					value={Math.round(centerScale * 100)}
					onChange={(event) =>
						onChangeCenter({
							centerScale: Number(event.target.value) / 100,
						})
					}
					className="w-full accent-cyan-400"
				/>
			</fieldset>

			<div className="mt-3 flex gap-1.5">
				<button
					type="button"
					onClick={onSave}
					disabled={saveState === "saving"}
					className="flex-1 rounded bg-cyan-700/80 px-2 py-1 font-bold text-white hover:bg-cyan-600/80 disabled:opacity-60"
				>
					{saveState === "saving"
						? "Guardando…"
						: saveState === "saved"
							? "✓ Guardado"
							: "Guardar posición"}
				</button>
				<button
					type="button"
					onClick={onReset}
					className="flex-1 rounded bg-white/10 px-2 py-1 font-semibold hover:bg-white/20"
				>
					Reset
				</button>
			</div>
			{saveState === "error" && (
				<p className="mt-2 text-center font-semibold text-red-400">
					No se pudo guardar
				</p>
			)}
			<div className="mt-2">
				<button
					type="button"
					onClick={handleCopy}
					className="w-full rounded bg-white/10 px-2 py-1 font-semibold hover:bg-white/20"
				>
					Copiar valores
				</button>
			</div>
		</div>
	);
};

export const RouletteWheel: React.FC<RouletteWheelProps> = ({
	items,
	onPrizeWon,
	onSpinStart,
	onSpinEnd,
	size,
	onControlsReady,
	calibration,
	onCalibrationSaved,
}) => {
	const diskRef = useRef<HTMLImageElement>(null);
	// Estado del PNG: se muestra solo cuando cargó; si falla, queda el canvas.
	const [diskState, setDiskState] = useState<"loading" | "ok" | "error">(
		"loading",
	);
	// Rotación usada por el overlay debug (evita re-renderizar en producción).
	const [debugRotation, setDebugRotation] = useState(WHEEL_INITIAL_ANGLE);
	// Modo debug: solo se activa con ?wheelDebug=1 Y sesión de operador.
	const debugMode = useWheelDebugAccess();
	const { view, updateView } = useViewSettings(debugMode);
	const { pngOpacity, showCanvas } = view;

	// Calibración efectiva. Prioridad:
	//   1. borrador del panel (sliders)  2. query param de preview
	//   3. valor guardado en el servidor 4. constantes de wheel-design.ts
	const serverAlignment =
		calibration?.alignmentOffset ?? WHEEL_ALIGNMENT_OFFSET;
	const serverInitialAngle = calibration?.initialAngle ?? WHEEL_INITIAL_ANGLE;
	const serverDiskOffsetX = calibration?.diskOffsetX ?? WHEEL_DISK_OFFSET_X_PX;
	const serverDiskOffsetY = calibration?.diskOffsetY ?? WHEEL_DISK_OFFSET_Y_PX;
	const serverDiskScale = calibration?.diskScale ?? WHEEL_DISK_SCALE;
	const serverDiskRotation = calibration?.diskRotation ?? WHEEL_DISK_ROTATION;
	const serverCenterOffsetX =
		calibration?.centerOffsetX ?? WHEEL_CENTER_OFFSET_X_PX;
	const serverCenterOffsetY =
		calibration?.centerOffsetY ?? WHEEL_CENTER_OFFSET_Y_PX;
	const serverCenterScale = calibration?.centerScale ?? WHEEL_CENTER_SCALE;
	const [draft, setDraft] = useState<Partial<WheelCalibration> | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("idle");

	const previewAlignment = readParamNumber("wheelAlign");
	const previewAngle = readParamNumber("wheelAngle");
	const previewDiskOffsetX = readParamNumber("wheelX");
	const previewDiskOffsetY = readParamNumber("wheelY");
	const previewDiskScale = readParamNumber("wheelScale");
	const previewDiskRotation = readParamNumber("wheelRotation");
	const previewCenterOffsetX = readParamNumber("wheelCenterX");
	const previewCenterOffsetY = readParamNumber("wheelCenterY");
	const previewCenterScale = readParamNumber("wheelCenterScale");

	const alignmentOffset =
		draft?.alignmentOffset ?? previewAlignment ?? serverAlignment;
	const initialAngle = draft?.initialAngle ?? previewAngle ?? serverInitialAngle;
	const diskOffsetX =
		draft?.diskOffsetX ?? previewDiskOffsetX ?? serverDiskOffsetX;
	const diskOffsetY =
		draft?.diskOffsetY ?? previewDiskOffsetY ?? serverDiskOffsetY;
	const diskScale = draft?.diskScale ?? previewDiskScale ?? serverDiskScale;
	const diskRotation =
		draft?.diskRotation ?? previewDiskRotation ?? serverDiskRotation;
	const centerOffsetX =
		draft?.centerOffsetX ?? previewCenterOffsetX ?? serverCenterOffsetX;
	const centerOffsetY =
		draft?.centerOffsetY ?? previewCenterOffsetY ?? serverCenterOffsetY;
	const centerScale =
		draft?.centerScale ?? previewCenterScale ?? serverCenterScale;

	const handleChangeAlignment = useCallback((alignment: number) => {
		setSaveState("idle");
		setDraft((previous) => ({ ...previous, alignmentOffset: alignment }));
	}, []);

	const handleChangePose = useCallback((angle: number) => {
		setSaveState("idle");
		setDraft((previous) => ({ ...previous, initialAngle: angle }));
	}, []);

	const handleChangeGeometry = useCallback(
		(
			patch: Partial<
				Pick<WheelCalibration, "diskOffsetX" | "diskOffsetY" | "diskScale">
			>,
		) => {
			setSaveState("idle");
			setDraft((previous) => ({ ...previous, ...patch }));
		},
		[],
	);

	const handleChangeCenter = useCallback(
		(
			patch: Partial<
				Pick<
					WheelCalibration,
					"centerOffsetX" | "centerOffsetY" | "centerScale"
				>
			>,
		) => {
			setSaveState("idle");
			setDraft((previous) => ({ ...previous, ...patch }));
		},
		[],
	);

	const handleSaveCalibration = useCallback(async () => {
		setSaveState("saving");
		const next: WheelCalibration = {
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
		try {
			const response = await fetch(`${API_URL}/wheel/calibration`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "same-origin",
				body: JSON.stringify(next),
			});
			if (!response.ok) throw new Error("save failed");
			setSaveState("saved");
			onCalibrationSaved?.(next);
		} catch {
			setSaveState("error");
		}
	}, [
		alignmentOffset,
		initialAngle,
		diskOffsetX,
		diskOffsetY,
		diskScale,
		diskRotation,
		centerOffsetX,
		centerOffsetY,
		centerScale,
		onCalibrationSaved,
	]);

	const handleResetCalibration = useCallback(() => {
		setDraft(null);
		setSaveState("idle");
		updateView({
			pngOpacity: DEFAULT_VIEW.pngOpacity,
			showCanvas: DEFAULT_VIEW.showCanvas,
		});
	}, [updateView]);

	const syncDiskRotation = useCallback(
		(totalRotation: number) => {
			if (diskRef.current) {
				diskRef.current.style.transform = `rotate(${
					WHEEL_ROTATION_OFFSET + alignmentOffset + diskRotation - totalRotation
				}deg)`;
			}
			if (debugMode) setDebugRotation(totalRotation);
		},
		[debugMode, alignmentOffset, diskRotation],
	);

	const { roulette, onStart } = useRoulette({
		items,
		onSpinUp: onSpinStart,
		onSpinDown: onSpinEnd,
		onSpinEnd: (result: string) => {
			onPrizeWon(result);
		},
		onRotationChange: syncDiskRotation,
		options: {
			size,
			initialAngle,
			determineAngle: WHEEL_DETERMINE_ANGLE,
			// La flecha se dibuja con código (DOM); en el canvas va oculta.
			showArrow: false,
			style: {
				canvas: { bg: "#ffffff" },
				label: {
					font: `800 ${Math.max(14, Math.round(size * 0.05))}px ${APP_FONT_FAMILY}`,
					align: "center",
					baseline: "middle",
					offset: 0.7,
				},
				pie: {
					borderWidth: 1.5,
					borderColor: "#e2e8f0",
					border: true,
				},
			},
		},
	});

	useEffect(() => {
		onControlsReady?.({ start: onStart });
	}, [onControlsReady, onStart]);

	// Posición inicial del disco (reposo) antes de cargar/hacer girar.
	useEffect(() => {
		syncDiskRotation(initialAngle);
	}, [syncDiskRotation, initialAngle]);

	// Canvas visible: respaldo si el PNG falla, o detrás del PNG en calibración.
	const canvasVisible =
		diskState !== "ok" || (debugMode && showCanvas);

	return (
		<div
			className="relative flex items-center justify-center"
			style={{ width: size, height: size }}
		>
			{/* Canvas con la ruleta dibujada por código: mantiene la lógica y
			    sirve de respaldo si el PNG no carga; en calibración se muestra
			    detrás del PNG semitransparente para comparar los sectores. */}
			<div
				className={`absolute inset-0 flex items-center justify-center overflow-hidden rounded-full bg-white transition-opacity duration-300 ${
					canvasVisible ? "opacity-100" : "opacity-0"
				}`}
			>
				<Roulette roulette={roulette} />
			</div>

			{/* Bloque PNG (disco + centro): se mueven y escalan juntos desde el
			    panel de calibración. La flecha NO se mueve. */}
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					transform: `translate(${diskOffsetX}px, ${diskOffsetY}px) scale(${diskScale})`,
					transformOrigin: "center center",
				}}
			>
				{/* Disco PNG giratorio (los premios ya están dibujados). */}
				{diskState !== "error" && (
					<img
						ref={diskRef}
						src={WHEEL_IMAGE_URL}
						alt=""
						draggable={false}
						onLoad={() => setDiskState("ok")}
						onError={() => setDiskState("error")}
						className="absolute inset-0 h-full w-full object-contain select-none pointer-events-none"
						style={{
							opacity: pngOpacity,
							transform: `rotate(${
						WHEEL_ROTATION_OFFSET + alignmentOffset + diskRotation - initialAngle
					}deg)`,
						}}
						aria-hidden="true"
					/>
				)}

				{/* Centro fijo (PNG aparte, NO gira). Se mueve y escala SOLO con
				    los controles del fieldset "Centro"; hereda el movimiento
				    del bloque (disco + centro) pero no la rotación del disco. */}
				{diskState === "ok" && (
					<img
						src={CENTER_IMAGE_URL}
						alt=""
						draggable={false}
						className="pointer-events-none absolute left-1/2 top-1/2 object-contain select-none"
						style={{
							opacity: pngOpacity,
							width: `${CENTER_SIZE_RATIO * 100}%`,
							height: `${CENTER_SIZE_RATIO * 100}%`,
							transform: `translate(calc(-50% + ${centerOffsetX}px), calc(-50% + ${centerOffsetY}px)) scale(${centerScale})`,
						}}
						aria-hidden="true"
					/>
				)}
			</div>

			{/* Flecha / puntero en código, en la parte superior */}
			<div className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 pointer-events-none drop-shadow-[0_4px_6px_rgba(0,0,0,0.4)]">
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

			{/* Overlay de sectores para calibrar (?wheelDebug=1) */}
			{debugMode && (
				<DebugWheelOverlay
					size={size}
					rotation={debugRotation}
					items={items}
				/>
			)}

			{/* Botones debug: giran directamente a cada sector sin backend */}
			{debugMode && (
				<div className="absolute bottom-2 left-1/2 z-40 flex -translate-x-1/2 gap-1">
					{Array.from(
						{ length: WHEEL_SECTOR_COUNT },
						(_, index) => (
							<button
								key={index}
								type="button"
								onClick={() => onStart(index)}
								title={`Girar hasta el sector ${index}`}
								className="h-7 w-7 rounded-full border border-white/70 bg-black/60 text-[11px] font-bold text-cyan-300 shadow transition hover:bg-black/80"
							>
								{index}
							</button>
						),
					)}
				</div>
			)}

			{/* Panel de calibración (solo operador con ?wheelDebug=1) */}
			{debugMode && (
				<CalibrationPanel
					view={view}
					alignmentOffset={alignmentOffset}
					initialAngle={initialAngle}
					diskOffsetX={diskOffsetX}
					diskOffsetY={diskOffsetY}
					diskScale={diskScale}
					diskRotation={diskRotation}
					centerOffsetX={centerOffsetX}
					centerOffsetY={centerOffsetY}
					centerScale={centerScale}
					saveState={saveState}
					onChangeView={updateView}
					onChangeAlignment={handleChangeAlignment}
					onChangePose={handleChangePose}
					onChangeGeometry={handleChangeGeometry}
					onChangeCenter={handleChangeCenter}
					onSave={handleSaveCalibration}
					onReset={handleResetCalibration}
				/>
			)}
		</div>
	);
};