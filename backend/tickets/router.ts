import { Router } from "express";
import type { Client } from "@libsql/client";
import { requireOperatorPassword } from "./auth";
import {
	TicketConfigError,
	TicketNotFoundError,
	TicketValidationError,
} from "./errors";
import { QR_PRINT_WIDTH, renderQrPngDataUrl } from "./qr";
import {
	getTicketById,
	listBatches,
	listTickets,
} from "./repository";
import {
	buildBatchQrZip,
	createTickets,
	getBatchDetail,
	renderTicketQr,
} from "./service";
import {
	isTicketStatus,
	withEffectiveStatus,
	type TicketStatus,
} from "./types";

interface ListQuery {
	status?: TicketStatus;
	batchId?: string;
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

	return {
		status,
		batchId,
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
 * Rutas de administración de tickets.
 *
 * Todas requieren la contraseña de operador. La generación o el escaneo de
 * un QR no consumen el ticket; la reserva y el canje serán endpoints aparte
 * en la siguiente fase.
 */
export function createTicketsRouter(getClient: () => Promise<Client>): Router {
	const router = Router();

	router.use(requireOperatorPassword);

	/** Crea un único ticket. */
	router.post("/", async (req, res) => {
		try {
			const body = (req.body ?? {}) as {
				batchLabel?: unknown;
				expiresAt?: unknown;
			};
			const client = await getClient();
			const result = await createTickets(client, {
				quantity: 1,
				batchLabel: body.batchLabel,
				expiresAt: body.expiresAt,
			});

			const first = result.tickets[0];
			if (!first) throw new Error("No se pudo crear el ticket.");

			const qrDataUrl = await renderQrPngDataUrl(
				first.participationUrl,
				QR_PRINT_WIDTH,
			);

			return res.status(201).json({
				ticket: first.ticket,
				batch: result.batch,
				participationUrl: first.participationUrl,
				qrDataUrl,
			});
		} catch (error) {
			return handleError(res, "create-single", error);
		}
	});

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
			const result = await buildBatchQrZip(client, req.params.id);

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

	/** Detalle del lote con las primeras vistas previas. */
	router.get("/batches/:id", async (req, res) => {
		try {
			const client = await getClient();
			const result = await getBatchDetail(client, req.params.id);
			return res.json(result);
		} catch (error) {
			return handleError(res, "batch-detail", error);
		}
	});

	/** PNG individual para descarga o reimpresión. */
	router.get("/:id/qr", async (req, res) => {
		try {
			const client = await getClient();
			const png = await renderTicketQr(client, req.params.id);

			res.setHeader("Content-Type", "image/png");
			res.setHeader("Cache-Control", "no-store");
			return res.send(png);
		} catch (error) {
			return handleError(res, "ticket-qr", error);
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

	return router;
}
