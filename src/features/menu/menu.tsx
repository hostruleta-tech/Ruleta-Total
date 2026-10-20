import {
	ArrowRight,
	ChevronRight,
	ListChecks,
	Monitor,
	Play,
	Radio,
	Settings,
	SlidersHorizontal,
	Smartphone,
	Target,
} from "lucide-react";
import { SiteHeader } from "@/shared/components/site-header";
import { SiteFooter } from "@/shared/components/site-footer";

export default function Menu() {
	function onSelectView(view: string) {
		const url = new URL(window.location.href);
		url.searchParams.set("view", view);
		window.location.href = url.toString();
	}

	const steps = [
		{
			n: 1,
			icon: SlidersHorizontal,
			title: "Configura los premios",
			desc: "En el panel, crea o edita la plantilla y márcala como activa.",
		},
		{
			n: 2,
			icon: Smartphone,
			title: "Participante abre el enlace",
			desc: "Comparte la URL con ?view=play o el QR (próximamente).",
		},
		{
			n: 3,
			icon: Play,
			title: "Pulsa «Girar Ruleta»",
			desc: "El servidor sortea y la ruleta frena sola en el premio.",
		},
		{
			n: 4,
			icon: ListChecks,
			title: "Valida y entrega",
			desc: "El personal verifica el código y entrega el premio.",
		},
	];

	return (
		<div className="relative h-screen bg-[#EEF2F3] flex font-sans text-slate-800 select-none overflow-hidden">
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

			{/* Vista Principal */}
			<div className="relative z-10 flex-1 flex flex-col min-w-0 min-h-0">

				{/* Header */}
				<SiteHeader compact={true} />

				<main className="flex-1 flex flex-col min-h-0 overflow-y-auto">
					{/* ============================================================== */}
					{/* BANNER "RULETA DIGITAL" (con separación bajo el header)        */}
					{/* ============================================================== */}
					<section className="relative mt-3 w-full h-[clamp(120px,15vh,180px)] shrink-0 overflow-hidden flex items-center">
						{/* Línea roja fina */}
						<div
							className="absolute top-0 bottom-0 left-[48%] w-[3px] bg-[#E52421] pointer-events-none z-20 hidden sm:block"
							style={{ transform: "skewX(-27deg)", transformOrigin: "top" }}
						/>
						{/* Foto con corte angular, fundida con el fondo */}
						<div
							className="absolute top-0 bottom-0 right-[7%] left-[50%] overflow-hidden z-10 hidden sm:block"
							style={{
								transform: "skewX(-27deg)",
								transformOrigin: "top",
								maskImage: "linear-gradient(to right, transparent 0%, #000 28%)",
								WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 28%)",
							}}
						>
							<div className="absolute inset-0 -left-[24%] w-[148%] h-full" style={{ transform: "skewX(27deg)" }}>
								<img
									src="https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1200&q=80"
									alt="Estación de herramientas TOTAL"
									className="w-full h-full object-cover object-center filter contrast-125 brightness-95"
								/>
								<div className="absolute inset-0 bg-gradient-to-r from-[#00666B]/50 via-[#004F56]/22 to-transparent mix-blend-multiply" />
								<div className="absolute inset-0 bg-[#00666B]/35 mix-blend-color" />
							</div>
						</div>
						{/* Franja teal extremo derecho */}
						<div
							className="absolute top-0 bottom-0 right-[calc(7%_-_12px)] w-6 bg-[#00666B] z-20 pointer-events-none hidden sm:block"
							style={{ transform: "skewX(-27deg)", transformOrigin: "top" }}
						/>

						{/* Texto */}
						<div className="relative z-20 w-full max-w-[1360px] mx-auto pl-10 pr-6 sm:pl-16 lg:pl-24 lg:pr-10">
							<div className="flex flex-col items-start sm:w-[52%]">
								<span className="font-caveat origin-left -rotate-2 text-[clamp(24px,3.4vh,38px)] font-bold leading-none text-[#00666B]">
									¡Lo hace posible!
								</span>
								<div className="flex items-center mt-1 w-32 h-2">
									<div className="h-[2px] w-7 bg-[#E52421]" />
									<div className="h-[5px] w-9 bg-[#E52421]" />
									<div className="h-[2px] w-16 bg-[#D3DCE1]" />
								</div>
							</div>

							<h1 className="mt-2 flex items-baseline text-[clamp(34px,5.4vh,62px)] font-black leading-[0.95] tracking-tight">
								<span className="text-[#1A2C35]">Ruleta</span>
								<span className="text-[#00666B] italic font-black ml-3">Digital</span>
							</h1>

							<p className="mt-2 font-medium tracking-tight text-slate-500 text-[clamp(13px,1.9vh,20px)]">
								Sistema profesional de ruleta para eventos
							</p>
						</div>
					</section>

					{/* Contenedor del contenido */}
					<div
						className="w-full max-w-[1120px] mx-auto px-6 lg:px-10 pt-3 pb-3 flex-1 flex flex-col gap-2.5 min-h-0"
						style={{ justifyContent: "safe center" }}
					>
						{/* ============================================================== */}
						{/* TARJETAS PRINCIPALES                                           */}
						{/* ============================================================== */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">

							{/* Tarjeta Experiencia del Participante (Dark Teal Card) */}
							<div className="relative bg-gradient-to-br from-[#005256] via-[#005f63] to-[#003d40] text-white rounded-3xl p-4 shadow-xl overflow-hidden flex flex-col justify-between border border-teal-600/40 transform hover:-translate-y-0.5 transition-all">
								{/* Franja vertical roja/blanca de marca */}
								<div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-b from-[#e51a24] via-[#e51a24] to-white" aria-hidden="true" />
								<div className="flex items-start gap-4 pl-2">
									{/* Ícono grande de smartphone */}
									<div className="w-16 h-14 rounded-2xl border-2 border-white/80 flex items-center justify-center flex-none bg-white/10 shadow-inner">
										<Smartphone className="h-7 w-7 text-white" strokeWidth={1.6} aria-hidden="true" />
									</div>
									{/* Información */}
									<div className="flex-1">
										<h2 className="text-lg md:text-xl font-black text-white tracking-tight">Experiencia del participante</h2>
										<p className="text-xs md:text-sm text-teal-100 font-normal leading-snug mt-1.5">
											La ruleta en el móvil del cliente. Gira, frena sola y muestra el premio con código.
										</p>
									</div>
								</div>
								{/* Botón pill inferior: abrir experiencia */}
								<div className="mt-3 flex justify-end pr-2">
									<button
										type="button"
										onClick={() => onSelectView("play")}
										className="w-full sm:w-auto px-7 py-2 rounded-full bg-white text-[#063f43] hover:bg-slate-100 font-bold text-sm tracking-wide shadow-md flex items-center justify-center gap-2.5 transition active:scale-95 group"
									>
										<Monitor className="h-4 w-4 group-hover:scale-110 transition-transform" aria-hidden="true" />
										<span>Abrir experiencia</span>
										<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" aria-hidden="true" />
									</button>
								</div>
							</div>

							{/* Tarjeta Panel del Operador (White / Light Card with Teal Trim) */}
							<div className="relative bg-white text-slate-800 rounded-3xl p-4 shadow-xl overflow-hidden flex flex-col justify-between border border-slate-200/90 transform hover:-translate-y-0.5 transition-all">
								{/* Franja vertical teal/roja de marca */}
								<div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-b from-[#005f63] via-[#005f63] to-[#e51a24]" aria-hidden="true" />
								<div className="flex items-start gap-4 pl-2">
									{/* Ícono de configuración */}
									<div className="w-16 h-14 rounded-2xl flex items-center justify-center flex-none bg-teal-50 text-[#005f63] border border-teal-100 shadow-inner">
										<Settings className="h-7 w-7" strokeWidth={1.6} aria-hidden="true" />
									</div>
									{/* Información */}
									<div className="flex-1">
										<h2 className="text-lg md:text-xl font-black text-[#005f63] tracking-tight">Panel del Operador</h2>
										<p className="text-xs md:text-sm text-slate-600 font-normal leading-snug mt-1.5">
											Administra plantillas y premios. El giro lo inicia el participante desde su teléfono.
										</p>
									</div>
								</div>
								{/* Botón pill inferior: abrir panel del operador */}
								<div className="mt-3 flex justify-end pr-2">
									<button
										type="button"
										onClick={() => onSelectView("admin")}
										className="w-full sm:w-auto px-8 py-2 rounded-full bg-[#063f43] text-white hover:bg-[#00474b] font-bold text-sm tracking-wide shadow-md flex items-center justify-center gap-2.5 transition active:scale-95 group"
									>
										<Settings className="h-4 w-4 group-hover:rotate-90 transition-transform duration-300" aria-hidden="true" />
										<span>Abrir panel</span>
										<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" aria-hidden="true" />
									</button>
								</div>
							</div>

						</div>

						{/* ============================================================== */}
						{/* CÓMO USAR                                                      */}
						{/* ============================================================== */}
						<section className="bg-white rounded-3xl px-3 py-2 md:px-4 md:py-2.5 shadow-lg border border-slate-200/80">
							{/* Cabecera de sección con ícono y acento */}
							<div className="flex items-center gap-3 mb-2">
								<div className="w-7 h-7 rounded-full bg-[#005f63] text-white flex items-center justify-center shadow">
									<Target className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
								</div>
								<div className="relative">
									<h3 className="text-sm md:text-base font-bold text-slate-800 tracking-tight">Cómo usar</h3>
									<div className="w-12 h-0.5 bg-[#e51a24] mt-0.5" />
								</div>
							</div>

							{/* Flujo de 4 pasos */}
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-2 items-start relative pt-0">
								{steps.map((step, i) => {
									const Icon = step.icon;
									return (
										<div key={step.n} className="flex items-start gap-2 relative group">
											<div className="flex items-center gap-1.5 flex-none">
												<span className="w-5 h-5 rounded-full bg-[#063f43] text-white text-xs font-bold flex items-center justify-center shadow-sm">
													{step.n}
												</span>
												<div className="w-7 h-7 rounded-xl bg-slate-100 text-[#063f43] flex items-center justify-center border border-slate-200 group-hover:border-[#005f63] transition">
													<Icon className="h-4 w-4" aria-hidden="true" />
												</div>
											</div>
											<div className="text-xs leading-snug">
												<span className="font-bold text-slate-800 block text-xs md:text-sm">{step.title}</span>
												<span className="text-slate-500 font-normal">{step.desc}</span>
											</div>
											{/* Divisor de flecha para pantallas grandes */}
											{i < steps.length - 1 && (
												<div className="hidden lg:flex absolute right-0 top-2 text-slate-300" aria-hidden="true">
													<ChevronRight className="h-3 w-3" />
												</div>
											)}
										</div>
									);
								})}
							</div>
						</section>
					</div>
				</main>

				{/* Footer */}
				<SiteFooter />

			</div>
		</div>
	);
}