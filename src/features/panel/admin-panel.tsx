import { LogOut } from "lucide-react";
import { AdminAuthProvider } from "./admin-auth";
import { useAdminAuth } from "./admin-auth-context";
import { PanelShell } from "./panel-shell";
import { ToastProvider } from "./panel-toast";
import { BrandButton } from "./panel-ui";
import { TemplateManager } from "./template-manager";

const AdminPanelContent: React.FC = () => {
	const { logout } = useAdminAuth();

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
							Administra premios y plantillas. El giro lo inicia el participante
							desde su teléfono.
						</p>
					</div>

					<BrandButton variant="ghost" size="sm" onClick={logout}>
						<LogOut className="h-4 w-4" />
						Cerrar sesión
					</BrandButton>
				</div>

				{/* Plantillas + editor de premios */}
				<TemplateManager />
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
