import type { DbClient } from "../database";
import type {
	Ticket,
	TicketBatch,
	TicketBatchSummary,
	TicketSecretRow,
	TicketStatus,
} from "./types";
import { effectiveStatus } from "./types";

type Row = Record<string, unknown>;

export interface NewTicketRow extends Ticket {
	tokenHash: string;
	tokenEncrypted: string;
}

export type TicketScope = "active" | "redeemed";

export interface ListTicketsOptions {
	status?: TicketStatus;
	scope?: TicketScope;
	batchId?: string;
	date?: string; // YYYY-MM-DD
	limit: number;
	offset: number;
	now?: Date;
}

export interface ListBatchesOptions {
	limit: number;
	offset: number;
	now?: Date;
}

export function mapTicket(row: Row): Ticket {
	return {
		id: String(row.id),
		batchId: row.batch_id == null ? null : String(row.batch_id),
		status: String(row.status) as TicketStatus,
		createdAt: String(row.created_at),
		expiresAt: row.expires_at == null ? null : String(row.expires_at),
		reservedAt: row.reserved_at == null ? null : String(row.reserved_at),
		reservedUntil:
			row.reserved_until == null ? null : String(row.reserved_until),
		redeemedAt: row.redeemed_at == null ? null : String(row.redeemed_at),
		prizeId: row.prize_id == null ? null : Number(row.prize_id),
		prizeName: row.prize_name == null ? null : String(row.prize_name),
		rouletteId: row.roulette_id == null ? null : Number(row.roulette_id),
	};
}

function mapBatch(row: Row): TicketBatch {
	return {
		id: String(row.id),
		label: row.label == null ? null : String(row.label),
		quantity: Number(row.quantity),
		createdAt: String(row.created_at),
		expiresAt: row.expires_at == null ? null : String(row.expires_at),
	};
}

function mapBatchSummary(row: Row): TicketBatchSummary {
	return {
		...mapBatch(row),
		total: Number(row.total ?? 0),
		available: Number(row.available ?? 0),
		reserved: Number(row.reserved ?? 0),
		redeemed: Number(row.redeemed ?? 0),
		expired: Number(row.expired ?? 0),
		void: Number(row.void ?? 0),
	};
}

/** Inserta el lote y todos sus tickets en una sola transacción. */
export async function insertBatchWithTickets(
	client: DbClient,
	batch: TicketBatch,
	tickets: NewTicketRow[],
): Promise<void> {
	const statements = [
		{
			sql: `INSERT INTO ticket_batches (id, label, quantity, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?)`,
			args: [
				batch.id,
				batch.label,
				batch.quantity,
				batch.createdAt,
				batch.expiresAt,
			],
		},
		...tickets.map((ticket) => ({
			sql: `INSERT INTO tickets
              (id, batch_id, token_hash, token_encrypted, status, created_at, expires_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
			args: [
				ticket.id,
				ticket.batchId,
				ticket.tokenHash,
				ticket.tokenEncrypted,
				ticket.status,
				ticket.createdAt,
				ticket.expiresAt,
			],
		})),
	];

	await client.batch(statements, "write");
}

export async function getTicketById(
	client: DbClient,
	id: string,
): Promise<Ticket | null> {
	const result = await client.execute({
		sql: "SELECT * FROM tickets WHERE id = ?",
		args: [id],
	});
	const row = result.rows[0];
	return row ? mapTicket(row) : null;
}

/**
 * Búsqueda de solo lectura por hash. No cambia el estado ni consume el
 * ticket; la reserva y el canje se implementarán en la fase 2.
 */
export async function findTicketByTokenHash(
	client: DbClient,
	tokenHash: string,
): Promise<Ticket | null> {
	const result = await client.execute({
		sql: `SELECT id, batch_id, status, created_at, expires_at,
            reserved_at, reserved_until, redeemed_at,
            prize_id, prize_name, roulette_id
          FROM tickets WHERE token_hash = ?`,
		args: [tokenHash],
	});
	const row = result.rows[0];
	return row ? mapTicket(row) : null;
}

/** Fila con token cifrado, solo para uso interno del servidor. */
export async function getTicketSecretById(
	client: DbClient,
	id: string,
): Promise<TicketSecretRow | null> {
	const result = await client.execute({
		sql: "SELECT * FROM tickets WHERE id = ?",
		args: [id],
	});
	const row = result.rows[0];
	if (!row) return null;
	return {
		ticket: mapTicket(row),
		tokenEncrypted: String(row.token_encrypted),
	};
}

function statusFilter(
	status: TicketStatus | undefined,
	nowIso: string,
): { clause: string; args: (string | number | null)[] } {
	if (!status) return { clause: "", args: [] };

	if (status === "expired") {
		return {
			clause:
				"(status = 'expired' OR (status = 'available' AND expires_at IS NOT NULL AND expires_at <= ?))",
			args: [nowIso],
		};
	}

	if (status === "available") {
		return {
			clause:
				"status = 'available' AND (expires_at IS NULL OR expires_at > ?)",
			args: [nowIso],
		};
	}

	return { clause: "status = ?", args: [status] };
}

function scopeFilter(
	scope: TicketScope | undefined,
	nowIso: string,
): { clause: string; args: (string | number | null)[] } {
	if (!scope) return { clause: "", args: [] };

	if (scope === "active") {
		// active = available vigente + reserved vigente
		return {
			clause:
				"(status = 'available' AND (expires_at IS NULL OR expires_at > ?) OR status = 'reserved' AND reserved_until > ?)",
			args: [nowIso, nowIso],
		};
	}

	if (scope === "redeemed") {
		// redeemed = canjeados + anulados
		return {
			clause: "status IN ('redeemed', 'void')",
			args: [],
		};
	}

	return { clause: "", args: [] };
}

export async function listTickets(
	client: DbClient,
	options: ListTicketsOptions,
): Promise<{ tickets: Ticket[]; total: number }> {
	const now = options.now ?? new Date();
	const nowIso = now.toISOString();

	const filters: string[] = [];
	const args: (string | number | null)[] = [];

	// Scope filter (active/redeemed) - applied first
	const scope = scopeFilter(options.scope, nowIso);
	if (scope.clause) {
		filters.push(scope.clause);
		args.push(...scope.args);
	}

	// Status filter - applied on top of scope
	const status = statusFilter(options.status, nowIso);
	if (status.clause) {
		filters.push(status.clause);
		args.push(...status.args);
	}

	if (options.batchId) {
		filters.push("batch_id = ?");
		args.push(options.batchId);
	}

	if (options.date) {
		// Filtrar por fecha de creación (YYYY-MM-DD)
		filters.push("date(created_at) = ?");
		args.push(options.date);
	}

	const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

	const countResult = await client.execute({
		sql: `SELECT COUNT(*) AS total FROM tickets ${where}`,
		args,
	});

	const result = await client.execute({
		sql: `SELECT * FROM tickets ${where}
          ORDER BY created_at DESC, id DESC
          LIMIT ? OFFSET ?`,
		args: [...args, options.limit, options.offset],
	});

	return {
		tickets: result.rows.map(mapTicket),
		total: Number(countResult.rows[0]?.total ?? 0),
	};
}

export async function getBatchById(
	client: DbClient,
	id: string,
): Promise<TicketBatch | null> {
	const result = await client.execute({
		sql: "SELECT * FROM ticket_batches WHERE id = ?",
		args: [id],
	});
	const row = result.rows[0];
	return row ? mapBatch(row) : null;
}

export async function listBatchTickets(
	client: DbClient,
	batchId: string,
	limit?: number,
): Promise<Ticket[]> {
	const result = await client.execute({
		sql: `SELECT * FROM tickets WHERE batch_id = ?
          ORDER BY created_at ASC, id ASC
          ${limit ? "LIMIT ?" : ""}`,
		args: limit ? [batchId, limit] : [batchId],
	});
	return result.rows.map(mapTicket);
}

export async function listBatchTicketSecrets(
	client: DbClient,
	batchId: string,
	limit?: number,
	onlyActive?: boolean,
): Promise<TicketSecretRow[]> {
	const nowIso = new Date().toISOString();
	let sql = `SELECT * FROM tickets WHERE batch_id = ?`;
	const args: (string | number)[] = [batchId];

	if (onlyActive) {
		sql += ` AND (status = 'available' AND (expires_at IS NULL OR expires_at > ?)
			OR status = 'reserved' AND reserved_until > ?)`;
		args.push(nowIso, nowIso);
	}

	sql += ` ORDER BY created_at ASC, id ASC`;
	if (limit) {
		sql += ` LIMIT ?`;
		args.push(limit);
	}

	const result = await client.execute({ sql, args });
	return result.rows.map((row) => ({
		ticket: mapTicket(row),
		tokenEncrypted: String(row.token_encrypted),
	}));
}

export async function listBatches(
	client: DbClient,
	options: ListBatchesOptions,
): Promise<{ batches: TicketBatchSummary[]; total: number }> {
	const nowIso = (options.now ?? new Date()).toISOString();

	const countResult = await client.execute(
		"SELECT COUNT(*) AS total FROM ticket_batches",
	);

	const result = await client.execute({
		sql: `SELECT b.*,
          (SELECT COUNT(*) FROM tickets t WHERE t.batch_id = b.id) AS total,
          (SELECT COUNT(*) FROM tickets t
            WHERE t.batch_id = b.id
              AND t.status = 'available'
              AND (t.expires_at IS NULL OR t.expires_at > ?)) AS available,
          (SELECT COUNT(*) FROM tickets t
            WHERE t.batch_id = b.id
              AND t.status = 'reserved'
              AND t.reserved_until > ?) AS reserved,
          (SELECT COUNT(*) FROM tickets t
            WHERE t.batch_id = b.id AND t.status = 'redeemed') AS redeemed,
          (SELECT COUNT(*) FROM tickets t
            WHERE t.batch_id = b.id
              AND (t.status = 'expired'
                OR (t.status = 'available'
                  AND t.expires_at IS NOT NULL
                  AND t.expires_at <= ?))) AS expired,
          (SELECT COUNT(*) FROM tickets t
            WHERE t.batch_id = b.id AND t.status = 'void') AS void
        FROM ticket_batches b
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT ? OFFSET ?`,
		args: [nowIso, nowIso, nowIso, options.limit, options.offset],
	});

	return {
		batches: result.rows.map(mapBatchSummary),
		total: Number(countResult.rows[0]?.total ?? 0),
	};
}

/**
 * Valida un ticket por hash sin cambiar su estado.
 * Devuelve el ticket con estado efectivo y si es válido para girar.
 */
export interface ValidationResult {
	ticket: Ticket | null;
	valid: boolean;
	reason?: "not_found" | "expired" | "void" | "already_redeemed" | "reserved_other";
}

export async function validateTicket(
	client: DbClient,
	tokenHash: string,
	now: Date = new Date(),
): Promise<ValidationResult> {
	const ticket = await findTicketByTokenHash(client, tokenHash);
	if (!ticket) {
		return { ticket: null, valid: false, reason: "not_found" };
	}

	const effective = effectiveStatus(ticket, now);

	if (effective === "expired") {
		return { ticket, valid: false, reason: "expired" };
	}
	if (effective === "void") {
		return { ticket, valid: false, reason: "void" };
	}
	if (effective === "redeemed") {
		return { ticket, valid: false, reason: "already_redeemed" };
	}
	if (effective === "reserved") {
		// Si la reserva ya venció, se libera automáticamente
		if (ticket.reservedUntil && Date.parse(ticket.reservedUntil) <= now.getTime()) {
			await releaseExpiredReservation(client, ticket.id, now);
			// Recargar con estado efectivo actualizado
			const refreshed = await findTicketByTokenHash(client, tokenHash);
			if (refreshed) {
				return { ticket: refreshed, valid: true };
			}
		}
		return { ticket, valid: false, reason: "reserved_other" };
	}

	return { ticket, valid: true };
}

/**
 * Libera una reserva vencida (available).
 * Se usa internamente cuando se detecta reserved_until <= now.
 */
async function releaseExpiredReservation(
	client: DbClient,
	ticketId: string,
	now: Date,
): Promise<void> {
	await client.execute({
		sql: `UPDATE tickets
              SET status = 'available',
                  reserved_at = NULL,
                  reserved_until = NULL
              WHERE id = ? AND status = 'reserved' AND reserved_until <= ?`,
		args: [ticketId, now.toISOString()],
	});
}

/**
 * Libera una reserva activa y devuelve el ticket a `available`.
 * Se usa cuando el giro cae en una casilla "Inténtalo de nuevo": el ticket
 * no se consume y el participante puede volver a girar.
 */
export async function releaseReservation(
	client: DbClient,
	tokenHash: string,
): Promise<void> {
	await client.execute({
		sql: `UPDATE tickets
              SET status = 'available',
                  reserved_at = NULL,
                  reserved_until = NULL
              WHERE token_hash = ? AND status = 'reserved'`,
		args: [tokenHash],
	});
}

/**
 * Reserva un ticket: available -> reserved.
 * Atómico: solo tiene éxito si el ticket está disponible y no expirado.
 */
export interface ReserveResult {
	success: boolean;
	ticket: Ticket | null;
	reason?:
		| ValidationResult["reason"]
		| "not_available"
		| "already_reserved";
}

export async function reserveTicket(
	client: DbClient,
	tokenHash: string,
	ttlMinutes: number = 5,
	now: Date = new Date(),
): Promise<ReserveResult> {
	const validation = await validateTicket(client, tokenHash, now);
	if (!validation.ticket) {
		return { success: false, ticket: null, reason: validation.reason };
	}
	if (!validation.valid) {
		return { success: false, ticket: validation.ticket, reason: validation.reason };
	}

	const reservedUntil = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
	const reservedAt = now.toISOString();

	const result = await client.execute({
		sql: `UPDATE tickets
              SET status = 'reserved',
                  reserved_at = ?,
                  reserved_until = ?
              WHERE id = ? AND status = 'available'`,
		args: [reservedAt, reservedUntil, validation.ticket.id],
	});

	if (result.rowsAffected === 0) {
		// Condición de carrera: otro proceso lo reservó/canjeó
		const current = await findTicketByTokenHash(client, tokenHash);
		return {
			success: false,
			ticket: current,
			reason: current?.status === "reserved" ? "already_reserved" : "not_available",
		};
	}

	const reserved = await findTicketByTokenHash(client, tokenHash);
	return { success: true, ticket: reserved! };
}

/**
 * Canjea un ticket reservado: reserved -> redeemed + guarda premio.
 * Idempotente: si ya está redeemed, devuelve el ticket con el premio guardado.
 */
export interface RedeemResult {
	success: boolean;
	ticket: Ticket | null;
	reason?: "not_found" | "not_reserved" | "reservation_expired" | "already_redeemed";
}

export interface PrizeInfo {
	prizeId: number;
	prizeName: string;
	rouletteId: number;
}

export async function redeemTicket(
	client: DbClient,
	tokenHash: string,
	prize: PrizeInfo,
	now: Date = new Date(),
): Promise<RedeemResult> {
	const ticket = await findTicketByTokenHash(client, tokenHash);
	if (!ticket) {
		return { success: false, ticket: null, reason: "not_found" };
	}

	const effective = effectiveStatus(ticket, now);

	// Idempotente: ya canjeado, devolver el premio guardado
	if (effective === "redeemed") {
		return { success: true, ticket };
	}

	if (effective !== "reserved") {
		return { success: false, ticket, reason: "not_reserved" };
	}

	// Verificar si la reserva venció
	if (ticket.reservedUntil && Date.parse(ticket.reservedUntil) <= now.getTime()) {
		await releaseExpiredReservation(client, ticket.id, now);
		return { success: false, ticket: await findTicketByTokenHash(client, tokenHash), reason: "reservation_expired" };
	}

	const redeemedAt = now.toISOString();

	const result = await client.execute({
		sql: `UPDATE tickets
              SET status = 'redeemed',
                  reserved_until = NULL,
                  redeemed_at = ?,
                  prize_id = ?,
                  prize_name = ?,
                  roulette_id = ?
              WHERE id = ? AND status = 'reserved'`,
		args: [redeemedAt, prize.prizeId, prize.prizeName, prize.rouletteId, ticket.id],
	});

	if (result.rowsAffected === 0) {
		// Condición de carrera
		const current = await findTicketByTokenHash(client, tokenHash);
		return {
			success: false,
			ticket: current,
			reason: current?.status === "redeemed" ? "already_redeemed" : "not_reserved",
		};
	}

	const redeemed = await findTicketByTokenHash(client, tokenHash);
	return { success: true, ticket: redeemed! };
}

/**
 * Anula un ticket (void). Solo operador.
 * Disponible desde available, reserved (no vencida), expired.
 * No permite anular un redeemed.
 */
export interface VoidResult {
	success: boolean;
	ticket: Ticket | null;
	reason?: "not_found" | "already_redeemed" | "cannot_void";
}

export async function voidTicket(
	client: DbClient,
	ticketId: string,
	now: Date = new Date(),
): Promise<VoidResult> {
	const ticket = await getTicketById(client, ticketId);
	if (!ticket) {
		return { success: false, ticket: null, reason: "not_found" };
	}

	const effective = effectiveStatus(ticket, now);
	if (effective === "redeemed") {
		return { success: false, ticket, reason: "already_redeemed" };
	}
	if (effective === "void") {
		return { success: true, ticket }; // idempotente
	}

	const result = await client.execute({
		sql: `UPDATE tickets
              SET status = 'void',
                  reserved_at = NULL,
                  reserved_until = NULL
              WHERE id = ? AND status != 'redeemed'`,
		args: [ticketId],
	});

	if (result.rowsAffected === 0) {
		const current = await getTicketById(client, ticketId);
		return { success: false, ticket: current, reason: "cannot_void" };
	}

	const voided = await getTicketById(client, ticketId);
	return { success: true, ticket: voided! };
}