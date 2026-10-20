/**
 * Estados posibles de un ticket.
 *
 * - `available`: emitido y listo para usarse.
 * - `reserved`: reservado temporalmente durante una sesión de giro (fase 2).
 * - `redeemed`: canjeado al completar un giro (fase 2).
 * - `expired`: superó su fecha de expiración.
 * - `void`: anulado por el operador.
 */
export type TicketStatus =
	| "available"
	| "reserved"
	| "redeemed"
	| "expired"
	| "void";

export const TICKET_STATUSES: readonly TicketStatus[] = [
	"available",
	"reserved",
	"redeemed",
	"expired",
	"void",
];

export interface Ticket {
	id: string;
	batchId: string | null;
	status: TicketStatus;
	createdAt: string;
	expiresAt: string | null;
	reservedAt: string | null;
	reservedUntil: string | null;
	redeemedAt: string | null;
}

export interface TicketBatch {
	id: string;
	label: string | null;
	quantity: number;
	createdAt: string;
	expiresAt: string | null;
}

export interface TicketBatchSummary extends TicketBatch {
	total: number;
	available: number;
	reserved: number;
	redeemed: number;
	expired: number;
	void: number;
}

/** Fila interna con el token cifrado. Nunca se expone en la API. */
export interface TicketSecretRow {
	ticket: Ticket;
	tokenEncrypted: string;
}

export interface TicketPreview {
	id: string;
	qrDataUrl: string;
}

export function isTicketStatus(value: unknown): value is TicketStatus {
	return (
		typeof value === "string" &&
		(TICKET_STATUSES as readonly string[]).includes(value)
	);
}

/**
 * Estado efectivo de un ticket. Un ticket `available` cuya fecha de
 * expiración ya pasó se presenta como `expired` sin necesidad de escribir
 * en la base de datos.
 */
export function effectiveStatus(
	ticket: Ticket,
	now: Date = new Date(),
): TicketStatus {
	if (
		ticket.status === "available" &&
		ticket.expiresAt !== null &&
		Date.parse(ticket.expiresAt) <= now.getTime()
	) {
		return "expired";
	}
	return ticket.status;
}

export function withEffectiveStatus(
	ticket: Ticket,
	now: Date = new Date(),
): Ticket {
	const status = effectiveStatus(ticket, now);
	return status === ticket.status ? ticket : { ...ticket, status };
}
