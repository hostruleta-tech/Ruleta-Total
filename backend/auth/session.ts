import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Configuración de la sesión del operador.
 */
const SESSION_COOKIE_NAME = "ruleta_operator";
const SESSION_TTL_HOURS = Math.max(1, Math.min(72, Number(process.env.OPERATOR_SESSION_HOURS ?? 8)));
const SESSION_TTL_SECONDS = SESSION_TTL_HOURS * 60 * 60;

/**
 * Deriva el secreto de firma:
 * - Usa SESSION_SECRET si existe.
 * - Si no, deriva de TICKET_ENCRYPTION_KEY (compatibilidad con despliegues existentes).
 * - Si no hay ninguno, el login responderá 503.
 */
function getSessionSecret(): Buffer | null {
	const explicit = process.env.SESSION_SECRET;
	if (explicit) {
		return Buffer.from(explicit, "utf8");
	}
	const derived = process.env.TICKET_ENCRYPTION_KEY;
	if (derived) {
		// Derivación determinista para no romper sesiones si no se define SESSION_SECRET
		return createHash("sha256").update(derived + ":operator-session:v1").digest();
	}
	return null;
}

/**
 * Crea el payload de la sesión (solo expiración por ahora).
 */
function createPayload(exp: number): string {
	const obj = { exp };
	return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

/**
 * Firma un payload con HMAC-SHA256.
 */
function signPayload(payload: string, secret: Buffer): string {
	const hmac = createHash("sha256").update(payload).update("|").update(secret.toString("base64")).digest();
	return Buffer.from(hmac).toString("base64url");
}

/**
 * Verifica la firma y la expiración.
 */
function verifyCookie(value: string, secret: Buffer): { valid: boolean; exp?: number } {
	const parts = value.split(".");
	if (parts.length !== 2) return { valid: false };
	const [payloadB64, sigB64] = parts;
	const expectedSig = signPayload(payloadB64, secret);
	const sigBuf = Buffer.from(sigB64, "base64url");
	const expectedBuf = Buffer.from(expectedSig, "base64url");
	if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
		return { valid: false };
	}
	try {
		const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
		if (typeof payload.exp !== "number") return { valid: false };
		if (payload.exp < Math.floor(Date.now() / 1000)) return { valid: false };
		return { valid: true, exp: payload.exp };
	} catch {
		return { valid: false };
	}
}

/**
 * Genera el valor de la cookie firmada.
 */
export function createSessionCookie(): string {
	const secret = getSessionSecret();
	if (!secret) throw new Error("Configuración de sesión incompleta (SESSION_SECRET o TICKET_ENCRYPTION_KEY requeridos).");
	const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
	const payload = createPayload(exp);
	const sig = signPayload(payload, secret);
	return `${payload}.${sig}`;
}

/**
 * Parsea la cookie desde el header `Cookie`.
 */
export function parseSessionCookie(req: Request): string | null {
	const cookieHeader = req.headers.cookie;
	if (!cookieHeader) return null;
	const prefix = `${SESSION_COOKIE_NAME}=`;
	const parts = cookieHeader.split(";");
	for (const part of parts) {
		const trimmed = part.trim();
		if (trimmed.startsWith(prefix)) {
			return trimmed.slice(prefix.length);
		}
	}
	return null;
}

/**
 * Verifica la cookie de sesión del operador.
 */
export function verifySession(req: Request): boolean {
	const secret = getSessionSecret();
	if (!secret) return false;
	const cookieValue = parseSessionCookie(req);
	if (!cookieValue) return false;
	return verifyCookie(cookieValue, secret).valid;
}

/**
 * Middleware que exige autenticación de operador.
 * Acepta:
 * 1. Cookie de sesión válida (nueva forma)
 * 2. Cabecera X-Operator-Password válida (compatibilidad con scripts/tests)
 */
export const requireOperator: RequestHandler = (req, res, next) => {
	// 1. Intentar cookie de sesión
	if (verifySession(req)) {
		return next();
	}

	// 2. Fallback: cabecera de operador (compatibilidad)
	const provided = req.get("x-operator-password") ?? undefined;
	const expected = process.env.OPERATOR_PASSWORD;
	if (!expected) {
		return res.status(503).json({
			message: "Falta configurar OPERATOR_PASSWORD en el servidor para proteger esta acción.",
		});
	}

	// Comparación en tiempo constante (hash SHA-256 + timingSafeEqual)
	const digestProvided = createHash("sha256").update(provided ?? "", "utf8").digest();
	const digestExpected = createHash("sha256").update(expected, "utf8").digest();
	if (timingSafeEqual(digestProvided, digestExpected)) {
		return next();
	}

	// 3. Sin credenciales válidas
	return res.status(401).json({
		message: "Contraseña de operador incorrecta.",
	});
};

/**
 * Genera las opciones de la cookie para Set-Cookie.
 */
function getCookieOptions(isProduction: boolean): string {
	const flags = [
		`HttpOnly`,
		`Path=/`,
		`Max-Age=${SESSION_TTL_SECONDS}`,
		`SameSite=Strict`,
	];
	if (isProduction) flags.push(`Secure`);
	return flags.join("; ");
}

/**
 * Establece la cookie de sesión en la respuesta.
 */
export function setSessionCookie(res: Response): void {
	const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
	const cookieValue = createSessionCookie();
	res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=${cookieValue}; ${getCookieOptions(isProduction)}`);
}

/**
 * Borra la cookie de sesión (logout).
 */
export function clearSessionCookie(res: Response): void {
	const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
	const flags = [
		`HttpOnly`,
		`Path=/`,
		`Max-Age=0`,
		`SameSite=Strict`,
	];
	if (isProduction) flags.push(`Secure`);
	res.setHeader("Set-Cookie", `${SESSION_COOKIE_NAME}=; ${flags.join("; ")}`);
}

/**
 * Verifica si la configuración de sesión está completa.
 */
export function hasSessionConfig(): boolean {
	return getSessionSecret() !== null;
}