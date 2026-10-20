import { LayoutTemplate, QrCode } from "lucide-react";
import { useState } from "react";
import { OperatorAuthProvider } from "./operator-auth";
import { BrandButton } from "./panel-ui";
import { PanelShell } from "./panel-shell";
import { TicketManager } from "./ticket-manager";
import { ToastProvider } from "./panel-toast";
import { TemplateManager } from "./template-manager";

const AdminPanelContent: React.FC = () => {
	const [section, setSection] = useState<"prizes" | "tickets">("prizes");

	return (
		<PanelShell badge="Panel del Operador">
			<div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-5 sm:px-6 md:py-6 lg:px-10">
				{/* Encabezado de página */}
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h1 className="text-2xl md:text-3xl font-black leading-tight tracking-tight text-[#1A2C35]">
							Panel de <span className="italic text-[#005f63]">Control</span>
						</h1>
						<div className="mt-2 flex items-center w-32 h-2">
							<div className="h-[2px] w-7 bg-[#E52421]" />
							<div className="h-[5px] w-9 bg-[#E52421]" />
							<div className="h-[2px] w-16 bg-[#D3DCE1]" />
						</div>
						<p className="mt-2 text-sm font-medium text-slate-500">
							Administra premios, plantillas y tickets QR. El giro lo inicia
							el participante desde su teléfono.
						</p>
					</div>
				</div>

				{/* Secciones del panel */}
				<div
					className="flex flex-wrap items-center gap-2"
					role="tablist"
					aria-label="Secciones del panel"
				>
					<BrandButton
						role="tab"
						aria-selected={section === "prizes"}
						variant={section === "prizes" ? "primary" : "light"}
						size="sm"
						onClick={() => setSection("prizes")}
					>
						<LayoutTemplate className="h-4 w-4" />
						Premios y plantillas
					</BrandButton>
					<BrandButton
						role="tab"
						aria-selected={section === "tickets"}
						variant={section === "tickets" ? "primary" : "light"}
						size="sm"
						onClick={() => setSection("tickets")}
					>
						<QrCode className="h-4 w-4" />
						Tickets QR
					</BrandButton>
				</div>

				{/* Contenido de la sección activa */}
				{section === "prizes" ? <TemplateManager /> : <TicketManager />}
			</div>
		</PanelShell>
	);
};

export const AdminPanel: React.FC = () => (
	<ToastProvider>
		<OperatorAuthProvider>
			<AdminPanelContent />
		</OperatorAuthProvider>
	</ToastProvider>
);
