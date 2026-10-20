import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptTicketToken, encryptTicketToken } from "../crypto";
import { TicketConfigError } from "../errors";
import { generateTicketToken } from "../token";
import { restoreEnv, setTestEnv, TEST_KEY } from "./helpers";

describe("cifrado de tokens", () => {
	let saved: ReturnType<typeof setTestEnv>;

	beforeEach(() => {
		saved = setTestEnv();
	});

	afterEach(() => {
		restoreEnv(saved);
	});

	it("cifra y descifra el token sin guardarlo en claro", () => {
		const token = generateTicketToken();
		const encrypted = encryptTicketToken(token);

		expect(encrypted).not.toContain(token);
		expect(encrypted.startsWith("v1.")).toBe(true);
		expect(decryptTicketToken(encrypted, Buffer.from(TEST_KEY, "base64"))).toBe(
			token,
		);
	});

	it("usa un IV distinto en cada cifrado", () => {
		const token = generateTicketToken();
		expect(encryptTicketToken(token)).not.toBe(encryptTicketToken(token));
	});

	it("rechaza un payload manipulado", () => {
		const token = generateTicketToken();
		const encrypted = encryptTicketToken(token);
		const parts = encrypted.split(".");
		const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3].slice(0, -2)}AA`;

		expect(() => decryptTicketToken(tampered)).toThrow(
			"No se pudo descifrar el token del ticket.",
		);
	});

	it("exige una clave de 32 bytes", () => {
		delete process.env.TICKET_ENCRYPTION_KEY;
		expect(() => encryptTicketToken("token")).toThrow(TicketConfigError);

		process.env.TICKET_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
		expect(() => encryptTicketToken("token")).toThrow(TicketConfigError);
	});
});
