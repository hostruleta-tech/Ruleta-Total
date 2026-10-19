import { useState, useEffect } from "react";
import { PrizeManager } from "./prize-manager";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { ButtonGroup } from "./components/ui/button-group";
import { Label } from "./components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./components/ui/select";
import { API_URL } from "./api";

interface RouletteTemplate {
	id: number;
	name: string;
	is_active: boolean;
}

export const TemplateManager: React.FC = () => {
	const [templates, setTemplates] = useState<RouletteTemplate[]>([]);
	const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
		null,
	);
	const [newTemplateName, setNewTemplateName] = useState("");
	const [feedback, setFeedback] = useState("");

	const fetchTemplates = async () => {
		try {
			const response = await fetch(`${API_URL}/roulettes`);
			const data: RouletteTemplate[] = await response.json();
			setTemplates(data);
			if (!selectedTemplateId && data.length > 0) {
				const activeTemplate = data.find((t) => t.is_active) || data[0];
				setSelectedTemplateId(activeTemplate.id);
			}
		} catch (error) {
			console.error("Failed to fetch templates", error);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies:No hace falta
	useEffect(() => {
		fetchTemplates();
	}, []);

	const handleCreateTemplate = async () => {
		if (!newTemplateName.trim()) return;
		try {
			await fetch(`${API_URL}/roulettes`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: newTemplateName, prizes: [] }),
			});
			setNewTemplateName("");
			fetchTemplates();
			setFeedback(`Plantilla "${newTemplateName}" creada.`);
		} catch (error) {
			setFeedback("Hubo un error al crear.");
		}
	};

	const handleDeleteTemplate = async (id: number) => {
		if (
			!window.confirm("¿Estás seguro de que quieres eliminar esta plantilla?")
		)
			return;
		try {
			const response = await fetch(`${API_URL}/roulettes/${id}`, {
				method: "DELETE",
			});
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message);
			}
			setSelectedTemplateId(null);
			fetchTemplates();
			setFeedback("Plantilla eliminada.");
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Ocurrio un error al eliminar.";
			setFeedback(message);
		}
	};

	const handleSetActive = async (id: number) => {
		try {
			await fetch(`${API_URL}/roulettes/active/${id}`, { method: "POST" });
			fetchTemplates();
			setFeedback("Plantilla marcada como activa.");
		} catch (error) {
			setFeedback("Fallo al marcar la plantilla como activa.");
		}
	};

	return (
		<div className="mt-8">
			<h2 className="text-2xl font-bold mb-4">Plantillas</h2>
			{feedback && <p className="mb-4 text-purple-300">{feedback}</p>}

			<Card>
				<CardHeader>
					<CardTitle className="">Crear Plantilla</CardTitle>
				</CardHeader>
				<CardContent>
					<ButtonGroup>
						<Input
							type="text"
							value={newTemplateName}
							onChange={(e) => setNewTemplateName(e.target.value)}
							placeholder="Nombre de la plantilla"
							minLength={3}
						/>
						<Button onClick={handleCreateTemplate}>Crear</Button>
					</ButtonGroup>
				</CardContent>
			</Card>

			<div className="mb-6">
				<Label htmlFor="template-select" className="block mb-2">
					Selecciona la plantilla:
				</Label>
				<Select
					value={selectedTemplateId?.toString()}
					onValueChange={(value) => setSelectedTemplateId(Number(value))}
				>
					<SelectTrigger id="template-select">
						<SelectValue placeholder="Plantilla" />
					</SelectTrigger>
					<SelectContent>
						{templates.map((t) => (
							<SelectItem key={t.id} value={t.id.toString()}>
								{t.name} {t.is_active ? "(Activa)" : ""}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{selectedTemplateId && (
				<PrizeManager
					key={selectedTemplateId}
					templateId={selectedTemplateId}
					onDelete={() => handleDeleteTemplate(selectedTemplateId)}
					onSetActive={() => handleSetActive(selectedTemplateId)}
					isActive={
						templates.find((t) => t.id === selectedTemplateId)?.is_active ||
						false
					}
				/>
			)}
		</div>
	);
};
