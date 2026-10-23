/**
 * Utilidades para convertir la imagen elegida en el panel en un data URL
 * liviano que quepa en la base de datos y viaje rápido al móvil.
 */

/** Lado máximo en píxeles de la imagen guardada. */
const MAX_SIDE = 512;
/** Calidad inicial para formatos con pérdida (WebP). */
const INITIAL_QUALITY = 0.85;
/** Límite aproximado del data URL (aprox. 240 KB de imagen). */
const MAX_DATA_URL_LENGTH = 340_000;

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Formatos aceptados por el selector de archivos del panel. */
export const PRIZE_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

const loadImageElement = (file: File): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const objectUrl = URL.createObjectURL(file);
		const image = new Image();

		image.onload = () => {
			URL.revokeObjectURL(objectUrl);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(objectUrl);
			reject(new Error("No se pudo leer la imagen."));
		};

		image.src = objectUrl;
	});

const renderToDataUrl = (
	image: HTMLImageElement,
	maxSide: number,
	quality: number,
): string => {
	const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
	const scale = largestSide > maxSide ? maxSide / largestSide : 1;
	const width = Math.max(1, Math.round(image.naturalWidth * scale));
	const height = Math.max(1, Math.round(image.naturalHeight * scale));

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;

	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("El navegador no pudo procesar la imagen.");
	}

	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = "high";
	context.drawImage(image, 0, 0, width, height);

	// WebP conserva la transparencia y pesa menos. Si el navegador no lo
	// soporta, `toDataURL` devuelve PNG y lo usamos como respaldo.
	const webp = canvas.toDataURL("image/webp", quality);
	if (webp.startsWith("data:image/webp")) return webp;

	return canvas.toDataURL("image/png");
};

/**
 * Convierte un archivo en un data URL redimensionado y comprimido.
 * Reduce progresivamente el tamaño hasta cumplir con el límite.
 */
export async function fileToPrizeImage(file: File): Promise<string> {
	if (!ALLOWED_TYPES.has(file.type)) {
		throw new Error("Usa una imagen PNG, JPG o WebP.");
	}
	if (file.size > 12 * 1024 * 1024) {
		throw new Error("La imagen no puede superar los 12 MB.");
	}

	const image = await loadImageElement(file);

	let maxSide = MAX_SIDE;
	let quality = INITIAL_QUALITY;
	let dataUrl = renderToDataUrl(image, maxSide, quality);

	while (dataUrl.length > MAX_DATA_URL_LENGTH && maxSide > 120) {
		maxSide = Math.round(maxSide * 0.8);
		dataUrl = renderToDataUrl(image, maxSide, quality);
	}

	while (dataUrl.length > MAX_DATA_URL_LENGTH && quality > 0.45) {
		quality -= 0.1;
		dataUrl = renderToDataUrl(image, maxSide, quality);
	}

	if (dataUrl.length > MAX_DATA_URL_LENGTH) {
		throw new Error("No se pudo comprimir la imagen lo suficiente.");
	}

	return dataUrl;
}
