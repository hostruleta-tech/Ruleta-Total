import { MapPin } from "lucide-react";
import type { ReactNode } from "react";
import logoTotal from "@/assets/logotipo-total.png";

interface PanelShellProps {
	children: ReactNode;
	/** Texto del distintivo en la esquina superior derecha del header. */
	badge?: string;
}

/**
 * Estructura visual de marca (TOTAL) para el Panel del Operador.
 * Replica el lenguaje de `menu.tsx`: header diagonal teal, línea verde,
 * fondo decorativo y footer con franjas, dejando el contenido scrollable.
 */
export function PanelShell({ children, badge = "Promoción en tienda" }: PanelShellProps) {
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
				{/* Header */}
				<header
					className="relative z-40 h-[clamp(64px,8.5vh,88px)] w-full shrink-0 overflow-hidden bg-[#00767C] text-white shadow-md"
					style={{
						clipPath: "polygon(0 0, calc(100% - 40px) 0, calc(100% - 78px) 100%, 0 100%)",
					}}
				>
					<div className="pointer-events-none absolute inset-0" aria-hidden="true">
						<div className="absolute -left-5 top-0 h-full w-10 bg-[#008087]/50" style={{ clipPath: "polygon(60% 0, 100% 0, 40% 100%, 0 100%)" }} />
						<div className="absolute left-[58%] top-0 h-full w-20 bg-[#008087]/40" style={{ clipPath: "polygon(65% 0, 100% 0, 35% 100%, 0 100%)" }} />
						<div className="absolute left-[64%] top-0 h-full w-12 bg-[#004F56]/50" style={{ clipPath: "polygon(60% 0, 100% 0, 40% 100%, 0 100%)" }} />
						<div className="absolute right-[16%] top-0 h-full w-16 bg-[#008087]/40" style={{ clipPath: "polygon(65% 0, 100% 0, 35% 100%, 0 100%)" }} />
						<div className="absolute right-0 top-0 h-full w-[40%] bg-gradient-to-l from-[#004F56]/40 to-transparent" />
					</div>

					{/* Acento rojo de marca en el corte derecho */}
					<div
						className="pointer-events-none absolute right-[60px] top-0 z-20 h-full w-[5px] bg-[#E52421]"
						style={{ transform: "skewX(-28deg)", transformOrigin: "top right" }}
						aria-hidden="true"
					/>

					<div className="relative z-10 flex h-full items-center gap-6 px-6 pr-16 sm:px-8">
						<img
							src={logoTotal}
							alt="TOTAL"
							draggable={false}
							className="h-[clamp(28px,4.8vh,46px)] w-auto shrink-0 select-none object-contain"
						/>
						<span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-[-0.2px] text-teal-50/90 sm:text-[17px]">
							One-Stop Tools Station
						</span>

						{/* Distintivo superior derecha */}
						<div className="mr-16 hidden shrink-0 sm:block">
							<div className="flex h-[42px] items-center gap-2.5 rounded-full border border-white/40 bg-white/10 px-4 shadow-sm backdrop-blur-sm">
								<MapPin size={17} strokeWidth={2.6} className="shrink-0 text-white" aria-hidden="true" />
								<span className="whitespace-nowrap text-[13px] font-semibold text-white">{badge}</span>
							</div>
						</div>
					</div>

					<div
						aria-hidden="true"
						className="pointer-events-none absolute bottom-0 left-0 z-20 h-[4px] w-full bg-white"
						style={{ clipPath: "polygon(0 0, 97.8% 0, 96.4% 100%, 0 100%)" }}
					/>
					<div
						aria-hidden="true"
						className="pointer-events-none absolute right-[40px] top-0 z-20 h-full w-[4px] bg-white/90"
						style={{ transform: "skewX(-28deg)", transformOrigin: "top right" }}
					/>
				</header>

				{/* Borde verde bajo el header */}
				<div
					aria-hidden="true"
					className="pointer-events-none h-[4px] w-full shrink-0 bg-[#004F56]"
					style={{ clipPath: "polygon(0 0, calc(100% - 78px) 0, calc(100% - 80px) 100%, 0 100%)" }}
				/>

				{/* Contenido scrollable (el footer aparece al llegar al final) */}
				<main className="flex-1 min-h-0 overflow-y-auto flex flex-col">
					{children}

					{/* Footer */}
					<footer className="mt-auto relative h-[clamp(48px,6.5vh,68px)] overflow-hidden bg-gradient-to-r from-[#004D56] to-[#00565C] text-white">
						<div className="absolute inset-x-0 top-0 h-px bg-white/10" aria-hidden="true" />
						<div className="pointer-events-none absolute left-0 top-0 bottom-0 flex items-center" aria-hidden="true">
							<div className="h-full w-4 -translate-x-1.5 -skew-x-12 bg-[#E52421]" />
						</div>
						<div className="pointer-events-none absolute right-0 top-0 bottom-0 flex items-center" aria-hidden="true">
							<div className="h-full w-8 translate-x-2 -skew-x-12 bg-teal-200/90" />
							<div className="h-full w-8 translate-x-4 -skew-x-12 bg-[#E52421]" />
							<div className="h-full w-8 translate-x-6 -skew-x-12 bg-[#008087]" />
						</div>

						<div className="relative z-10 flex h-full items-center gap-3 px-8">
							<img
								src={logoTotal}
								alt="TOTAL"
								draggable={false}
								className="h-[clamp(15px,2.2vh,22px)] w-auto select-none object-contain"
							/>
							<span className="text-[13px] font-medium text-teal-100/80">One-Stop Tools Station</span>
						</div>
					</footer>
				</main>
			</div>
		</div>
	);
}
