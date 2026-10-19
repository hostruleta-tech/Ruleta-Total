import { Pencil, Plus, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { adminFetch } from "@/shared/api";
import { GREEN_PALETTE, nextGreen } from "@/shared/prize-colors";
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
}

interface PrizeManagerProps {
	templateId: number;
	isActive: boolean;
	onDelete: () => void;
	onSetActive: () => void;
}

export const PrizeManager: React.FC<PrizeManagerProps> = ({
	templateId,
	isActive,
	onDelete,
	onSetActive,
}) => {
	const [prizes, setPrizes] = useState<Prize[]>([]);
	const [templateName, setTemplateName] = useState("");
	const [newPrize, setNewPrize] = useState<Omit<Prize, "id" | "roulette_id">>({
		name: "",
		backgroundColor: GREEN_PALETTE[0],
		probability: 10,
	});
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const toast = useToast();

	useEffect(() => {
		const fetchPrizes = async () => {
			if (!templateId) return;
			try {
				const response = await adminFetch(`/roulettes/${templateId}`);
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
			const response = await adminFetch(`/roulettes/${templateId}`, {
				method: "PUT",
				body: JSON.stringify({ name: templateName, prizes }),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message);
			toast.success("Cambios guardados.");
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
		});
	};

	const handleRemovePrize = (index: number) => {
		setPrizes(prizes.filter((_, i) => i !== index));
	};

	const handlePrizeChange = (
		index: number,
		field: keyof Prize,
		value: string | number,
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
		<BrandCard>
			<SectionHeading
				icon={Pencil}
				title="Editar plantilla"
				subtitle={`Luego de hacer los cambios toca en "Guardar cambios".`}
			/>

			<div className="mt-5 space-y-5">
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
					/>
				</div>

				{/* Lista de premios */}
				<div className="space-y-3">
					{totalWeight > 0 && (
						<div className="rounded-xl bg-teal-50 border border-teal-200 p-3 text-sm">
							<div className="flex flex-wrap items-center gap-4 text-teal-700">
								<span className="font-medium">
									Total de pesos: <span className="font-mono">{totalWeight}</span>
								</span>
								<span className="text-teal-600">
									Modelo A (pesos libres): cada número es un peso relativo, no un % fijo.
								</span>
							</div>
						</div>
					)}
					{prizes.map((prize, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: es la manera de identificar
						<div
							key={index}
							className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 md:p-4"
						>
							<div className="flex flex-wrap items-end gap-3">
								<div className="grid min-w-[160px] flex-1 gap-1.5">
									<BrandLabel htmlFor={`prize-name-${index}`}>
										Nombre
									</BrandLabel>
									<BrandInput
										id={`prize-name-${index}`}
										type="text"
										value={prize.name}
										onChange={(e) =>
											handlePrizeChange(index, "name", e.target.value)
										}
									/>
								</div>
								<div className="grid w-24 gap-1.5">
									<BrandLabel htmlFor={`prize-color-${index}`}>
										Color
									</BrandLabel>
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
									/>
								</div>
								<div className="grid w-28 gap-1.5">
									<BrandLabel htmlFor={`prize-probability-${index}`}>
										Probabilidad
									</BrandLabel>
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
									/>
									<span className="text-[11px] font-medium leading-none text-teal-600">
										Real: {getRealProbability(prize.probability)}
									</span>
								</div>
								<BrandButton
									onClick={() => handleRemovePrize(index)}
									variant="danger"
									size="icon"
									aria-label="Eliminar premio"
								>
									<TrashIcon />
								</BrandButton>
							</div>
						</div>
					))}
				</div>

				{/* Agregar nuevo premio */}
				<div className="rounded-2xl border border-dashed border-[#005f63]/40 bg-[#005f63]/5 p-3 md:p-4">
					<div className="flex flex-wrap items-end gap-3">
						<div className="grid min-w-[160px] flex-1 gap-1.5">
							<BrandLabel htmlFor="new-prize-name">
								Nombre del premio
							</BrandLabel>
							<BrandInput
								id="new-prize-name"
								type="text"
								placeholder="Nombre del premio"
								value={newPrize.name}
								onChange={(e) =>
									setNewPrize({ ...newPrize, name: e.target.value })
								}
							/>
						</div>
						<div className="grid w-24 gap-1.5">
							<BrandLabel htmlFor="new-prize-color">Color</BrandLabel>
							<BrandColorInput
								id="new-prize-color"
								value={newPrize.backgroundColor}
								onChange={(e) =>
									setNewPrize({
										...newPrize,
										backgroundColor: e.target.value,
									})
								}
							/>
						</div>
						<div className="grid w-28 gap-1.5">
							<BrandLabel htmlFor="new-prize-probability">
								Probabilidad
							</BrandLabel>
							<BrandInput
								id="new-prize-probability"
								type="number"
								placeholder="Probabilidad"
								value={newPrize.probability}
								onChange={(e) =>
									setNewPrize({
										...newPrize,
										probability: Number(e.target.value),
									})
								}
							/>
							<span className="text-[11px] font-medium leading-none text-teal-600">
								Real: {newPrizeRealProbability}
							</span>
						</div>
						<BrandButton onClick={handleAddPrize} variant="outline">
							<Plus className="h-4 w-4" />
							Agregar
						</BrandButton>
					</div>
				</div>
			</div>

			{/* Acciones */}
			<div className="mt-6 border-t border-slate-200 pt-5">
				<div className="flex flex-col gap-3 sm:flex-row">
					<BrandButton
						onClick={handleSaveConfiguration}
						disabled={isLoading}
						variant="outline"
						className="flex-1"
					>
						Guardar cambios
					</BrandButton>

					<BrandButton
						onClick={() => {
							if (!isActive) onSetActive();
						}}
						disabled={isLoading}
						variant={isActive ? "light" : "primary"}
						className="flex-1"
					>
						{isActive ? "Está activa" : "Marcar como activa"}
					</BrandButton>
				</div>

				<div className="mt-4 flex justify-center">
					<BrandButton
						onClick={onDelete}
						disabled={isLoading}
						variant="ghost"
						className="text-[#E52421] hover:bg-[#E52421]/10 hover:text-[#c81d1a]"
					>
						Borrar plantilla
					</BrandButton>
				</div>
			</div>
		</BrandCard>
	);
};
