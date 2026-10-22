import React, { useEffect, useRef } from "react";

interface SpinAgainNoticeProps {
	prize: string;
	onRetry: () => void;
	onClose: () => void;
}

/**
 * Aviso ligero para la casilla "Inténtalo de nuevo".
 * Es intencionalmente más simple que el modal de premio: informa que el
 * ticket no se consumió y permite volver a girar al instante.
 */
export const SpinAgainNotice: React.FC<SpinAgainNoticeProps> = ({
	prize,
	onRetry,
	onClose,
}) => {
	const retryRef = useRef<HTMLButtonElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		retryRef.current?.focus();
		const handleEsc = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		const handleClick = (event: MouseEvent) => {
			if (event.target === overlayRef.current) onClose();
		};
		window.addEventListener("keydown", handleEsc);
		overlayRef.current?.addEventListener("click", handleClick);
		return () => {
			window.removeEventListener("keydown", handleEsc);
			overlayRef.current?.removeEventListener("click", handleClick);
		};
	}, [onClose]);

	return (
		<div
			ref={overlayRef}
			className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
			role="alertdialog"
			aria-modal="true"
			aria-label="Inténtalo de nuevo"
		>
			<div className="w-full max-w-[340px] rounded-2xl bg-white px-5 py-6 text-center shadow-[0_18px_50px_rgba(0,0,0,0.3)] animate-fade-in-down">
				{/* Icono circular de reintento */}
				<div
					className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full"
					style={{ backgroundColor: "#e8f4f5" }}
				>
					<svg
						width="30"
						height="30"
						viewBox="0 0 24 24"
						fill="none"
						stroke="#007782"
						strokeWidth="2.4"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M21.5 2v6h-6" />
						<path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
					</svg>
				</div>

				<h2
					className="text-[24px] font-black italic leading-tight"
					style={{ color: "#0a454d" }}
				>
					¡Inténtalo de nuevo!
				</h2>
				<p
					className="mt-1.5 text-[13px] font-semibold leading-snug"
					style={{ color: "#5b7a7f" }}
				>
					{prize ? `Cayó "${prize}".` : "Esta casilla no tiene premio."} Tu
					ticket no se consumió, puedes girar otra vez.
				</p>

				<div className="mt-5 flex flex-col gap-2">
					<button
						ref={retryRef}
						type="button"
						onClick={onRetry}
						className="inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-black uppercase tracking-wider text-white transition-transform duration-150 active:scale-95"
						style={{
							background:
								"linear-gradient(180deg, #ff2a2a 0%, #da0d15 50%, #b30007 100%)",
							boxShadow: "0 6px 16px rgba(227, 24, 33, 0.35)",
						}}
					>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="3"
							strokeLinecap="round"
							strokeLinejoin="round"
							aria-hidden="true"
						>
							<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
						</svg>
						Girar de nuevo
					</button>
					<button
						type="button"
						onClick={onClose}
						className="w-full rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wide transition-colors"
						style={{ color: "#5b7a7f" }}
					>
						Cerrar
					</button>
				</div>
			</div>
		</div>
	);
};
