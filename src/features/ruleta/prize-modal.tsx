import React, { useEffect, useRef } from "react";
import Confetti from "react-confetti";

interface PrizeModalProps {
	prize: string;
	prizeColor: string | null;
	onClose: () => void;
}

export const PrizeModal: React.FC<PrizeModalProps> = ({
	prize,
	prizeColor,
	onClose,
}) => {
	const btnRef = useRef<HTMLButtonElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		btnRef.current?.focus();
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		const handleClick = (e: MouseEvent) => {
			if (e.target === overlayRef.current) onClose();
		};
		window.addEventListener("keydown", handleEsc);
		overlayRef.current?.addEventListener("click", handleClick);
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", handleEsc);
			overlayRef.current?.removeEventListener("click", handleClick);
			document.body.style.overflow = "";
		};
	}, [onClose]);

	const confettiColors = ["#005f63", "#008087", "#E52421", "#ffffff", "#4A7C3F"];

	return (
		<div
			ref={overlayRef}
			className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#eef2f5]"
			role="dialog"
			aria-modal="true"
			aria-label="Premio ganado"
		>
			{/* Confeti */ }
			<Confetti
				width={window.innerWidth}
				height={window.innerHeight}
				recycle={false}
				numberOfPieces={300}
				colors={confettiColors}
				className="pointer-events-none absolute inset-0"
			/>

			<div className="w-full max-w-sm text-center animate-fade-in-down">
				{/* ¡FELICIDADES! - letras enormes sin contenedor */ }
				<h2 className="text-[clamp(48px,14vw,96px)] font-black italic text-[#0a454d] leading-tight tracking-tight mb-4">
					¡FELICIDADES!
				</h2>

				{/* Nombre del premio con su color real */ }
				<p
					className="text-[clamp(32px,10vw,64px)] font-black leading-tight tracking-tight mb-8"
					style={{ color: prizeColor ?? "#005f63" }}
				>
					{prize}
				</p>

				{/* Botón cerrar simple */ }
				<button
					ref={btnRef}
					type="button"
					onClick={onClose}
					className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-black text-white tracking-wider uppercase text-base bg-[#005f63] hover:bg-[#00767c] active:scale-95 active:bg-[#00474b] transition-colors duration-200 shadow-[0_4px_14px_rgba(0,95,99,0.35)]"
				>
					Cerrar
				</button>
			</div>
		</div>
	);
};