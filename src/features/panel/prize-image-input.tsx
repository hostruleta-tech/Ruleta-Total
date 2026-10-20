import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState } from "react";

import { PRIZE_IMAGE_ACCEPT, fileToPrizeImage } from "@/shared/image-utils";
import { cn } from "@/shared/lib/utils";
import { useToast } from "./panel-toast";

interface PrizeImageInputProps {
	/** Data URL de la imagen actual (null si el premio no tiene). */
	value?: string | null;
	onChange: (image: string | null) => void;
	/** Descripción usada en el aria-label y los tooltips. */
	label: string;
	className?: string;
}

/**
 * Selector de imagen de un premio: miniatura, botón para subir/cambiar y
 * botón para quitarla. La imagen se comprime en el navegador antes de
 * entregarla al formulario.
 */
export const PrizeImageInput: React.FC<PrizeImageInputProps> = ({
	value,
	onChange,
	label,
	className,
}) => {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const toast = useToast();
	const hasImage = Boolean(value);

	const handleFile = async (file: File | undefined) => {
		if (!file) return;

		setIsProcessing(true);
		try {
			const dataUrl = await fileToPrizeImage(file);
			onChange(dataUrl);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "No se pudo cargar la imagen.",
			);
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<div className={cn("relative h-9 w-9", className)}>
			<input
				ref={inputRef}
				type="file"
				accept={PRIZE_IMAGE_ACCEPT}
				className="sr-only"
				aria-label={`Imagen: ${label}`}
				onChange={(event) => {
					const file = event.target.files?.[0];
					// Permite volver a elegir el mismo archivo más adelante.
					event.target.value = "";
					void handleFile(file);
				}}
			/>

			<button
				type="button"
				onClick={() => inputRef.current?.click()}
				disabled={isProcessing}
				title={hasImage ? "Cambiar imagen" : "Agregar imagen"}
				aria-label={hasImage ? `Cambiar imagen: ${label}` : `Agregar imagen: ${label}`}
				className={cn(
					"flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border bg-white transition",
					"border-slate-300 hover:border-[#005f63] hover:bg-[#005f63]/5",
					"focus-visible:border-[#005f63] focus-visible:ring-2 focus-visible:ring-[#005f63]/25 focus-visible:outline-none",
					"disabled:cursor-wait disabled:opacity-70",
				)}
			>
				{isProcessing ? (
					<Loader2 className="h-4 w-4 animate-spin text-[#005f63]" />
				) : hasImage ? (
					<img
						src={value ?? ""}
						alt=""
						className="h-full w-full object-contain p-0.5"
					/>
				) : (
					<ImagePlus className="h-4 w-4 text-slate-400" />
				)}
			</button>

			{hasImage && !isProcessing && (
				<button
					type="button"
					onClick={() => onChange(null)}
					title="Quitar imagen"
					aria-label={`Quitar imagen: ${label}`}
					className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-[#E52421] text-white shadow transition hover:bg-[#c81d1a]"
				>
					<X className="h-3 w-3" />
				</button>
			)}
		</div>
	);
};
