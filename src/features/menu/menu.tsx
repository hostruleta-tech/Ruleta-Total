import {
	ArrowRight,
	ChevronRight,
	MapPin,
	Monitor,
	Play,
	Radio,
	Settings,
	SlidersHorizontal,
	Target,
	Tv,
} from "lucide-react";
import logoTotal from "@/assets/logotipo-total.png";

export default function Menu() {
	function onSelectView(view: string) {
		const url = new URL(window.location.href);
		url.searchParams.set("view", view);
		window.location.href = url.toString();
	}

	const steps = [
		{
			n: 1,
			icon: Monitor,
			title: "Abre el Panel del Operador",
			desc: "y crea o edita los premios.",
		},
		{
			n: 2,
			icon: SlidersHorizontal,
			title: "Guarda los cambios",
			desc: "y marca la plantilla como activa.",
		},
		{
			n: 3,
			icon: Tv,
			title: "Abre la Pantalla Pública",
			desc: "en la TV o monitor.",
		},
		{
			n: 4,
			icon: Play,
			title: "Desde el panel, usa Girar y Detener",
			desc: "para controlar la ruleta. El resultado aparece en la pantalla pública.",
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
				<div className="absolute -left-6 bottom-0 h-40 w-3 bg-[#E52421]" style={{ transform: "skewX(-24deg)" }} />
			</div>

			{/* Vista Principal */}
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
						{/* Sutil realce de profundidad en la esquina derecha */}
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

						{/* Promoción en tienda (esquina superior derecha mejorada) */}
						<div className="mr-16 hidden shrink-0 sm:block">
							<div className="flex h-[42px] items-center gap-2.5 rounded-full border border-white/40 bg-white/10 px-4 shadow-sm backdrop-blur-sm">
								<MapPin size={17} strokeWidth={2.6} className="shrink-0 text-white" aria-hidden="true" />
								<span className="whitespace-nowrap text-[13px] font-semibold text-white">
									Promoción en tienda
								</span>
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

				<main className="flex-1 flex flex-col min-h-0 overflow-hidden">
					{/* ============================================================== */}
					{/* BANNER "RULETA DIGITAL" (con separación bajo el header)        */}
					{/* ============================================================== */}
					<section className="relative mt-4 w-full h-[clamp(150px,19vh,224px)] overflow-hidden flex items-center">
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
						<div className="relative z-20 w-full max-w-[1360px] mx-auto px-6 lg:px-10">
							<div className="flex flex-col items-start sm:w-[52%]">
								<span className="font-caveat origin-left -rotate-2 text-[clamp(32px,4.7vh,50px)] font-bold leading-none text-[#00666B]">
									¡Lo hace posible!
								</span>
								<div className="flex items-center mt-1 w-32 h-2">
									<div className="h-[2px] w-7 bg-[#E52421]" />
									<div className="h-[5px] w-9 bg-[#E52421]" />
									<div className="h-[2px] w-16 bg-[#D3DCE1]" />
								</div>
							</div>

							<h1 className="mt-2 flex items-baseline text-[clamp(42px,7vh,80px)] font-black leading-[0.95] tracking-tight">
								<span className="text-[#1A2C35]">Ruleta</span>
								<span className="text-[#00666B] italic font-black ml-3">Digital</span>
							</h1>

							<p className="mt-2 font-medium tracking-tight text-slate-500 text-[clamp(16px,2.5vh,27px)]">
								Sistema profesional de ruleta para eventos
							</p>
						</div>
					</section>

					{/* Contenedor del contenido */}
					<div className="w-full max-w-[1120px] mx-auto px-6 lg:px-10 pt-4 flex-1 flex flex-col justify-center gap-3 min-h-0">
						{/* ============================================================== */}
						{/* TARJETAS PRINCIPALES                                           */}
						{/* ============================================================== */}
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

							{/* Tarjeta Pantalla Pública (Dark Teal Card) */}
							<div className="relative bg-gradient-to-br from-[#005256] via-[#005f63] to-[#003d40] text-white rounded-3xl p-5 shadow-xl overflow-hidden flex flex-col justify-between border border-teal-600/40 transform hover:-translate-y-0.5 transition-all">
								{/* Franja vertical roja/blanca de marca */}
								<div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-b from-[#e51a24] via-[#e51a24] to-white" aria-hidden="true" />
								<div className="flex items-start gap-5 pl-2">
									{/* Ícono grande de monitor */}
									<div className="w-20 h-16 rounded-2xl border-2 border-white/80 flex items-center justify-center flex-none bg-white/10 shadow-inner">
										<Tv className="h-8 w-8 text-white" strokeWidth={1.6} aria-hidden="true" />
									</div>
									{/* Información */}
									<div className="flex-1">
										<h2 className="text-xl md:text-2xl font-black text-white tracking-tight">Pantalla Pública</h2>
										<p className="text-xs md:text-sm text-teal-100 font-normal leading-snug mt-1.5">
											Muestra la ruleta a pantalla completa en la TV o monitor, para que la vean los participantes.
										</p>
									</div>
								</div>
								{/* Botón pill inferior: abrir pantalla pública */}
								<div className="mt-4 flex justify-end pr-2">
									<button
										type="button"
										onClick={() => onSelectView("tv")}
										className="w-full sm:w-auto px-7 py-2.5 rounded-full bg-white text-[#063f43] hover:bg-slate-100 font-bold text-sm tracking-wide shadow-md flex items-center justify-center gap-2.5 transition active:scale-95 group"
									>
										<Monitor className="h-4 w-4 group-hover:scale-110 transition-transform" aria-hidden="true" />
										<span>Abrir pantalla</span>
										<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" aria-hidden="true" />
									</button>
								</div>
							</div>

							{/* Tarjeta Panel del Operador (White / Light Card with Teal Trim) */}
							<div className="relative bg-white text-slate-800 rounded-3xl p-5 shadow-xl overflow-hidden flex flex-col justify-between border border-slate-200/90 transform hover:-translate-y-0.5 transition-all">
								{/* Franja vertical teal/roja de marca */}
								<div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-b from-[#005f63] via-[#005f63] to-[#e51a24]" aria-hidden="true" />
								<div className="flex items-start gap-5 pl-2">
									{/* Ícono de transmisión en vivo */}
									<div className="w-20 h-16 rounded-2xl flex items-center justify-center flex-none bg-teal-50 text-[#005f63] border border-teal-100 shadow-inner">
										<Radio className="h-8 w-8" strokeWidth={1.6} aria-hidden="true" />
									</div>
									{/* Información */}
									<div className="flex-1">
										<h2 className="text-xl md:text-2xl font-black text-[#005f63] tracking-tight">Panel del Operador</h2>
										<p className="text-xs md:text-sm text-slate-600 font-normal leading-snug mt-1.5">
											Controla el giro (Girar / Detener) y administra los premios de la ruleta.
										</p>
									</div>
								</div>
								{/* Botón pill inferior: abrir panel del operador */}
								<div className="mt-4 flex justify-end pr-2">
									<button
										type="button"
										onClick={() => onSelectView("admin")}
										className="w-full sm:w-auto px-8 py-2.5 rounded-full bg-[#063f43] text-white hover:bg-[#00474b] font-bold text-sm tracking-wide shadow-md flex items-center justify-center gap-2.5 transition active:scale-95 group"
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
						<section className="bg-white rounded-3xl p-4 md:p-5 shadow-lg border border-slate-200/80">
							{/* Cabecera de sección con ícono y acento */}
							<div className="flex items-center gap-3 mb-4">
								<div className="w-9 h-9 rounded-full bg-[#005f63] text-white flex items-center justify-center shadow">
									<Target className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
								</div>
								<div className="relative">
									<h3 className="text-lg md:text-xl font-bold text-slate-800 tracking-tight">Cómo usar</h3>
									<div className="w-12 h-0.5 bg-[#e51a24] mt-0.5" />
								</div>
							</div>

							{/* Flujo de 4 pasos */}
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start relative pt-1">
								{steps.map((step, i) => {
									const Icon = step.icon;
									return (
										<div key={step.n} className="flex items-start gap-3 relative group">
											<div className="flex items-center gap-2 flex-none">
												<span className="w-6 h-6 rounded-full bg-[#063f43] text-white text-xs font-bold flex items-center justify-center shadow-sm">
													{step.n}
												</span>
												<div className="w-9 h-9 rounded-xl bg-slate-100 text-[#063f43] flex items-center justify-center border border-slate-200 group-hover:border-[#005f63] transition">
													<Icon className="h-4 w-4" aria-hidden="true" />
												</div>
											</div>
											<div className="text-xs">
												<span className="font-bold text-slate-800 block text-xs md:text-sm">{step.title}</span>
												<span className="text-slate-500 font-normal">{step.desc}</span>
											</div>
											{/* Divisor de flecha para pantallas grandes */}
											{i < steps.length - 1 && (
												<div className="hidden lg:flex absolute right-0 top-3 text-slate-300" aria-hidden="true">
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
				<footer className="relative mt-4 h-[clamp(48px,6.5vh,68px)] shrink-0 overflow-hidden bg-gradient-to-r from-[#004D56] to-[#00565C] text-white">
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

			</div>
		</div>
	);
}
