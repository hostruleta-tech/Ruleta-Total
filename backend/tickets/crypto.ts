import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
} from "node:crypto";
import { TicketConfigError } from "./errors";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const ENV_KEY = "TICKET_ENCRYPTION_KEY";

/**
 * Obtiene la clave de cifrado desde el entorno.
 *
 * Debe ser base64 de exactamente 32 bytes. Se usa para poder regenerar el
 * QR de un ticket (reimpresión) sin guardar el token en texto plano.
 */
export function getEncryptionKey(): Buffer {
	const raw = process.env[ENV_KEY]?.trim();
	if (!raw) {
		throw new TicketConfigError(
			`Falta configurar ${ENV_KEY} (clave de 32 bytes en base64).`,
		);
	}

	let key: Buffer;
	try {
		key = Buffer.from(raw, "base64");
	} catch {
		throw new TicketConfigError(
			`${ENV_KEY} no es una clave base64 válida.`,
		);
	}

	if (key.length !== KEY_BYTES) {
		throw new TicketConfigError(
			`${ENV_KEY} debe tener exactamente 32 bytes (base64).`,
		);
	}

	return key;
}

/**
 * Cifra el token con AES-256-GCM.
 * Formato almacenado: `v1.<iv>.<tag>.<ciphertext>` (todo base64url).
 */
export function encryptTicketToken(
	token: string,
	key: Buffer = getEncryptionKey(),
): string {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(token, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	return [
		VERSION,
		iv.toString("base64url"),
		tag.toString("base64url"),
		ciphertext.toString("base64url"),
	].join(".");
}

/** Descifra un token almacenado. Lanza un error genérico si está corrupto. */
export function decryptTicketToken(
	payload: string,
	key: Buffer = getEncryptionKey(),
): string {
	const parts = payload.split(".");
	if (parts.length !== 4 || parts[0] !== VERSION) {
		throw new Error("El token cifrado no tiene un formato válido.");
	}

	const iv = Buffer.from(parts[1], "base64url");
	const tag = Buffer.from(parts[2], "base64url");
	const ciphertext = Buffer.from(parts[3], "base64url");

	if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
		throw new Error("El token cifrado está incompleto.");
	}

	try {
		const decipher = createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([
			decipher.update(ciphertext),
			decipher.final(),
		]).toString("utf8");
	} catch {
		// No incluir el payload ni el token en el mensaje.
		throw new Error("No se pudo descifrar el token del ticket.");
	}
}
