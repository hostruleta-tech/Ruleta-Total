import { describe, expect, it } from "vitest";
import {
	generateTicketToken,
	hashTicketToken,
	isValidTicketToken,
	TICKET_TOKEN_PATTERN,
} from "../token";

describe("tokens de ticket", () => {
	it("genera 10.000 tokens únicos con formato seguro", () => {
		const tokens = new Set<string>();

		for (let i = 0; i < 10_000; i++) {
			const token = generateTicketToken();
			expect(token).toMatch(TICKET_TOKEN_PATTERN);
			expect(isValidTicketToken(token)).toBe(true);
			tokens.add(token);
		}

		expect(tokens.size).toBe(10_000);
	});

	it("genera un hash SHA-256 determinista y sin el token en claro", () => {
		const token = generateTicketToken();
		const first = hashTicketToken(token);
		const second = hashTicketToken(token);

		expect(first).toBe(second);
		expect(first).toMatch(/^[a-f0-9]{64}$/);
		expect(first).not.toContain(token);
	});

	it("rechaza tokens con formato inválido", () => {
		expect(isValidTicketToken("")).toBe(false);
		expect(isValidTicketToken("secuencial-1")).toBe(false);
		expect(isValidTicketToken("a".repeat(42))).toBe(false);
	});
});
