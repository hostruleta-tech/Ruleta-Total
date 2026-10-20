import type { Client } from "@libsql/client";
import type {
	Ticket,
	TicketBatch,
	TicketBatchSummary,
	TicketSecretRow,
	TicketStatus,
} from "./types";

type Row = Record<string, unknown>;

export interface NewTicketRow extends Ticket {
	tokenHash: string;
	tokenEncrypted: string;
}

export interface ListTicketsOptions {
	status?: TicketStatus;
	batchId?: string;
	limit: number;
	offset: number;
	now?: Date;
}

export interface ListBatchesOptions {
	limit: number;
	offset: number;
	now?: Date;
}

function mapTicket(row: Row): Ticket {
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
	client: Client,
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
	client: Client,
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
	client: Client,
	tokenHash: string,
): Promise<Ticket | null> {
	const result = await client.execute({
		sql: `SELECT id, batch_id, status, created_at, expires_at,
            reserved_at, reserved_until, redeemed_at
          FROM tickets WHERE token_hash = ?`,
		args: [tokenHash],
	});
	const row = result.rows[0];
	return row ? mapTicket(row) : null;
}

/** Fila con token cifrado, solo para uso interno del servidor. */
export async function getTicketSecretById(
	client: Client,
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

export async function listTickets(
	client: Client,
	options: ListTicketsOptions,
): Promise<{ tickets: Ticket[]; total: number }> {
	const now = options.now ?? new Date();
	const nowIso = now.toISOString();

	const filters: string[] = [];
	const args: (string | number | null)[] = [];

	const status = statusFilter(options.status, nowIso);
	if (status.clause) {
		filters.push(status.clause);
		args.push(...status.args);
	}

	if (options.batchId) {
		filters.push("batch_id = ?");
		args.push(options.batchId);
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
	client: Client,
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
	client: Client,
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
	client: Client,
	batchId: string,
	limit?: number,
): Promise<TicketSecretRow[]> {
	const result = await client.execute({
		sql: `SELECT * FROM tickets WHERE batch_id = ?
          ORDER BY created_at ASC, id ASC
          ${limit ? "LIMIT ?" : ""}`,
		args: limit ? [batchId, limit] : [batchId],
	});
	return result.rows.map((row) => ({
		ticket: mapTicket(row),
		tokenEncrypted: String(row.token_encrypted),
	}));
}

export async function listBatches(
	client: Client,
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
            WHERE t.batch_id = b.id AND t.status = 'reserved') AS reserved,
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
		args: [nowIso, nowIso, options.limit, options.offset],
	});

	return {
		batches: result.rows.map(mapBatchSummary),
		total: Number(countResult.rows[0]?.total ?? 0),
	};
}
