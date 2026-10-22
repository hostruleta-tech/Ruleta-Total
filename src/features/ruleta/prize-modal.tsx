import React, { useEffect, useRef } from "react";
import Confetti from "react-confetti";

const MODAL_BG = "#eef2f5";

/** Luminancia relativa sRGB */
const lum = (hex: string): number => {
  const c = hex.replace("#", "");
  const [r, g, b] = c.length === 3
    ? c.split("").map((x) => Number.parseInt(x + x, 16))
    : [Number.parseInt(c.slice(0, 2), 16), Number.parseInt(c.slice(2, 4), 16), Number.parseInt(c.slice(4, 6), 16)];
  const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};

const bgLum = lum(MODAL_BG);

/** Devuelve un color legible contra el fondo del modal */
const readableColor = (color: string | null): string => {
  if (!color) return "#005f63";
  try {
    const cLum = lum(color);
    const ratio = (Math.max(bgLum, cLum) + 0.05) / (Math.min(bgLum, cLum) + 0.05);
    return ratio >= 3 ? color : "#005f63";
  } catch {
    return "#005f63";
  }
};

interface PrizeModalProps {
	prize: string;
	prizeColor: string | null;
	prizeImage?: string | null;
	onClose: () => void;
	showName?: boolean;
}

export const PrizeModal: React.FC<PrizeModalProps> = ({
	prize,
	prizeColor,
	prizeImage,
	onClose,
	showName = true,
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

			<div className="w-full max-w-2xl text-center animate-fade-in-down mx-auto px-4">
				{/* Imagen del premio ganador (si la tiene) */}
				{prizeImage && (
					<img
						src={prizeImage}
						alt={prize}
						draggable={false}
						className={`mx-auto mb-4 h-auto w-auto object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-all duration-300 ${
							showName
								? "max-h-[26vh] max-w-[min(70vw,220px)]"
								: "max-h-[45vh] max-w-[min(85vw,320px)]"
						}`}
					/>
				)}

				{/* ¡FELICIDADES! - letras enormes sin contenedor, centradas en móvil */ }
				<h2 className="text-[clamp(30px,9.5vw,72px)] font-black italic text-[#0a454d] leading-tight tracking-tight mb-4 mx-auto w-full text-balance">
					¡FELICIDADES!
				</h2>

				{/* Nombre del premio con su color real */ }
				{showName && (
					<p
						className="text-[clamp(28px,9vw,56px)] font-black leading-tight tracking-tight mb-8 mx-auto overflow-hidden break-words"
						style={{ color: readableColor(prizeColor) }}
					>
						{prize}
					</p>
				)}

				{/* Fallback: si no hay imagen y no se muestra nombre, mostrar el nombre */ }
				{!showName && !prizeImage && (
					<p
						className="text-[clamp(28px,9vw,56px)] font-black leading-tight tracking-tight mb-8 mx-auto overflow-hidden break-words"
						style={{ color: readableColor(prizeColor) }}
					>
						{prize}
					</p>
				)}

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