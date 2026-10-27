import { Router, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import type { DbClient } from "../database";
import {
	verifySession,
	requireOperator,
	setSessionCookie,
	clearSessionCookie,
	hasSessionConfig,
} from "./session";

/**
 * Crea el router de autenticación del operador.
 * Endpoints:
 * - POST /api/auth/login  -> valida contraseña, setea cookie
 * - GET  /api/auth/me     -> devuelve { authenticated: boolean }
 * - POST /api/auth/logout -> borra cookie
 */
export function createAuthRouter(getClient: () => Promise<DbClient>): Router {
	const router = Router();

	// Rate limit en memoria (por IP) - se limpia oportunamente
	// Para producción serverless, esto debería ir en base de datos (ver migración 004).
	// Aquí implementamos una versión simple en memoria con limpieza periódica.
	const failedAttempts = new Map<string, { count: number; resetAt: number }>();

	function getClientIp(req: Request): string {
		const forwarded = req.get("x-forwarded-for");
		if (forwarded) return forwarded.split(",")[0].trim();
		return req.socket?.remoteAddress ?? "unknown";
	}

	function hashIp(ip: string): string {
		return createHash("sha256").update(ip).digest("hex");
	}

	function checkRateLimit(ipHash: string): { allowed: boolean; retryAfter?: number } {
		const now = Date.now();
		const record = failedAttempts.get(ipHash);
		if (!record || record.resetAt <= now) {
			return { allowed: true };
		}
		if (record.count >= 10) {
			const retryAfter = Math.ceil((record.resetAt - now) / 1000);
			return { allowed: false, retryAfter };
		}
		return { allowed: true };
	}

	function recordFailure(ipHash: string): void {
		const now = Date.now();
		const record = failedAttempts.get(ipHash);
		if (!record || record.resetAt <= now) {
			failedAttempts.set(ipHash, { count: 1, resetAt: now + 15 * 60 * 1000 });
		} else {
			record.count += 1;
		}
	}

	function clearFailure(ipHash: string): void {
		failedAttempts.delete(ipHash);
	}

	// Limpieza periódica de entradas expiradas
	setInterval(() => {
		const now = Date.now();
		for (const [key, value] of failedAttempts.entries()) {
			if (value.resetAt <= now) failedAttempts.delete(key);
		}
	}, 5 * 60 * 1000).unref();

	// No-cache en todos los endpoints de auth
	router.use((_req, res, next) => {
		res.setHeader("Cache-Control", "no-store");
		next();
	});

	/**
	 * POST /api/auth/login
	 * Body: { password: string }
	 * Respuesta: 200 + cookie / 401 / 429 / 503
	 */
	router.post("/login", async (req: Request, res: Response) => {
		try {
			if (!hasSessionConfig()) {
				return res.status(503).json({
					message: "Configuración de acceso incompleta.",
				});
			}

			const ipHash = hashIp(getClientIp(req));
			const rateLimit = checkRateLimit(ipHash);
			if (!rateLimit.allowed) {
				return res
					.status(429)
					.set("Retry-After", String(rateLimit.retryAfter ?? 900))
					.json({
						message: "Demasiados intentos. Intenta de nuevo más tarde.",
					});
			}

			const body = (req.body ?? {}) as { password?: unknown };
			const provided = typeof body.password === "string" ? body.password : "";
			const expected = process.env.OPERATOR_PASSWORD ?? "";

			if (!expected) {
				return res.status(503).json({
					message: "Configuración de acceso incompleta.",
				});
			}

			// Comparación en tiempo constante
			const digestProvided = createHash("sha256").update(provided, "utf8").digest();
			const digestExpected = createHash("sha256").update(expected, "utf8").digest();
			const ok = timingSafeEqual(digestProvided, digestExpected);

			if (!ok) {
				recordFailure(ipHash);
				return res.status(401).json({ message: "Contraseña incorrecta." });
			}

			// Éxito: limpiar contador y setear cookie
			clearFailure(ipHash);
			setSessionCookie(res);
			return res.json({ ok: true });
		} catch (error) {
			console.error("[auth] login error:", error);
			return res.status(500).json({ message: "Error interno al iniciar sesión." });
		}
	});

	/**
	 * GET /api/auth/me
	 * Verifica si hay sesión válida (cookie o cabecera).
	 * Respuesta: { authenticated: boolean }
	 */
	router.get("/me", (req: Request, res: Response) => {
		const authenticated = verifySession(req) || requireOperatorCheck(req);
		res.json({ authenticated });
	});

	/**
	 * POST /api/auth/logout
	 * Borra la cookie de sesión.
	 */
	router.post("/logout", (_req: Request, res: Response) => {
		clearSessionCookie(res);
		res.status(204).send();
	});

	return router;
}

/**
 * Verificación ligera usando solo la cabecera X-Operator-Password (para /me).
 * No lanza respuestas, solo devuelve boolean.
 */
function requireOperatorCheck(req: Request): boolean {
	const provided = req.get("x-operator-password") ?? undefined;
	const expected = process.env.OPERATOR_PASSWORD;
	if (!expected) return false;
	const digestProvided = createHash("sha256").update(provided ?? "", "utf8").digest();
	const digestExpected = createHash("sha256").update(expected, "utf8").digest();
	return timingSafeEqual(digestProvided, digestExpected);
}