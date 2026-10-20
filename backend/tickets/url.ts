import { TicketConfigError } from "./errors";

const DEV_FALLBACK = "http://localhost:5177";

/**
 * URL base pública de la aplicación.
 *
 * Prioridad:
 * 1. `PUBLIC_APP_URL`
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` (producción en Vercel)
 * 3. `http://localhost:5177` solo fuera de producción
 */
export function getPublicAppUrl(): string {
	const configured = process.env.PUBLIC_APP_URL?.trim();
	const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
	const fallback =
		process.env.NODE_ENV === "production" ? undefined : DEV_FALLBACK;
	const candidate =
		configured || (vercelHost ? `https://${vercelHost}` : undefined) || fallback;

	if (!candidate) {
		throw new TicketConfigError(
			"Falta configurar PUBLIC_APP_URL para generar los QR.",
		);
	}

	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		throw new TicketConfigError("PUBLIC_APP_URL no es una URL válida.");
	}

	if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
		throw new TicketConfigError(
			"PUBLIC_APP_URL debe usar HTTPS en producción.",
		);
	}

	// La URL del ticket se construye desde la base, sin query ni hash previos.
	url.search = "";
	url.hash = "";
	return url.toString();
}

/**
 * URL de participación que se codifica en el QR.
 *
 * El token va en el fragmento (`#`), no en el query string: el navegador no
 * lo envía al servidor y no se filtra por `Referer`.
 */
export function buildParticipationUrl(
	token: string,
	baseUrl: string = getPublicAppUrl(),
): string {
	const url = new URL(baseUrl);
	url.searchParams.set("view", "play");
	url.hash = new URLSearchParams({ t: token }).toString();
	return url.toString();
}
