import { createHash, randomBytes } from "node:crypto";

/** 32 bytes = 256 bits de entropía. */
const TOKEN_BYTES = 32;

/**
 * Patrón de un token generado por `generateTicketToken`:
 * base64url sin relleno, 43 caracteres.
 */
export const TICKET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Genera un token aleatorio criptográficamente seguro.
 * No es secuencial ni predecible.
 */
export function generateTicketToken(): string {
	return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Hash determinista para localizar el ticket sin guardar el token en claro.
 * El token tiene 256 bits de entropía, por lo que SHA-256 es suficiente.
 */
export function hashTicketToken(token: string): string {
	return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isValidTicketToken(value: string): boolean {
	return TICKET_TOKEN_PATTERN.test(value);
}
