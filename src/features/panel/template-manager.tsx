import { LayoutTemplate, ListChecks, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { adminFetch } from "@/shared/api";
import { cn } from "@/shared/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/ui/select";
import { translateMessage } from "./panel-messages";
import { useToast } from "./panel-toast";
import {
	BrandButton,
	BrandCard,
	BrandInput,
	SectionHeading,
} from "./panel-ui";
import { PrizeManager } from "./prize-manager";

interface RouletteTemplate {
	id: number;
	name: string;
	is_active: boolean;
}

export const TemplateManager: React.FC = () => {
	const toast = useToast();
	const [templates, setTemplates] = useState<RouletteTemplate[]>([]);
	const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
		null,
	);
	const [newTemplateName, setNewTemplateName] = useState("");

	const selectedTemplate =
		templates.find((t) => t.id === selectedTemplateId) ?? null;

	const fetchTemplates = async () => {
		try {
			const response = await adminFetch("/roulettes");
			const data: RouletteTemplate[] = await response.json();
			setTemplates(data);
			if (!selectedTemplateId && data.length > 0) {
				const activeTemplate = data.find((t) => t.is_active) || data[0];
				setSelectedTemplateId(activeTemplate.id);
			}
		} catch {
			toast.error("No se pudieron cargar las plantillas.");
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies:No hace falta
	useEffect(() => {
		fetchTemplates();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleCreateTemplate = async () => {
		if (!newTemplateName.trim()) return;
		try {
			await adminFetch("/roulettes", {
				method: "POST",
				body: JSON.stringify({ name: newTemplateName, prizes: [] }),
			});
			setNewTemplateName("");
			fetchTemplates();
			toast.success(`Plantilla "${newTemplateName}" creada.`);
		} catch {
			toast.error("No se pudo crear la plantilla.");
		}
	};

	const handleDeleteTemplate = async (id: number) => {
		if (
			!window.confirm("¿Estás seguro de que quieres eliminar esta plantilla?")
		)
			return;
		try {
			const response = await adminFetch(`/roulettes/${id}`, {
				method: "DELETE",
			});
			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.message);
			}
			setSelectedTemplateId(null);
			fetchTemplates();
			toast.success("Plantilla eliminada.");
		} catch (error) {
			toast.error(
				translateMessage(
					error instanceof Error ? error.message : undefined,
					"No se pudo eliminar la plantilla.",
				),
			);
		}
	};

	const handleSetActive = async (id: number) => {
		try {
			await adminFetch(`/roulettes/active/${id}`, { method: "POST" });
			fetchTemplates();
			toast.success("Plantilla marcada como activa.");
		} catch {
			toast.error("No se pudo marcar la plantilla como activa.");
		}
	};

	return (
		<section className="flex flex-col gap-6">
			<SectionHeading
				icon={LayoutTemplate}
				title="Plantillas"
				subtitle="Crea, selecciona y administra las plantillas de premios."
			/>

			{/* Crear plantilla */}
			<BrandCard>
				<h4 className="mb-4 text-base font-bold tracking-tight text-slate-800">
					Crear plantilla
				</h4>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
					<BrandInput
						type="text"
						value={newTemplateName}
						onChange={(e) => setNewTemplateName(e.target.value)}
						placeholder="Nombre de la plantilla"
						minLength={3}
						className="sm:flex-1"
					/>
					<BrandButton
						onClick={handleCreateTemplate}
						className="w-full sm:w-auto"
					>
						<Plus className="h-4 w-4" />
						Crear
					</BrandButton>
				</div>
			</BrandCard>

			{/* Seleccionar plantilla */}
			<BrandCard>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<SectionHeading
						icon={ListChecks}
						title="Seleccionar plantilla"
						subtitle={
							templates.length === 0
								? "Aún no hay plantillas creadas."
								: `${templates.length} ${
										templates.length === 1
											? "plantilla disponible"
											: "plantillas disponibles"
									}`
						}
					/>
					{selectedTemplate && (
						<span
							className={cn(
								"inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide sm:self-auto",
								selectedTemplate.is_active
									? "bg-[#005f63]/10 text-[#005f63]"
									: "bg-slate-100 text-slate-500",
							)}
						>
							<span
								className={cn(
									"h-2 w-2 rounded-full",
									selectedTemplate.is_active
										? "bg-[#005f63]"
										: "bg-slate-400",
								)}
							/>
							{selectedTemplate.is_active ? "Activa" : "Inactiva"}
						</span>
					)}
				</div>

				{templates.length === 0 ? (
					<div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-sm font-medium text-slate-500">
						<LayoutTemplate className="h-5 w-5 shrink-0 text-slate-400" />
						No hay plantillas. Crea la primera con el formulario de arriba.
					</div>
				) : (
					<div className="mt-4">
						<Select
							value={selectedTemplateId?.toString()}
							onValueChange={(value) => setSelectedTemplateId(Number(value))}
						>
							<SelectTrigger
								id="template-select"
								className="h-11 w-full rounded-xl border-slate-300 bg-white text-sm font-medium text-slate-800 shadow-sm data-[placeholder]:text-slate-400 focus-visible:border-[#005f63] focus-visible:ring-[#005f63]/25"
							>
								<SelectValue placeholder="Elige una plantilla" />
							</SelectTrigger>
							<SelectContent className="rounded-xl border-slate-200 bg-white text-slate-800">
								{templates.map((t) => (
									<SelectItem
										key={t.id}
										value={t.id.toString()}
										className="rounded-lg py-2 text-slate-700 focus:bg-[#005f63]/10 focus:text-[#063f43]"
									>
										{t.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
			</BrandCard>

			{selectedTemplateId && (
				<PrizeManager
					key={selectedTemplateId}
					templateId={selectedTemplateId}
					onDelete={() => handleDeleteTemplate(selectedTemplateId)}
					onSetActive={() => handleSetActive(selectedTemplateId)}
					isActive={selectedTemplate?.is_active || false}
				/>
			)}
		</section>
	);
};
