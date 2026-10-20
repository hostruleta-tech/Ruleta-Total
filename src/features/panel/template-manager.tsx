import { CheckCircle2, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api";
import { cn } from "@/shared/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/ui/select";
import { AdminHelp } from "./admin-help";
import { useOperatorAuth } from "./operator-auth-context";
import { translateMessage } from "./panel-messages";
import { useToast } from "./panel-toast";
import {
	BrandButton,
	BrandCard,
	BrandInput,
	BrandLabel,
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
	const { operatorFetch } = useOperatorAuth();
	const [templates, setTemplates] = useState<RouletteTemplate[]>([]);
	const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
		null,
	);
	const [newTemplateName, setNewTemplateName] = useState("");
	const [showCreateForm, setShowCreateForm] = useState(false);

	const selectedTemplate =
		templates.find((t) => t.id === selectedTemplateId) ?? null;

	const fetchTemplates = async () => {
		try {
			const response = await apiFetch("/roulettes");
			const data: RouletteTemplate[] = await response.json();
			setTemplates(data);
			setSelectedTemplateId((current) => {
				if (current && data.some((t) => t.id === current)) return current;
				const activeTemplate = data.find((t) => t.is_active) ?? data[0];
				return activeTemplate ? activeTemplate.id : null;
			});
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
		const name = newTemplateName.trim();
		if (!name) return;
		try {
			const response = await operatorFetch("/roulettes", {
				method: "POST",
				body: JSON.stringify({ name, prizes: [] }),
			});
			if (!response) return;
			if (!response.ok) {
				const error = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				throw new Error(error?.message);
			}
			setNewTemplateName("");
			setShowCreateForm(false);
			fetchTemplates();
			toast.success(`Plantilla "${name}" creada.`);
		} catch (error) {
			toast.error(
				translateMessage(
					error instanceof Error ? error.message : undefined,
					"No se pudo crear la plantilla.",
				),
			);
		}
	};

	const handleDeleteTemplate = async (id: number) => {
		if (
			!window.confirm("¿Estás seguro de que quieres eliminar esta plantilla?")
		)
			return;
		try {
			const response = await operatorFetch(`/roulettes/${id}`, {
				method: "DELETE",
			});
			if (!response) return;
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
			const response = await operatorFetch(`/roulettes/active/${id}`, {
				method: "POST",
			});
			if (!response) return;
			if (!response.ok) {
				const error = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				throw new Error(error?.message);
			}
			fetchTemplates();
			toast.success("Plantilla marcada como activa.");
		} catch (error) {
			toast.error(
				translateMessage(
					error instanceof Error ? error.message : undefined,
					"No se pudo marcar la plantilla como activa.",
				),
			);
		}
	};

	return (
		<div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
			{/* Columna izquierda: plantillas + ayuda */}
			<div className="flex min-w-0 flex-col gap-5">
				<BrandCard>
					<SectionHeading
						icon={LayoutTemplate}
						title="Plantillas"
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

					<div className="mt-4 space-y-3">
						{selectedTemplate && (
							<span
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
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

						{templates.length === 0 ? (
							<div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm font-medium text-slate-500">
								<LayoutTemplate className="h-5 w-5 shrink-0 text-slate-400" />
								Crea la primera plantilla con el botón de abajo.
							</div>
						) : (
							<div className="grid gap-1.5">
								<BrandLabel htmlFor="template-select">
									Plantilla a editar
								</BrandLabel>
								<Select
									value={selectedTemplateId?.toString()}
									onValueChange={(value) =>
										setSelectedTemplateId(Number(value))
									}
								>
									<SelectTrigger
										id="template-select"
										className="h-10 w-full rounded-xl border-slate-300 bg-white text-sm font-medium text-slate-800 shadow-sm data-[placeholder]:text-slate-400 focus-visible:border-[#005f63] focus-visible:ring-[#005f63]/25"
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
					</div>

					{/* Acciones de la plantilla */}
					<div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4">
						<BrandButton
							onClick={() =>
								selectedTemplate && handleSetActive(selectedTemplate.id)
							}
							disabled={!selectedTemplate || selectedTemplate.is_active}
							variant={selectedTemplate?.is_active ? "light" : "primary"}
							size="sm"
							className="w-full"
						>
							<CheckCircle2 className="h-4 w-4" />
							{selectedTemplate?.is_active
								? "Plantilla activa"
								: "Marcar como activa"}
						</BrandButton>

						<BrandButton
							onClick={() => setShowCreateForm((visible) => !visible)}
							variant="outline"
							size="sm"
							className="w-full"
							aria-expanded={showCreateForm}
						>
							<Plus className="h-4 w-4" />
							Nueva plantilla
						</BrandButton>

						{showCreateForm && (
							<form
								onSubmit={(event) => {
									event.preventDefault();
									handleCreateTemplate();
								}}
								className="flex flex-col gap-2 rounded-2xl border border-dashed border-[#005f63]/40 bg-[#005f63]/5 p-3"
							>
								<BrandInput
									type="text"
									value={newTemplateName}
									onChange={(event) => setNewTemplateName(event.target.value)}
									placeholder="Nombre de la plantilla"
									minLength={3}
									autoFocus
									aria-label="Nombre de la nueva plantilla"
								/>
								<div className="flex gap-2">
									<BrandButton
										type="submit"
										size="sm"
										className="flex-1"
										disabled={!newTemplateName.trim()}
									>
										Crear
									</BrandButton>
									<BrandButton
										type="button"
										variant="light"
										size="sm"
										onClick={() => {
											setShowCreateForm(false);
											setNewTemplateName("");
										}}
									>
										Cancelar
									</BrandButton>
								</div>
							</form>
						)}

						<BrandButton
							onClick={() =>
								selectedTemplate && handleDeleteTemplate(selectedTemplate.id)
							}
							disabled={!selectedTemplate}
							variant="ghost"
							size="sm"
							className="w-full text-[#E52421] hover:bg-[#E52421]/10 hover:text-[#c81d1a]"
						>
							<Trash2 className="h-4 w-4" />
							Borrar plantilla
						</BrandButton>
					</div>
				</BrandCard>

				<AdminHelp />
			</div>

			{/* Columna derecha: editor de premios */}
			<div className="min-w-0">
				{selectedTemplateId ? (
					<PrizeManager
						key={selectedTemplateId}
						templateId={selectedTemplateId}
						onSaved={fetchTemplates}
					/>
				) : (
					<div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
						<LayoutTemplate
							className="h-10 w-10 text-slate-300"
							aria-hidden="true"
						/>
						<p className="max-w-xs text-sm font-medium text-slate-500">
							Selecciona o crea una plantilla para editar sus premios.
						</p>
					</div>
				)}
			</div>
		</div>
	);
};
