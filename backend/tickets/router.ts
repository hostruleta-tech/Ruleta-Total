import { Router } from "express";
import type { Client } from "@libsql/client";
import { requireOperator } from "../auth/session";
import {
	TicketConfigError,
	TicketNotFoundError,
	TicketValidationError,
} from "./errors";
import { QR_PRINT_WIDTH, QR_PREVIEW_WIDTH, renderQrPngDataUrl } from "./qr";
import {
	getBatchById,
	getTicketById,
	getTicketSecretById,
	listBatches,
	listTickets,
	mapTicket,
	validateTicket,
	reserveTicket,
	voidTicket,
	type ReserveResult,
	type ValidationResult,
	type VoidResult,
} from "./repository";
import {
	buildBatchQrZip,
	createTickets,
	getBatchDetail,
	getBatchQrDataUrls,
	renderTicketQr,
} from "./service";
import { decryptTicketToken } from "./crypto";
import { buildParticipationUrl } from "./url";
import {
	hashTicketToken,
} from "./token";
import {
	isTicketStatus,
	withEffectiveStatus,
	effectiveStatus,
	type TicketStatus,
} from "./types";

interface ListQuery {
	status?: TicketStatus;
	batchId?: string;
	date?: string;
	limit: number;
	offset: number;
}

function intParam(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) return fallback;
	return Math.min(Math.max(parsed, min), max);
}

function parseListQuery(
	query: Record<string, unknown>,
): ListQuery | { error: string } {
	const rawStatus = query.status;
	let status: TicketStatus | undefined;

	if (rawStatus != null && rawStatus !== "") {
		if (!isTicketStatus(rawStatus)) {
			return { error: "El estado indicado no es válido." };
		}
		status = rawStatus;
	}

	const rawBatchId = query.batchId;
	const batchId =
		typeof rawBatchId === "string" && rawBatchId.trim() !== ""
			? rawBatchId.trim()
			: undefined;

	const rawDate = query.date;
	const date =
		typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
			? rawDate
			: undefined;

	return {
		status,
		batchId,
		date,
		limit: intParam(query.limit, 50, 1, 200),
		offset: intParam(query.offset, 0, 0, 1_000_000),
	};
}

function handleError(
	res: import("express").Response,
	context: string,
	error: unknown,
) {
	if (error instanceof TicketValidationError) {
		return res.status(400).json({ message: error.message });
	}
	if (error instanceof TicketConfigError) {
		return res.status(503).json({ message: error.message });
	}
	if (error instanceof TicketNotFoundError) {
		return res.status(404).json({ message: error.message });
	}

	// Nunca registrar tokens, contraseñas ni payloads: solo el tipo de error.
	console.error(
		`[tickets] ${context}`,
		error instanceof Error ? error.name : "unknown",
	);
	return res.status(500).json({
		message: "No se pudo completar la operación con los tickets.",
	});
}

/**
 * Rutas de tickets (fase 2).
 *
 * Rutas públicas (sin contraseña de operador):
 *   POST /api/tickets/validate   - Valida token, devuelve estado y si puede girar
 *   POST /api/tickets/reserve    - Reserva ticket (available -> reserved, 5 min)
 *
 * El canje no es público: solo ocurre dentro de POST /api/spin, donde el
 * servidor elige el premio. Así nadie puede fijar un premio arbitrario.
 *
 * Rutas de operador (requieren X-Operator-Password):
 *   POST   /api/tickets/batch    - Crea lote
 *   GET    /api/tickets           - Lista tickets
 *   POST   /api/tickets/lookup   - Obtiene tickets por IDs (máx 200)
 *   GET    /api/tickets/batches   - Lista lotes
 *   GET    /api/tickets/batches/:id - Detalle lote
 *   GET    /api/tickets/batches/:id/qr.zip - ZIP lote
 *   GET    /api/tickets/:id/qr    - PNG individual
 *   GET    /api/tickets/:id       - Metadatos ticket
 *   POST   /api/tickets/:id/void  - Anula ticket (void)
 */
export function createTicketsRouter(getClient: () => Promise<Client>): Router {
	const router = Router();

	// ==================== RUTAS PÚBLICAS (sin contraseña) ====================

	/**
	 * POST /validate
	 * Valida un token de ticket sin cambiar su estado.
	 * Body: { token: string }
	 * Respuesta: { valid: boolean, ticket: Ticket|null, reason?: string }
	 */
	router.post("/validate", async (req, res) => {
		try {
			const body = (req.body ?? {}) as { token?: unknown };
			const token = typeof body.token === "string" ? body.token.trim() : "";
			if (!token) {
				return res.status(400).json({ message: "Token requerido." });
			}

			const client = await getClient();
			const tokenHash = hashTicketToken(token);
			const result: ValidationResult = await validateTicket(client, tokenHash);

			// No exponer token_hash ni token_encrypted en la respuesta
			const { ticket, valid, reason } = result;
			return res.json({
				valid,
				ticket: ticket ? withEffectiveStatus(ticket) : null,
				reason,
			});
		} catch (error) {
			return handleError(res, "validate", error);
		}
	});

	/**
	 * POST /reserve
	 * Reserva un ticket válido (available -> reserved por 5 min).
	 * Body: { token: string }
	 * Respuesta: { success: boolean, ticket: Ticket|null, reason?: string }
	 */
	router.post("/reserve", async (req, res) => {
		try {
			const body = (req.body ?? {}) as { token?: unknown };
			const token = typeof body.token === "string" ? body.token.trim() : "";
			if (!token) {
				return res.status(400).json({ message: "Token requerido." });
			}

			const client = await getClient();
			const tokenHash = hashTicketToken(token);
			const result: ReserveResult = await reserveTicket(client, tokenHash, 5); // 5 min TTL

			return res.json({
				success: result.success,
				ticket: result.ticket ? withEffectiveStatus(result.ticket) : null,
				reason: result.reason,
			});
		} catch (error) {
			return handleError(res, "reserve", error);
		}
	});

	// ==================== RUTAS DE OPERADOR (requieren operador autenticado) ====================
	router.use(requireOperator);

	/** Crea un lote de tickets. */
	router.post("/batch", async (req, res) => {
		try {
			const body = (req.body ?? {}) as {
				quantity?: unknown;
				batchLabel?: unknown;
				expiresAt?: unknown;
			};
			const client = await getClient();
			const result = await createTickets(client, {
				quantity: body.quantity,
				batchLabel: body.batchLabel,
				expiresAt: body.expiresAt,
			});

			return res.status(201).json({
				batch: result.batch,
				tickets: result.tickets.map((item) => item.ticket),
				previews: result.previews,
			});
		} catch (error) {
			return handleError(res, "create-batch", error);
		}
	});

	/** Listado paginado de tickets, sin secretos. */
	router.get("/", async (req, res) => {
		try {
			const query = parseListQuery(req.query as Record<string, unknown>);
			if ("error" in query) {
				return res.status(400).json({ message: query.error });
			}

			const client = await getClient();
			const result = await listTickets(client, query);

			return res.json({
				tickets: result.tickets.map((ticket) => withEffectiveStatus(ticket)),
				total: result.total,
				limit: query.limit,
				offset: query.offset,
			});
		} catch (error) {
			return handleError(res, "list-tickets", error);
		}
	});

	/** Listado de lotes con contadores por estado. */
	router.get("/batches", async (req, res) => {
		try {
			const limit = intParam(req.query.limit, 20, 1, 100);
			const offset = intParam(req.query.offset, 0, 0, 1_000_000);
			const client = await getClient();
			const result = await listBatches(client, { limit, offset });

			return res.json({
				batches: result.batches,
				total: result.total,
				limit,
				offset,
			});
		} catch (error) {
			return handleError(res, "list-batches", error);
		}
	});

	/** ZIP con todos los QR del lote y un manifiesto sin secretos. */
	router.get("/batches/:id/qr.zip", async (req, res) => {
		try {
			const client = await getClient();
			const includeAll = req.query.include === "all";
			const result = await buildBatchQrZip(client, req.params.id, includeAll);

			res.setHeader("Content-Type", "application/zip");
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="tickets-${result.batch.id.slice(0, 8)}.zip"`,
			);
			res.setHeader("Cache-Control", "no-store");
			return res.send(result.zip);
		} catch (error) {
			return handleError(res, "batch-zip", error);
		}
	});

	/** Detalle del lote con las primeras vistas previas (solo activos). */
	router.get("/batches/:id", async (req, res) => {
		try {
			const client = await getClient();
			const result = await getBatchDetail(client, req.params.id, { onlyActivePreviews: true });
			return res.json(result);
		} catch (error) {
			return handleError(res, "batch-detail", error);
		}
	});

	/** Data URLs QR para TODOS los tickets del lote (panel operador). */
	router.get("/batches/:id/qrs", async (req, res) => {
		try {
			const client = await getClient();
			const qrDataUrls = await getBatchQrDataUrls(client, req.params.id);
			return res.json({ qrDataUrls });
		} catch (error) {
			return handleError(res, "batch-qrs", error);
		}
	});

	/** QR data URLs para MÚLTIPLES tickets por IDs (panel operador - bajo demanda).
	 *  Body: { ids: string[] }  (máx 60 IDs por petición)
	 *  Devuelve: { qrDataUrls: Record<string, string> }
	 */
	router.post("/qrs", async (req, res) => {
		try {
			const body = (req.body ?? {}) as { ids?: unknown };
			const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];

			if (ids.length === 0) {
				return res.json({ qrDataUrls: {} });
			}
			if (ids.length > 60) {
				return res.status(400).json({ message: "Máximo 60 tickets por petición." });
			}

			const client = await getClient();
			const qrDataUrls: Record<string, string> = {};

			// Generar en paralelo con límite de concurrencia (8 a la vez)
			const concurrency = 8;
			for (let i = 0; i < ids.length; i += concurrency) {
				const chunk = ids.slice(i, i + concurrency);
				await Promise.all(
					chunk.map(async (id) => {
						try {
							const secret = await getTicketSecretById(client, id);
							if (secret) {
								const token = decryptTicketToken(secret.tokenEncrypted);
								const url = buildParticipationUrl(token);
								qrDataUrls[id] = await renderQrPngDataUrl(url, QR_PREVIEW_WIDTH);
							}
						} catch {
							// Silencioso: si falla uno, devolvemos los que sí funcionaron
						}
					})
				);
			}

			return res.json({ qrDataUrls });
		} catch (error) {
			return handleError(res, "tickets-qrs-batch", error);
		}
	});

	/** PNG individual para descarga o reimpresión. Disponible para todos los estados. */
	router.get("/:id/qr", async (req, res) => {
		try {
			const client = await getClient();
			const ticket = await getTicketById(client, req.params.id);
			if (!ticket) {
				return res.status(404).json({ message: "El ticket no existe." });
			}
			// Permitir descarga de PNG para todos los estados (incluyendo canjeados/anulados)
			const png = await renderTicketQr(client, req.params.id);

			res.setHeader("Content-Type", "image/png");
			res.setHeader("Cache-Control", "no-store");
			return res.send(png);
		} catch (error) {
			return handleError(res, "ticket-qr", error);
		}
	});

	/** Obtener tickets por IDs (para actualización de estados en vivo).
	 *  Body: { ids: string[] } (máx 200 IDs)
	 *  Devuelve: { tickets: TicketDto[] }
	 */
	router.post("/lookup", async (req, res) => {
		try {
			const body = (req.body ?? {}) as { ids?: unknown };
			const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];

			if (ids.length === 0) {
				return res.json({ tickets: [] });
			}
			if (ids.length > 200) {
				return res.status(400).json({ message: "Máximo 200 tickets por petición." });
			}

			const client = await getClient();
			const placeholders = ids.map(() => "?").join(",");
			const result = await client.execute({
				sql: `SELECT * FROM tickets WHERE id IN (${placeholders})`,
				args: ids,
			});

			const tickets = result.rows.map((row) => withEffectiveStatus(mapTicket(row)));
			return res.json({ tickets });
		} catch (error) {
			return handleError(res, "tickets-by-ids", error);
		}
	});

	/** Metadatos de un ticket, sin secretos. */
	router.get("/:id", async (req, res) => {
		try {
			const client = await getClient();
			const ticket = await getTicketById(client, req.params.id);
			if (!ticket) {
				return res.status(404).json({ message: "El ticket no existe." });
			}
			return res.json({
				ticket: withEffectiveStatus(ticket),
			});
		} catch (error) {
			return handleError(res, "ticket-detail", error);
		}
	});

	/** Anula un ticket (void). Solo operador. */
	router.post("/:id/void", async (req, res) => {
		try {
			const client = await getClient();
			const result: VoidResult = await voidTicket(client, req.params.id);

			return res.json({
				success: result.success,
				ticket: result.ticket ? withEffectiveStatus(result.ticket) : null,
				reason: result.reason,
			});
		} catch (error) {
			return handleError(res, "void-ticket", error);
		}
	});

	return router;
}