import React, { useEffect, useRef } from "react";
import Confetti from "react-confetti";

interface PrizeModalProps {
	prize: string;
	claimCode: string | null;
	prizeColor: string | null;
	onClose: () => void;
}

export const PrizeModal: React.FC<PrizeModalProps> = ({
	prize,
	claimCode,
	prizeColor,
	onClose,
}) => {
	const btnRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		btnRef.current?.focus();
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleEsc);
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", handleEsc);
			document.body.style.overflow = "";
		};
	}, [onClose]);

	// Confeti con colores de marca
	const confettiColors = [
		"#005f63",
		"#008087",
		"#E52421",
		"#ffffff",
		"#4A7C3F",
	];

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="prize-title"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			{/* Overlay con blur y color de marca */ }
			<div
				className="absolute inset-0 bg-[#02282b]/80 backdrop-blur-md"
				aria-hidden="true"
			/>

			{/* Confeti */ }
			<Confetti
				width={window.innerWidth}
				height={window.innerHeight}
				recycle={false}
				numberOfPieces={300}
				colors={confettiColors}
				className="pointer-events-none absolute inset-0"
			/>

			{/* Tarjeta ticket */ }
			<div
				className="relative w-full max-w-sm animate-fade-in-down bg-white rounded-[28px] shadow-[0_30px_80px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col border border-slate-200/80"
			>
				{/* Franja vertical de marca (rojo/blanco) */ }
				<div
					className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-b from-[#e51a24] via-[#e51a24] to-white"
					aria-hidden="true"
				/>

				{/* CABECERA TEAL */ }
				<div className="relative pl-6 pr-5 pt-6 pb-4 text-white">
					<div
						className="absolute inset-0 -left-6 -right-5 -top-6 -bottom-4 bg-gradient-to-br from-[#005256] via-[#005f63] to-[#003d40] rounded-[28px] 0 0"
						style={{ borderTopLeftRadius: "28px", borderTopRightRadius: "28px" }}
						aria-hidden="true"
					/>

					{/* Logo TOTAL */ }
					<div className="relative flex items-center justify-center mb-3">
						<div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20 shadow-inner">
							<svg
								width="48"
								height="48"
								viewBox="0 0 200 200"
								fill="none"
								xmlns="http://www.w3.org/2000/svg"
								aria-hidden="true"
							>
								<rect
									x="20"
									y="50"
									width="160"
									height="100"
									rx="12"
									fill="currentColor"
								/>
								<text
									x="100"
									y="118"
									fontFamily="Arial, Helvetica, sans-serif"
									fontSize="64"
									fontWeight="900"
									fill="currentColor"
									textAnchor="middle"
									dominantBaseline="middle"
								>
									TOTAL
								</text>
							</svg>
						</div>
					</div>

					<h2
						id="prize-title"
						className="relative text-3xl font-black tracking-tight leading-tight mb-1"
					>
						¡FELICIDADES!
					</h2>

					{/* Medalla / trofeo */ }
					<div className="relative w-16 h-16 mx-auto">
						<svg
							viewBox="0 0 48 48"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
							className="w-full h-full text-white"
						>
							<circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
							<path
								d="M14 34V24a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v10"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							<path
								d="M24 18V8"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							/>
							<path
								d="M14 34h20"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							/>
						</svg>
					</div>
				</div>

				{/* CUERPO */ }
				<div className="relative pl-6 pr-5 pb-6 flex-1 flex flex-col items-center">
					{/* Microcopy */ }
					<p className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-4">
						HAS GANADO
					</p>

					{/* Ticket del premio */ }
					<div className="w-full rounded-2xl overflow-hidden shadow-lg bg-white border border-slate-200">
						{/* Parte superior: color del premio */ }
						<div
							className="px-5 py-5 text-center text-white"
							style={{
								backgroundColor: prizeColor ?? "#005f63",
							}}
						>
							<p className="text-xl font-black leading-tight tracking-tight">
								{prize}
							</p>
						</div>

						{/* Parte inferior: código */ }
						<div className="px-5 py-5 bg-[#eef2f5] text-center">
							<p className="text-xs font-semibold tracking-wider uppercase text-slate-500 mb-1.5">
								CÓDIGO DE RECLAMO
							</p>
							<p
								className="text-3xl font-extrabold tracking-[0.2em] text-slate-900 font-mono select-all"
							>
								{claimCode ?? "—"}
							</p>
						</div>
					</div>

					{/* CTA rojo píldora */ }
					<button
						ref={btnRef}
						type="button"
						onClick={onClose}
						className="mt-6 w-full max-w-[260px] py-3.5 px-6 rounded-full font-black text-white tracking-wider uppercase text-base shadow-[0_8px_20px_rgba(227,6,19,0.38),inset_0_2px_4px_rgba(255,255,255,0.4)] bg-gradient-to-b from-[#ff2424] via-[#e30613] to-[#a80009] active:scale-95 active:shadow-sm transition-all duration-200"
					>
						¡GENIAL!
					</button>

					{/* Microcopy final */ }
					<p className="mt-3 text-xs text-slate-500 text-center px-2">
						Muestra este código al personal para reclamar tu premio.
					</p>
				</div>
			</div>
		</div>
	);
};