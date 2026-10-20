import { Pencil, Plus, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api";
import { GREEN_PALETTE, nextGreen } from "@/shared/prize-colors";
import { PrizeImageInput } from "./prize-image-input";
import { translateMessage } from "./panel-messages";
import { useToast } from "./panel-toast";
import {
	BrandButton,
	BrandCard,
	BrandColorInput,
	BrandInput,
	BrandLabel,
	SectionHeading,
} from "./panel-ui";

export interface Prize {
	roulette_id?: number;
	name: string;
	backgroundColor: string;
	probability: number;
	/** Imagen del premio como data URL comprimida (opcional). */
	image?: string | null;
}

interface PrizeManagerProps {
	templateId: number;
	/** Se invoca después de guardar para refrescar el nombre en el selector. */
	onSaved?: () => void;
}

/** Rejilla compartida por las filas de premio y la fila de alta. */
const ROW_BASE =
	"grid grid-cols-[2.5rem_3.5rem_minmax(0,1fr)_3rem_2.25rem] items-center gap-2";
const ROW_GRID = `${ROW_BASE} md:grid-cols-[minmax(0,1fr)_2.5rem_3.5rem_5.5rem_4.5rem_2.5rem]`;
const ADD_ROW_GRID = `${ROW_BASE} md:grid-cols-[minmax(0,1fr)_2.5rem_3.5rem_5.5rem_4.5rem_auto]`;

export const PrizeManager: React.FC<PrizeManagerProps> = ({
	templateId,
	onSaved,
}) => {
	const [prizes, setPrizes] = useState<Prize[]>([]);
	const [templateName, setTemplateName] = useState("");
	const [newPrize, setNewPrize] = useState<Omit<Prize, "id" | "roulette_id">>({
		name: "",
		backgroundColor: GREEN_PALETTE[0],
		probability: 10,
		image: null,
	});
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const toast = useToast();

	useEffect(() => {
		const fetchPrizes = async () => {
			if (!templateId) return;
			try {
				const response = await apiFetch(`/roulettes/${templateId}`);
				const data = await response.json();
				const loadedPrizes: Prize[] = data.prizes || [];
				setPrizes(loadedPrizes);
				setTemplateName(data.name);
				// El próximo premio arranca con el siguiente verde de la paleta.
				setNewPrize((prev) => ({
					...prev,
					backgroundColor: nextGreen(loadedPrizes.length),
				}));
			} catch (error) {
				console.error("Failed to fetch prizes", error);
			}
		};
		fetchPrizes();
	}, [templateId]);

	const handleSaveConfiguration = async () => {
		setIsLoading(true);
		try {
			const response = await apiFetch(`/roulettes/${templateId}`, {
				method: "PUT",
				body: JSON.stringify({ name: templateName, prizes }),
			});
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

	const handleAddPrize = () => {
		if (newPrize.name.trim() === "") return;
		setPrizes([
			...prizes,
			{
				...newPrize,
				probability: Number(newPrize.probability) || 0,
				roulette_id: templateId,
			},
		]);
		setNewPrize({
			name: "",
			backgroundColor: nextGreen(prizes.length + 1),
			probability: 10,
			image: null,
		});
	};

	const handleRemovePrize = (index: number) => {
		setPrizes(prizes.filter((_, i) => i !== index));
	};

	const handlePrizeChange = (
		index: number,
		field: keyof Prize,
		value: string | number | null,
	) => {
		setPrizes((prev) =>
			prev.map((prize, i) => {
				if (i !== index) return prize;
				// Asegurarse de que la probabilidad sea un número
				if (field === "probability") {
					return { ...prize, probability: Number(value) || 0 };
				}
				if (field === "backgroundColor") {
					return { ...prize, backgroundColor: String(value) };
				}
				if (field === "image") {
					return { ...prize, image: value == null ? null : String(value) };
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
	const newPrizeRealProbability = (() => {
		const weight =
			Number.isFinite(newPrize.probability) && newPrize.probability > 0
				? newPrize.probability
				: 0;
		if (weight <= 0) return "—";
		const total = totalWeight + weight;
		return `${((weight / total) * 100).toFixed(1)}%`;
	})();

	return (
		<div className="flex min-w-0 flex-col gap-3">
			<BrandCard>
				<SectionHeading
					icon={Pencil}
					title="Editar premios"
					subtitle={`Sube una imagen por premio y luego toca en "Guardar cambios".`}
				/>

				<div className="mt-4 space-y-4">
					{/* Nombre de la plantilla */}
					<div className="grid max-w-md gap-1.5">
						<BrandLabel htmlFor="template-name">
							Nombre de la plantilla
						</BrandLabel>
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

					{/* Lista de premios */}
					<div className="space-y-2">
						<div className="hidden px-1 text-[11px] font-bold uppercase tracking-wide text-[#005f63] md:grid md:grid-cols-[minmax(0,1fr)_2.5rem_3.5rem_5.5rem_4.5rem_2.5rem] md:items-center md:gap-2 md:px-[13px]">
							<span>Nombre</span>
							<span className="text-center">Imagen</span>
							<span>Color</span>
							<span>Peso</span>
							<span className="text-center">Real</span>
							<span className="sr-only">Acciones</span>
						</div>

						<div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-slate-50/60 px-2 md:px-3">
							{prizes.length === 0 && (
								<p className="py-5 text-center text-sm text-slate-500">
									Aún no hay premios. Agrega el primero abajo.
								</p>
							)}

							{prizes.map((prize, index) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: es la manera de identificar
									key={index}
									className={`${ROW_GRID} py-2 md:py-1.5`}
								>
									<div className="col-span-5 md:col-span-1">
										<BrandInput
											id={`prize-name-${index}`}
											type="text"
											value={prize.name}
											onChange={(e) =>
												handlePrizeChange(index, "name", e.target.value)
											}
											className="h-9"
											aria-label={`Nombre del premio ${index + 1}`}
										/>
									</div>
									<PrizeImageInput
										value={prize.image}
										onChange={(image) => handlePrizeChange(index, "image", image)}
										label={`premio ${index + 1}`}
										className="justify-self-center md:justify-self-start"
									/>
									<BrandColorInput
										id={`prize-color-${index}`}
										value={prize.backgroundColor}
										onChange={(e) =>
											handlePrizeChange(
												index,
												"backgroundColor",
												e.target.value,
											)
										}
										className="h-9"
										aria-label={`Color del premio ${index + 1}`}
									/>
									<BrandInput
										id={`prize-probability-${index}`}
										type="number"
										value={prize.probability}
										onChange={(e) =>
											handlePrizeChange(
												index,
												"probability",
												Number(e.target.value),
											)
										}
										className="h-9 text-center"
										placeholder="Peso"
										aria-label={`Peso del premio ${index + 1}`}
									/>
									<span
										className="text-center text-xs font-medium tabular-nums text-teal-600"
										title={`Probabilidad real del premio ${index + 1}`}
									>
										{getRealProbability(prize.probability)}
									</span>
									<BrandButton
										onClick={() => handleRemovePrize(index)}
										variant="danger"
										size="icon"
										className="h-9 w-9"
										aria-label={`Eliminar premio ${index + 1}`}
									>
										<TrashIcon />
									</BrandButton>
								</div>
							))}
						</div>
					</div>

					{/* Agregar nuevo premio */}
					<div className="rounded-2xl border border-dashed border-[#005f63]/40 bg-[#005f63]/5 p-2.5 md:p-3">
						<div className={ADD_ROW_GRID}>
							<div className="col-span-5 md:col-span-1">
								<BrandInput
									id="new-prize-name"
									type="text"
									placeholder="Nombre del nuevo premio"
									value={newPrize.name}
									onChange={(e) =>
										setNewPrize({ ...newPrize, name: e.target.value })
									}
									className="h-9"
									aria-label="Nombre del nuevo premio"
								/>
							</div>
							<PrizeImageInput
								value={newPrize.image}
								onChange={(image) => setNewPrize({ ...newPrize, image })}
								label="nuevo premio"
								className="justify-self-center md:justify-self-start"
							/>
							<BrandColorInput
								id="new-prize-color"
								value={newPrize.backgroundColor}
								onChange={(e) =>
									setNewPrize({
										...newPrize,
										backgroundColor: e.target.value,
									})
								}
								className="h-9"
								aria-label="Color del nuevo premio"
							/>
							<BrandInput
								id="new-prize-probability"
								type="number"
								placeholder="Peso"
								value={newPrize.probability}
								onChange={(e) =>
									setNewPrize({
										...newPrize,
										probability: Number(e.target.value),
									})
								}
								className="h-9 text-center"
								aria-label="Peso del nuevo premio"
							/>
							<span
								className="text-center text-xs font-medium tabular-nums text-teal-600"
								title="Probabilidad real del nuevo premio"
							>
								{newPrizeRealProbability}
							</span>
							<BrandButton
								onClick={handleAddPrize}
								variant="outline"
								size="sm"
								className="h-9 w-full px-0 md:w-auto md:px-4"
								aria-label="Agregar premio"
							>
								<Plus className="h-4 w-4" />
								<span className="hidden md:inline">Agregar</span>
							</BrandButton>
						</div>
					</div>
				</div>
			</BrandCard>

			{/* Barra de guardado siempre visible */}
			<div className="sticky bottom-0 z-20 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-lg backdrop-blur">
				<div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
					<p className="px-1 text-xs font-medium text-slate-500">
						{prizes.length} {prizes.length === 1 ? "premio" : "premios"} · Total
						de pesos{" "}
						<span className="font-mono text-slate-700">{totalWeight}</span>
					</p>
					<BrandButton
						onClick={handleSaveConfiguration}
						disabled={isLoading}
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
