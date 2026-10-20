/**
 * Caché de imágenes para el canvas de la ruleta.
 *
 * El dibujo ocurre en cada frame, así que `getOrRequestImage` nunca debe
 * bloquear: devuelve la imagen si ya está lista y, si no, lanza la descarga
 * una sola vez. Cuando termina, la ruleta se vuelve a dibujar (el hook
 * escucha con `preloadImages`).
 */

const imageCache = new Map<string, HTMLImageElement>();
const pendingLoads = new Map<string, Promise<HTMLImageElement>>();
const failedSources = new Set<string>();

const isReady = (image: HTMLImageElement | undefined): image is HTMLImageElement =>
	Boolean(image?.complete && image.naturalWidth > 0);

/** Imagen ya cargada, o null si todavía no está disponible. */
export const getCachedImage = (
	source?: string | null,
): HTMLImageElement | null => {
	if (!source) return null;
	const image = imageCache.get(source);
	return isReady(image) ? image : null;
};

/** Carga (o reutiliza) una imagen y resuelve cuando está lista para dibujar. */
export const preloadImage = (source: string): Promise<HTMLImageElement> => {
	const cached = getCachedImage(source);
	if (cached) return Promise.resolve(cached);

	const pending = pendingLoads.get(source);
	if (pending) return pending;

	const promise = new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.decoding = "async";
		image.onload = () => {
			pendingLoads.delete(source);
			imageCache.set(source, image);
			resolve(image);
		};
		image.onerror = () => {
			pendingLoads.delete(source);
			failedSources.add(source);
			reject(new Error(`No se pudo cargar la imagen: ${source}`));
		};
		image.src = source;
	});

	pendingLoads.set(source, promise);
	return promise;
};

/**
 * Versión para usar dentro del dibujo: devuelve la imagen lista o null,
 * solicitándola en segundo plano si aún no se ha pedido.
 */
export const getOrRequestImage = (
	source?: string | null,
): HTMLImageElement | null => {
	if (!source) return null;

	const ready = getCachedImage(source);
	if (ready) return ready;
	if (failedSources.has(source) || pendingLoads.has(source)) return null;

	void preloadImage(source).catch(() => {
		// El premio simplemente se dibuja sin imagen.
	});

	return null;
};

/** Precarga todas las imágenes y resuelve cuando terminan (con o sin éxito). */
export const preloadImages = async (
	sources: Array<string | null | undefined>,
): Promise<void> => {
	const unique = [
		...new Set(sources.filter((source): source is string => Boolean(source))),
	];
	await Promise.allSettled(unique.map((source) => preloadImage(source)));
};
