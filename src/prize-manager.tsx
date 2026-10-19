import React, { useState, useEffect } from "react";
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "./components/ui/card";
import { TrashIcon } from "lucide-react";
import { Label } from "./components/ui/label";

const API_URL = "http://localhost:3001/api";

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
		backgroundColor: "#FFFFFF",
		probability: 10,
	});
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [feedback, setFeedback] = useState<string>("");

	useEffect(() => {
		const fetchPrizes = async () => {
			if (!templateId) return;
			try {
				const response = await fetch(`${API_URL}/roulettes/${templateId}`);
				const data = await response.json();
				setPrizes(data.prizes || []);
				setTemplateName(data.name);
			} catch (error) {
				console.error("Failed to fetch prizes", error);
			}
		};
		fetchPrizes();
	}, [templateId]);

	const handleSaveConfiguration = async () => {
		setIsLoading(true);
		setFeedback("");
		try {
			const response = await fetch(`${API_URL}/roulettes/${templateId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: templateName, prizes }),
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message);
			setFeedback("Template saved!");
		} catch (error) {
			setFeedback(error instanceof Error ? error.message : "Failed to save.");
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
		setNewPrize({ name: "", backgroundColor: "#FFFFFF", probability: 10 });
	};

	const handleRemovePrize = (index: number) => {
		setPrizes(prizes.filter((_, i) => i !== index));
	};

	const handlePrizeChange = (
		index: number,
		field: keyof Prize,
		value: string | number,
	) => {
		const updatedPrizes = [...prizes];
		const prizeToUpdate = { ...updatedPrizes[index] };

		// Asegurarse de que la probabilidad sea un número
		const processedValue = field === "probability" ? Number(value) || 0 : value;

		(prizeToUpdate as any)[field] = processedValue;
		updatedPrizes[index] = prizeToUpdate;
		setPrizes(updatedPrizes);
	};

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle>Editar plantilla</CardTitle>
				<CardDescription>
					Luego de hacer los cambios toca en "Guardar Cambios"
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="grid w-full items-center gap-3">
					<Label htmlFor={"template-name"}>Nombre de la plantilla</Label>
					<Input
						id="template-name"
						type="text"
						value={templateName}
						onChange={(e) => setTemplateName(e.target.value)}
					/>
				</div>

				<div className="space-y-4 mb-6 w-full">
					{prizes.map((prize, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: es la manera de identificar
						<div key={index} className="flex items-center space-x-2">
							<div className="grid w-full items-center gap-3">
								<Label htmlFor={`prize-name-${index}`}>Nombre</Label>
								<Input
									id={`prize-name-${index}`}
									type="text"
									value={prize.name}
									onChange={(e) =>
										handlePrizeChange(index, "name", e.target.value)
									}
								/>
							</div>
							<div className="grid w-full max-w-sm items-center gap-3">
								<Label htmlFor={`prize-color-${index}`}>Color</Label>
								<Input
									type="color"
									id={`prize-color-${index}`}
									value={prize.backgroundColor}
									onChange={(e) =>
										handlePrizeChange(index, "backgroundColor", e.target.value)
									}
								/>
							</div>
							<div className="grid w-full items-center gap-3">
								<Label htmlFor={`prize-probability-${index}`}>
									Probabilidad
								</Label>
								<Input
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
							</div>

							<div className="grid w-full max-w-fit items-center gap-3">
								<Label htmlFor={`prize-probability-${index}`}>
									{" "}
									<span className="opacity-0">{" ."}</span>
								</Label>
								<Button
									onClick={() => handleRemovePrize(index)}
									variant={"destructive"}
									size={"icon"}
								>
									<TrashIcon />
								</Button>
							</div>
						</div>
					))}
				</div>

				{/* Add New Prize */}
				<div className="flex items-center space-x-2 border-t border-gray-700 pt-4">
					<Input
						type="text"
						placeholder="Prize Name"
						value={newPrize.name}
						onChange={(e) => setNewPrize({ ...newPrize, name: e.target.value })}
					/>
					<Input
						type="color"
						value={newPrize.backgroundColor}
						onChange={(e) =>
							setNewPrize({ ...newPrize, backgroundColor: e.target.value })
						}
					/>
					<Input
						type="number"
						placeholder="Probability"
						value={newPrize.probability}
						onChange={(e) =>
							setNewPrize({ ...newPrize, probability: Number(e.target.value) })
						}
					/>
					<Button onClick={handleAddPrize}>Agregar</Button>
				</div>

				{/* Save Button */}
			</CardContent>
			<CardFooter className="w-full gap-2 flex flex-col items-center justify-center">
				<Button
					onClick={handleSaveConfiguration}
					disabled={isLoading}
					variant={"secondary"}
					className="w-full"
				>
					Guardar cambios
				</Button>

				<Button
					onClick={() => {
						if (!isActive) onSetActive();
					}}
					disabled={isLoading}
					className="bg-brand w-full"
				>
					{isActive ? "Está activa" : "Marcar como activa"}
				</Button>
				<Button onClick={onDelete} disabled={isLoading} variant="ghost">
					Borrar plantilla
				</Button>
				{feedback && <p className="mt-2 text-sm text-purple-300">{feedback}</p>}
			</CardFooter>
		</Card>
	);
};
