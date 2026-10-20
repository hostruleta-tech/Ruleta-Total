/** Error de datos inválidos enviados por el panel. */
export class TicketValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TicketValidationError";
	}
}

/** Falta configuración necesaria (claves, URL pública, etc.). */
export class TicketConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TicketConfigError";
	}
}

/** El ticket o lote solicitado no existe. */
export class TicketNotFoundError extends Error {
	constructor(message = "El ticket no existe.") {
		super(message);
		this.name = "TicketNotFoundError";
	}
}
