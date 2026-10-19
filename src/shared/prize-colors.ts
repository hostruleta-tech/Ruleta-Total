/**
 * Paleta de verdes de marca para premios nuevos. Se rotan entre sí para que
 * cada premio tenga por defecto un verde distinto (el usuario puede cambiarlo).
 * Todos los tonos son lo bastante profundos como para usar texto blanco.
 */
export const GREEN_PALETTE = [
	"#0A4E58",
	"#00767C",
	"#008087",
	"#1C7C54",
	"#2E8B57",
	"#4A7C3F",
];

/** Siguiente verde de la paleta según la cantidad de premios existentes. */
export const nextGreen = (count: number): string =>
	GREEN_PALETTE[count % GREEN_PALETTE.length];

/** Normaliza un color hex (#abc o #aabbcc) a minúsculas de 6 dígitos. */
const normalizeHex = (color: string): string | null => {
	const hex = color.trim().replace("#", "");
	const expanded =
		hex.length === 3
			? hex
					.split("")
					.map((char) => char + char)
					.join("")
			: hex;
	return /^[0-9a-fA-F]{6}$/.test(expanded) ? expanded.toLowerCase() : null;
};

/** Indica si el fondo pertenece a la paleta de verdes por defecto. */
export const isDefaultGreen = (color: string): boolean => {
	const normalized = normalizeHex(color);
	if (!normalized) return false;
	return GREEN_PALETTE.some((green) => normalizeHex(green) === normalized);
};
