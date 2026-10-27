import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api";
import { GREEN_PALETTE } from "@/shared/prize-colors";
import { PrizeImageInput } from "./prize-image-input";
import { useOperatorAuth } from "./operator-auth-context";
import { translateMessage } from "./panel-messages";
import { useToast } from "./panel-toast";
import {
	BrandButton,
	BrandCard,
	BrandColorInput,
	BrandInput,
	SectionHeading,
} from "./panel-ui";

export type LabelMode = "wheel" | "win" | "both";

export interface Prize {
	roulette_id?: number;
	name: string;
	backgroundColor: string;
	probability: number;
	/** Imagen del premio como data URL comprimida (opcional). */
	image?: string | null;
	/** Dónde mostrar el nombre: "wheel"=en la ruleta, "win"=solo al ganar, "both"=ambos. */
	labelMode?: LabelMode | null;
	/** Casilla "Inténtalo de nuevo": no consume el ticket y permite girar otra vez. */
	isSpinAgain?: boolean;
	/** Sector fijo de la ruleta (0-5). Solo lectura desde el panel. */
	sectorIndex?: number | null;
}

interface PrizeManagerProps {
	templateId: number;
	/** Se invoca después de guardar para refrescar el nombre en el selector. */
	onSaved?: () => void;
}

const SECTOR_COUNT = 6;

const ROW_GRID =
	"grid gap-3 border-b border-slate-200 py-3 last:border-b-0 md:grid-cols-[3rem_minmax(0,1fr)_auto] md:items-center md:gap-4";
const FIELD_GRID =
	"grid grid-cols-2 items-center gap-2 sm:grid-cols-5 md:grid-cols-[2.5rem_7.5rem_5.5rem_4.5rem_4rem]";

/** Devuelve el siguiente verde de la paleta para un sector. */
const sectorColor = (index: number): string =>
	GREEN_PALETTE[index % GREEN_PALETTE.length];

/** Comprueba que existan los 6 sectores exactamente una vez. */
const hasAllSectors = (prizes: Prize[]): boolean => {
	if (prizes.length !== SECTOR_COUNT) return false;
	const sectors = new Set<number>();
	for (const prize of prizes) {
		const sector = prize.sectorIndex;
		if (
			typeof sector !== "number" ||
			!Number.isInteger(sector) ||
			sector < 0 ||
			sector >= SECTOR_COUNT ||
			sectors.has(sector)
		) {
			return false;
		}
		sectors.add(sector);
	}
	return sectors.size === SECTOR_COUNT;
};

export const PrizeManager: React.FC<PrizeManagerProps> = ({
	templateId,
	onSaved,
}) => {
	const [prizes, setPrizes] = useState<Prize[]>([]);
	const [templateName, setTemplateName] = useState("");
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const toast = useToast();
	const { operatorFetch } = useOperatorAuth();

	useEffect(() => {
		const fetchPrizes = async () => {
			if (!templateId) return;
			try {
				const response = await apiFetch(`/roulettes/${templateId}`);
				const data = await response.json();
				const loadedPrizes: Prize[] = Array.isArray(data.prizes)
					? data.prizes
					: [];

				// La ruleta siempre debe mostrar los 6 sectores fijos. Si el
				// backend no enviara alguno, se completa localmente para que el
				// operador pueda configurarlo.
				const normalized: Prize[] = Array.from(
					{ length: SECTOR_COUNT },
					(_, sectorIndex) => {
						const existing = loadedPrizes.find(
							(prize) => prize.sectorIndex === sectorIndex,
						);
						return (
							existing ?? {
								roulette_id: templateId,
								name: `Premio ${sectorIndex + 1}`,
								backgroundColor: sectorColor(sectorIndex),
								probability: 10,
								image: null,
								labelMode: "both",
								isSpinAgain: false,
								sectorIndex,
							}
						);
					},
				);

				setPrizes(normalized);
				setTemplateName(data.name ?? "");
			} catch (error) {
				console.error("Failed to fetch prizes", error);
			}
		};

		fetchPrizes();
	}, [templateId]);

	const handleSaveConfiguration = async () => {
		if (!hasAllSectors(prizes)) {
			toast.error(
				"La ruleta necesita exactamente los 6 sectores configurados.",
			);
			return;
		}

		setIsLoading(true);
		try {
			const response = await operatorFetch(`/roulettes/${templateId}`, {
				method: "PUT",
				body: JSON.stringify({ name: templateName, prizes }),
			});
			if (!response) return;
			const result = await response.json();
			if (!response.ok) throw new Error(result.message);
			toast.success("Cambios guardados.");
			onSaved?.();
		} catch (error) {
			toast.error(
				translateMessage(
					error instanceof Error ? error.message : undefined,
					"No se pudo guardar.",
				),
			);
		} finally {
			setIsLoading(false);
		}
	};

	const handlePrizeChange = (
		sectorIndex: number,
		field: keyof Prize,
		value: string | number | boolean | null,
	) => {
		setPrizes((prev) =>
			prev.map((prize) => {
				if (prize.sectorIndex !== sectorIndex) return prize;
				if (field === "probability") {
					return { ...prize, probability: Number(value) || 0 };
				}
				if (field === "backgroundColor") {
					return { ...prize, backgroundColor: String(value) };
				}
				if (field === "image") {
					return { ...prize, image: value == null ? null : String(value) };
				}
				if (field === "labelMode") {
					return { ...prize, labelMode: value as LabelMode | null };
				}
				if (field === "isSpinAgain") {
					return { ...prize, isSpinAgain: Boolean(value) };
				}
				return { ...prize, name: String(value) };
			}),
		);
	};

	// Calcular probabilidades reales (Modelo A: pesos libres)
	const totalWeight = prizes.reduce(
		(sum, p) =>
			sum +
			(Number.isFinite(p.probability) && p.probability > 0 ? p.probability : 0),
		0,
	);
	const getRealProbability = (weight: number): string => {
		if (totalWeight <= 0 || !Number.isFinite(weight) || weight <= 0) return "—";
		return `${((weight / totalWeight) * 100).toFixed(1)}%`;
	};
	const sectorsReady = hasAllSectors(prizes);

	return (
		<div className="flex min-w-0 flex-col gap-3">
			<BrandCard>
				<SectionHeading
					icon={Pencil}
					title="Editar premios"
					subtitle="La ruleta tiene 6 sectores fijos. Edita el contenido de cada sector; el mapeo no se puede cambiar desde el panel."
				/>

				<div className="mt-4 space-y-4">
					{/* Nombre de la plantilla */}
					<div className="grid max-w-md gap-1.5">
						<label
							htmlFor="template-name"
							className="text-xs font-bold uppercase tracking-wide text-[#005f63]"
						>
							Nombre de la plantilla
						</label>
						<BrandInput
							id="template-name"
							type="text"
							value={templateName}
							onChange={(e) => setTemplateName(e.target.value)}
							className="h-9"
						/>
					</div>

					{/* Resumen de pesos */}
					<div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs">
						<span className="font-medium text-teal-700">
							Total de pesos: <span className="font-mono">{totalWeight}</span>
						</span>
						<span className="text-teal-600">
							Modelo A: cada número es un peso relativo, no un % fijo.
						</span>
					</div>

					{!sectorsReady && (
						<div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
							Faltan sectores por configurar. La plantilla no podrá activarse
							hasta tener los 6 sectores completos.
						</div>
					)}

					{/* Cabecera de columnas (solo escritorio) */}
					<div className="hidden border-b border-slate-200 pb-2 text-[11px] font-bold uppercase tracking-wide text-[#005f63] md:grid md:grid-cols-[3rem_minmax(0,1fr)_auto] md:items-center md:gap-4">
						<span className="text-center">Sector</span>
						<span>Premio</span>
						<div className={FIELD_GRID}>
							<span className="text-center">Imagen</span>
							<span className="text-center">Texto</span>
							<span>Color</span>
							<span className="text-center">Peso</span>
							<span className="text-center">Real</span>
						</div>
					</div>

					{/* Los 6 sectores fijos */}
					<div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50/60 px-2 md:px-3">
						{prizes.map((prize, index) => {
							const sectorIndex = prize.sectorIndex ?? index;
							return (
								<div key={sectorIndex} className={ROW_GRID}>
									<div className="flex items-center gap-2 md:flex-col md:gap-0.5">
										<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#005f63] text-sm font-black text-white shadow-sm">
											{sectorIndex + 1}
										</span>
										<span className="text-[10px] font-bold uppercase tracking-wide text-[#005f63] md:hidden">
											Sector
										</span>
									</div>

									<div className="min-w-0">
										<BrandInput
											id={`prize-name-${sectorIndex}`}
											type="text"
											value={prize.name}
											onChange={(e) =>
												handlePrizeChange(
													sectorIndex,
													"name",
													e.target.value,
												)
											}
											className="h-9"
											placeholder={
												prize.image ? "Opcional (tiene imagen)" : "Nombre del premio"
											}
											aria-label={`Nombre del premio del sector ${sectorIndex + 1}`}
										/>
										<label
											className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-teal-700"
											title="Al caer aquí no se consume el ticket y el cliente puede girar otra vez"
										>
											<input
												type="checkbox"
												checked={prize.isSpinAgain === true}
												onChange={(e) =>
													handlePrizeChange(
														sectorIndex,
														"isSpinAgain",
														e.target.checked,
													)
												}
												className="h-3.5 w-3.5 accent-[#005f63]"
											/>
											Inténtalo de nuevo
										</label>
									</div>

									<div className={FIELD_GRID}>
										<PrizeImageInput
											value={prize.image}
											onChange={(image) =>
												handlePrizeChange(sectorIndex, "image", image)
											}
											label={`sector ${sectorIndex + 1}`}
											className="justify-self-center md:justify-self-start"
										/>
										<select
											id={`prize-labelmode-${sectorIndex}`}
											value={prize.labelMode ?? "both"}
											onChange={(e) =>
												handlePrizeChange(
													sectorIndex,
													"labelMode",
													e.target.value,
												)
											}
											className="h-9 w-full rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs text-center text-slate-800 shadow-sm outline-none focus:border-[#005f63] focus:ring-2 focus:ring-[#005f63]/25"
											aria-label={`Modo de texto del sector ${sectorIndex + 1}`}
										>
											<option value="wheel">En la ruleta</option>
											<option value="win">Solo al ganar</option>
											<option value="both">Ambos</option>
										</select>
										<BrandColorInput
											id={`prize-color-${sectorIndex}`}
											value={prize.backgroundColor}
											onChange={(e) =>
												handlePrizeChange(
													sectorIndex,
													"backgroundColor",
													e.target.value,
												)
											}
											className="h-9"
											aria-label={`Color del sector ${sectorIndex + 1}`}
										/>
										<BrandInput
											id={`prize-probability-${sectorIndex}`}
											type="number"
											value={prize.probability}
											onChange={(e) =>
												handlePrizeChange(
													sectorIndex,
													"probability",
													Number(e.target.value),
												)
											}
											className="h-9 text-center"
											placeholder="Peso"
											aria-label={`Peso del sector ${sectorIndex + 1}`}
										/>
										<span
											className="text-center text-xs font-medium tabular-nums text-teal-600"
											title={`Probabilidad real del sector ${sectorIndex + 1}`}
										>
											{getRealProbability(prize.probability)}
										</span>
									</div>
								</div>
							);
						})}
					</div>

					<p className="text-xs font-medium text-slate-500">
						Los 6 sectores están fijos. Para cambiar el mapeo de premios hay
						que modificar el código.
					</p>
				</div>
			</BrandCard>

			{/* Barra de guardado siempre visible */}
			<div className="sticky bottom-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur">
				<div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
					<p className="px-1 text-xs font-medium text-slate-500">
						{prizes.length} de {SECTOR_COUNT} sectores · Total de pesos{" "}
						<span className="font-mono text-slate-700">{totalWeight}</span>
					</p>
					<BrandButton
						onClick={handleSaveConfiguration}
						disabled={isLoading || !sectorsReady}
						size="sm"
						className="w-full sm:w-auto"
					>
						{isLoading ? "Guardando..." : "Guardar cambios"}
					</BrandButton>
				</div>
			</div>
		</div>
	);
};
