import type { ReactNode } from "react";
import { SiteHeader } from "@/shared/components/site-header";
import { SiteFooter } from "@/shared/components/site-footer";
import { DoorOpen, LayoutDashboard } from "lucide-react";
import { API_URL } from "@/shared/api";

interface PanelShellProps {
	children: ReactNode;
	/** Texto del distintivo en la esquina superior derecha del header. */
	badge?: string;
}

/**
 * Estructura visual de marca (TOTAL) para el Panel del Operador.
 * Usa el header y footer compartidos para consistencia con el resto de la web.
 */
export function PanelShell({ children, badge = "Promoción en tienda" }: PanelShellProps) {
	const handleLogout = async () => {
		try {
			await fetch(`${API_URL}/auth/logout`, {
				method: "POST",
				credentials: "same-origin",
			});
		} catch {
			// Ignorar errores
		}
		window.location.replace("/login-admin");
	};

	const goToMenu = () => {
		window.location.href = "/?view=menu";
	};

	return (
		<div className="relative h-screen bg-[#EEF2F3] flex font-sans text-slate-800 overflow-hidden">
			{/* Fuente manuscrita + respeto por reduced motion */}
			<style>{`
        @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap');
        .font-caveat { font-family: 'Caveat', cursive; }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>

			{/* Fondo decorativo */}
			<div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
				<div className="absolute -left-40 -top-24 h-[140%] w-[46%] bg-white/25" style={{ transform: "skewX(-18deg)" }} />
				<div className="absolute left-[20%] -top-24 h-[140%] w-[10%] bg-white/15" style={{ transform: "skewX(-18deg)" }} />
				<div className="absolute -right-24 -top-24 h-[140%] w-[26%] bg-white/15" style={{ transform: "skewX(-18deg)" }} />
			</div>

			<div className="relative z-10 flex-1 flex flex-col min-w-0 min-h-0">
				{/* Header compartido + navegación integrada */}
				<SiteHeader
					badge={badge}
					showRibbon={false}
					actions={
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={goToMenu}
								className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-white text-xs font-semibold hover:bg-white/30 transition backdrop-blur-sm"
								aria-label="Volver al menú"
							>
								<LayoutDashboard className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">Menú</span>
							</button>
							<button
								type="button"
								onClick={handleLogout}
								className="rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition backdrop-blur-sm"
								aria-label="Cerrar sesión"
								title="Cerrar sesión"
							>
								<DoorOpen className="h-4.5 w-4.5" />
							</button>
						</div>
					}
				/>

				{/* Contenido scrollable (el footer aparece al llegar al final) */}
				<main className="flex-1 min-h-0 overflow-y-auto flex flex-col">
					{children}

					{/* Footer compartido */}
					<SiteFooter className="mt-auto" />
				</main>
			</div>
		</div>
	);
}