import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Rate limiter simple en memoria para proteger endpoints de escritura.
 * En entorno serverless (Vercel) el estado se pierde en cold-starts,
 * pero es suficiente para frenar bucles locales/scripts agresivos.
 * Para producción real se recomienda Redis/Upstash.
 */

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

function getClientId(req: Request): string {
	// Preferir cookie de sesión, luego IP
	const cookie = req.headers.cookie;
	if (cookie) {
		const match = cookie.match(/ruleta_operator=([^;]+)/);
		if (match) return `session:${match[1].slice(0, 16)}`;
	}
	// Fallback a IP (detrás de proxy Vercel)
	const ip = req.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
	return `ip:${ip}`;
}

interface RateLimitOptions {
	windowMs: number;        // Ventana de tiempo
	maxRequests: number;     // Máximo peticiones por ventana
	keyPrefix?: string;      // Prefijo para la clave
	message?: string;
}

/**
 * Middleware de rate limiting por cliente (sesión/IP).
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
	const { windowMs, maxRequests, keyPrefix = "rl", message = "Demasiadas peticiones. Intenta más tarde." } = options;

	// Desactivar en tests para no interferir
	if (process.env.NODE_ENV === "test") {
		return (req, res, next) => next();
	}

	return (req, res, next) => {
		const clientId = getClientId(req);
		const key = `${keyPrefix}:${clientId}`;
		const now = Date.now();

		const entry = store.get(key);

		if (!entry || now > entry.resetAt) {
			// Ventana nueva o expirada
			store.set(key, { count: 1, resetAt: now + windowMs });
			setRateLimitHeaders(res, maxRequests, maxRequests - 1, Math.ceil((now + windowMs - now) / 1000));
			return next();
		}

		if (entry.count >= maxRequests) {
			const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
			setRateLimitHeaders(res, maxRequests, 0, retryAfter);
			return res.status(429).json({
				message,
				retryAfter,
			});
		}

		entry.count++;
		setRateLimitHeaders(res, maxRequests, maxRequests - entry.count, Math.ceil((entry.resetAt - now) / 1000));
		next();
	};
}

function setRateLimitHeaders(res: Response, limit: number, remaining: number, resetSeconds: number): void {
	res.setHeader("X-RateLimit-Limit", limit);
	res.setHeader("X-RateLimit-Remaining", Math.max(0, remaining));
	res.setHeader("X-RateLimit-Reset", Math.floor(Date.now() / 1000) + resetSeconds);
}

/**
 * Middleware de idempotencia: evita procesar la misma petición dos veces.
 * El cliente debe enviar cabecera: Idempotency-Key: <clave-única>
 * Guarda la respuesta (status + body) por 24h.
 */
const idempotencyStore = new Map<string, { status: number; body: unknown; expiresAt: number }>();

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

export function idempotency(): RequestHandler {
	return (req, res, next) => {
		const key = req.get("idempotency-key")?.trim();
		if (!key) return next(); // Sin clave = sin idempotencia

		const now = Date.now();
		const cached = idempotencyStore.get(key);

		// Limpiar entradas expiradas ocasionalmente
		if (idempotencyStore.size > 10000) {
			for (const [k, v] of idempotencyStore) {
				if (v.expiresAt < now) idempotencyStore.delete(k);
			}
		}

		if (cached && cached.expiresAt > now) {
			// Devolver respuesta guardada
			res.setHeader("Idempotency-Replayed", "true");
			return res.status(cached.status).json(cached.body);
		}

		// Capturar la respuesta original
		const originalJson = res.json.bind(res);
		res.json = ((body: unknown) => {
			if (res.statusCode >= 200 && res.statusCode < 300) {
				idempotencyStore.set(key, {
					status: res.statusCode,
					body,
					expiresAt: now + IDEMPOTENCY_TTL_MS,
				});
			}
			return originalJson(body);
		}) as typeof res.json;

		next();
	};
}