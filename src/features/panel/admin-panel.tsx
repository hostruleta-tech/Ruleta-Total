import { ListChecks, LogOut } from "lucide-react";
import { useAdminAuth } from "./admin-auth";
import { PanelShell } from "./panel-shell";
import { ToastProvider } from "./panel-toast";
import { BrandButton, BrandCard, SectionHeading } from "./panel-ui";
import { TemplateManager } from "./template-manager";
import { AdminAuthProvider } from "./admin-auth";

const AdminPanelContent: React.FC = () => {
	const { logout } = useAdminAuth();

	return (
		<PanelShell badge="Panel del Operador">
			<div className="mx-auto w-full max-w-[1120px] px-6 lg:px-10 py-6 md:py-8 flex flex-col gap-6">
				{/* Encabezado de página */}
				<div className="flex flex-wrap items-start justify-between gap-4">
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
							Administra los premios y plantillas de la promoción. El giro lo
							inicia el participante desde su teléfono.
						</p>
					</div>

					<BrandButton variant="ghost" size="sm" onClick={logout}>
						<LogOut className="h-4 w-4" />
						Cerrar sesión
					</BrandButton>
				</div>

				{/* Promoción activa */}
				<TemplateManager />

				{/* Instrucciones rápidas */}
				<BrandCard tone="light">
					<SectionHeading
						icon={ListChecks}
						title="Cómo funciona"
						subtitle="Flujo del participante desde el teléfono."
					/>
					<div className="mt-4 space-y-3 text-sm text-slate-600">
						<div className="flex items-start gap-3">
							<span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#035157]/10 text-[#035157] flex items-center justify-center text-xs font-bold">
								1
							</span>
							<p>El participante abre el enlace de la ruleta en su móvil.</p>
						</div>
						<div className="flex items-start gap-3">
							<span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#035157]/10 text-[#035157] flex items-center justify-center text-xs font-bold">
								2
							</span>
							<p>
								Pulsa «Girar Ruleta»; el servidor sortea el premio según las
								probabilidades.
							</p>
						</div>
						<div className="flex items-start gap-3">
							<span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#035157]/10 text-[#035157] flex items-center justify-center text-xs font-bold">
								3
							</span>
							<p>La ruleta frena sola y muestra el resultado con un código.</p>
						</div>
						<div className="flex items-start gap-3">
							<span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#035157]/10 text-[#035157] flex items-center justify-center text-xs font-bold">
								4
							</span>
							<p>El personal valida el código y entrega el premio.</p>
						</div>
					</div>
				</BrandCard>
			</div>
		</PanelShell>
	);
};

export const AdminPanel: React.FC = () => (
	<ToastProvider>
		<AdminAuthProvider>
			<AdminPanelContent />
		</AdminAuthProvider>
	</ToastProvider>
);
