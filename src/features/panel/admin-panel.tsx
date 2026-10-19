import { Gauge, Play, Square } from "lucide-react";
import { useState } from "react";
import { API_URL } from "@/shared/api";
import { translateMessage } from "./panel-messages";
import { PanelShell } from "./panel-shell";
import { ToastProvider, useToast } from "./panel-toast";
import { BrandButton, BrandCard, SectionHeading } from "./panel-ui";
import { TemplateManager } from "./template-manager";

const AdminPanelContent: React.FC = () => {
	const toast = useToast();
	const [isLoading, setIsLoading] = useState<boolean>(false);

	const handleCommand = async (action: "spin" | "stop") => {
		setIsLoading(true);
		try {
			const response = await fetch(`${API_URL}/command`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ action }),
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || "Ha ocurrido un error.");
			}

			toast.success(translateMessage(result.message, "Comando enviado."));
		} catch (error) {
			toast.error(
				translateMessage(error instanceof Error ? error.message : undefined),
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<PanelShell badge="Panel del Operador">
			<div className="mx-auto w-full max-w-[1120px] px-6 lg:px-10 py-6 md:py-8 flex flex-col gap-6">
				{/* Encabezado de página */}
				<div>
					<h1 className="text-3xl md:text-4xl font-black leading-tight tracking-tight text-[#1A2C35]">
						Panel de <span className="italic text-[#005f63]">Control</span>
					</h1>
					<div className="mt-2 flex items-center w-32 h-2">
						<div className="h-[2px] w-7 bg-[#E52421]" />
						<div className="h-[5px] w-9 bg-[#E52421]" />
						<div className="h-[2px] w-16 bg-[#D3DCE1]" />
					</div>
					<p className="mt-3 text-sm md:text-base font-medium text-slate-500">
						Controla el giro de la ruleta y administra los premios de la
						promoción.
					</p>
				</div>

				{/* Control del giro */}
				<BrandCard tone="dark">
					<SectionHeading
						icon={Gauge}
						title="Control del giro"
						subtitle="Gira o detiene la ruleta activa en la pantalla pública."
						tone="light"
					/>
					<div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
						<BrandButton
							variant="light"
							size="lg"
							onClick={() => handleCommand("spin")}
							disabled={isLoading}
							className="w-full sm:w-auto"
						>
							<Play className="h-5 w-5" />
							Girar Ruleta
						</BrandButton>
						<BrandButton
							variant="danger"
							size="lg"
							onClick={() => handleCommand("stop")}
							disabled={isLoading}
							className="w-full sm:w-auto"
						>
							<Square className="h-5 w-5" />
							Detener Ruleta
						</BrandButton>
					</div>
				</BrandCard>

				<TemplateManager />
			</div>
		</PanelShell>
	);
};

export const AdminPanel: React.FC = () => (
	<ToastProvider>
		<AdminPanelContent />
	</ToastProvider>
);
