import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import type { DbClient } from "../database";
import { decryptTicketToken, encryptTicketToken } from "./crypto";
import { TicketNotFoundError, TicketValidationError } from "./errors";
import { QR_PRINT_WIDTH, QR_PREVIEW_WIDTH, renderQrPng, renderQrPngDataUrl } from "./qr";
import {
	getBatchById,
	getTicketSecretById,
	insertBatchWithTickets,
	listBatchTicketSecrets,
	listBatchTickets,
	mapTicket,
} from "./repository";
import { generateTicketToken, hashTicketToken } from "./token";
import type {
	Ticket,
	TicketBatch,
	TicketPreview,
	TicketSecretRow,
} from "./types";
import { effectiveStatus } from "./types";
import { buildParticipationUrl, getPublicAppUrl } from "./url";

export const MAX_BATCH_SIZE = 500;
export const PREVIEW_COUNT = 12;

export interface CreateTicketsOptions {
	quantity?: unknown;
	batchLabel?: unknown;
	expiresAt?: unknown;
}

export interface CreatedTicket {
	ticket: Ticket;
	participationUrl: string;
}

export interface CreateTicketsResult {
	batch: TicketBatch;
	tickets: CreatedTicket[];
	previews: TicketPreview[];
}

export interface BatchDetail {
	batch: TicketBatch;
	tickets: Ticket[];
	previews: TicketPreview[];
}

export interface BatchZip {
	batch: TicketBatch;
	zip: Buffer;
}

function normalizeQuantity(value: unknown): number {
	const quantity = value == null ? 1 : Number(value);
	if (!Number.isInteger(quantity) || quantity < 1) {
		throw new TicketValidationError(
			"La cantidad debe ser un número entero mayor que 0.",
		);
	}
	if (quantity > MAX_BATCH_SIZE) {
		throw new TicketValidationError(
			`No se pueden generar más de ${MAX_BATCH_SIZE} tickets por lote.`,
		);
	}
	return quantity;
}

function normalizeLabel(value: unknown): string | null {
	if (value == null) return null;
	if (typeof value !== "string") {
		throw new TicketValidationError("La etiqueta del lote no es válida.");
	}
	const label = value.trim();
	if (!label) return null;
	if (label.length > 80) {
		throw new TicketValidationError(
			"La etiqueta del lote no puede superar 80 caracteres.",
		);
	}
	return label;
}

function normalizeExpiry(value: unknown): string | null {
	if (value == null || value === "") return null;
	if (typeof value !== "string") {
		throw new TicketValidationError("La fecha de expiración no es válida.");
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		throw new TicketValidationError("La fecha de expiración no es válida.");
	}
	if (date.getTime() <= Date.now()) {
		throw new TicketValidationError(
			"La fecha de expiración debe estar en el futuro.",
		);
	}

	return date.toISOString();
}

/**
 * Genera uno o varios tickets.
 *
 * El token en claro solo vive en memoria durante esta operación: en la base
 * se guardan su hash y su versión cifrada (para reimpresión).
 */
export async function createTickets(
	client: DbClient,
	options: CreateTicketsOptions = {},
): Promise<CreateTicketsResult> {
	const quantity = normalizeQuantity(options.quantity);
	const label = normalizeLabel(options.batchLabel);
	const expiresAt = normalizeExpiry(options.expiresAt);

	// La URL base se valida antes de escribir nada en la base.
	const baseUrl = getPublicAppUrl();

	const batch: TicketBatch = {
		id: randomUUID(),
		label,
		quantity,
		createdAt: new Date().toISOString(),
		expiresAt,
	};

	const tokens = new Set<string>();
	while (tokens.size < quantity) {
		tokens.add(generateTicketToken());
	}

	const pending = Array.from(tokens).map((token) => ({
		id: randomUUID(),
		token,
		tokenHash: hashTicketToken(token),
		tokenEncrypted: encryptTicketToken(token),
	}));

	const tickets: Ticket[] = pending.map((item) => ({
		id: item.id,
		batchId: batch.id,
		status: "available",
		createdAt: batch.createdAt,
		expiresAt: batch.expiresAt,
		reservedAt: null,
		reservedUntil: null,
		redeemedAt: null,
		prizeId: null,
		prizeName: null,
		rouletteId: null,
	}));

	const participationUrls = new Map<string, string>();
	for (const item of pending) {
		participationUrls.set(item.id, buildParticipationUrl(item.token, baseUrl));
	}

	// Vistas previas antes de insertar: si falla el QR, no quedan tickets
	// huérfanos en la base.
	const previews: TicketPreview[] = [];
	for (const item of pending.slice(0, PREVIEW_COUNT)) {
		const url = participationUrls.get(item.id);
		if (!url) continue;
		previews.push({
			id: item.id,
			qrDataUrl: await renderQrPngDataUrl(url, QR_PREVIEW_WIDTH),
		});
	}

	await insertBatchWithTickets(
		client,
		batch,
		pending.map((item, index) => ({
			...tickets[index],
			tokenHash: item.tokenHash,
			tokenEncrypted: item.tokenEncrypted,
		})),
	);

	return {
		batch,
		tickets: tickets.map((ticket) => ({
			ticket,
			participationUrl: participationUrls.get(ticket.id) ?? "",
		})),
		previews,
	};
}

/** PNG de un ticket concreto, para descarga individual o reimpresión. */
export async function renderTicketQr(
	client: DbClient,
	ticketId: string,
): Promise<Buffer> {
	const secret = await getTicketSecretById(client, ticketId);
	if (!secret) throw new TicketNotFoundError();

	const token = decryptTicketToken(secret.tokenEncrypted);
	const url = buildParticipationUrl(token);
	return renderQrPng(url, QR_PRINT_WIDTH);
}

/** Data URL de un ticket concreto, para vista previa en panel. */
export async function renderTicketQrDataUrl(
	client: DbClient,
	ticketId: string,
): Promise<string> {
	const secret = await getTicketSecretById(client, ticketId);
	if (!secret) throw new TicketNotFoundError();

	const token = decryptTicketToken(secret.tokenEncrypted);
	const url = buildParticipationUrl(token);
	return renderQrPngDataUrl(url, QR_PREVIEW_WIDTH);
}

function toPreview(secret: TicketSecretRow): Promise<TicketPreview> {
	const token = decryptTicketToken(secret.tokenEncrypted);
	const url = buildParticipationUrl(token);
	return renderQrPngDataUrl(url, QR_PREVIEW_WIDTH).then((qrDataUrl) => ({
		id: secret.ticket.id,
		qrDataUrl,
	}));
}

/** Devuelve data URLs QR para TODOS los tickets de un lote (panel operador). */
export async function getBatchQrDataUrls(
	client: DbClient,
	batchId: string,
): Promise<Record<string, string>> {
	const secrets = await listBatchTicketSecrets(client, batchId);
	const urls: Record<string, string> = {};
	for (const secret of secrets) {
		const token = decryptTicketToken(secret.tokenEncrypted);
		const url = buildParticipationUrl(token);
		urls[secret.ticket.id] = await renderQrPngDataUrl(url, QR_PREVIEW_WIDTH);
	}
	return urls;
}

/** Detalle de un lote con las primeras vistas previas para el panel. */
export async function getBatchDetail(
	client: DbClient,
	batchId: string,
	options: { onlyActivePreviews?: boolean } = {}
): Promise<BatchDetail> {
	const batch = await getBatchById(client, batchId);
	if (!batch) throw new TicketNotFoundError("El lote no existe.");

	const tickets = await listBatchTickets(client, batchId);

	// Filtrar previews: solo tickets activos (available/reserved) por defecto
	const secrets = await listBatchTicketSecrets(
		client,
		batchId,
		PREVIEW_COUNT,
		options.onlyActivePreviews
	);
	const previews = await Promise.all(secrets.map(toPreview));

	return {
		batch,
		tickets: tickets.map((ticket) => ({
			...ticket,
			status: effectiveStatus(ticket),
		})),
		previews,
	};
}

function csvCell(value: string | null): string {
	if (value == null) return "";
	if (/[",\r\n]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/**
 * ZIP con todos los PNG del lote y un manifiesto sin secretos.
 * Se genera en el servidor para no exponer los tokens en el navegador.
 * @param includeAll Si true, incluye tickets canjeados y anulados (para auditoría).
 */
export async function buildBatchQrZip(
	client: DbClient,
	batchId: string,
	includeAll = false
): Promise<BatchZip> {
	const batch = await getBatchById(client, batchId);
	if (!batch) throw new TicketNotFoundError("El lote no existe.");

	const nowIso = new Date().toISOString();
	let sql = `SELECT * FROM tickets WHERE batch_id = ?`;
	const args: (string | number)[] = [batchId];

	if (!includeAll) {
		sql += ` AND (status = 'available' AND (expires_at IS NULL OR expires_at > ?)
			OR status = 'reserved' AND reserved_until > ?)`;
		args.push(nowIso, nowIso);
	}

	sql += ` ORDER BY created_at ASC, id ASC`;

	const result = await client.execute({ sql, args });
	const secrets = result.rows.map((row) => ({
		ticket: mapTicket(row),
		tokenEncrypted: String(row.token_encrypted),
	}));

	const zip = new JSZip();
	const folder = zip.folder("tickets");
	if (!folder) throw new Error("No se pudo crear el ZIP.");

	const rows = [
		"ticket_id,batch_id,status,created_at,expires_at,prize_id,prize_name,redeemed_at",
	];

	for (const secret of secrets) {
		const token = decryptTicketToken(secret.tokenEncrypted);
		const url = buildParticipationUrl(token);
		const png = await renderQrPng(url, QR_PRINT_WIDTH);
		const shortId = secret.ticket.id.slice(0, 8).toUpperCase();

		folder.file(`ticket-${shortId}.png`, png);
		rows.push(
			[
				csvCell(secret.ticket.id),
				csvCell(batch.id),
				csvCell(effectiveStatus(secret.ticket)),
				csvCell(secret.ticket.createdAt),
				csvCell(secret.ticket.expiresAt),
				csvCell(secret.ticket.prizeId == null ? "" : String(secret.ticket.prizeId)),
				csvCell(secret.ticket.prizeName),
				csvCell(secret.ticket.redeemedAt),
			].join(","),
		);
	}

	zip.file("manifest.csv", `\uFEFF${rows.join("\r\n")}\r\n`);

	const buffer = await zip.generateAsync({
		type: "nodebuffer",
		compression: "DEFLATE",
		compressionOptions: { level: 6 },
	});

	return { batch, zip: buffer };
}
