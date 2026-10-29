import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "../../database";
import {
	redeemTicket,
	releaseReservation,
	reserveTicket,
	validateTicket,
	voidTicket,
} from "../repository";
import { createTickets } from "../service";
import { hashTicketToken } from "../token";
import { createTicketsRouter } from "../router";
import {
	createTestDb,
	restoreEnv,
	setTestEnv,
	TEST_PASSWORD,
	tokenFromParticipationUrl,
} from "./helpers";

const PRIZE = { prizeId: 7, prizeName: "Café gratis", rouletteId: 1 };

describe("Fase 2: reserva y canje", () => {
	let client: DbClient;
	let ticketsApp: Express;
	let saved: ReturnType<typeof setTestEnv>;

	beforeEach(async () => {
		saved = setTestEnv();
		client = await createTestDb();

		ticketsApp = express();
		ticketsApp.use(express.json());
		ticketsApp.use("/tickets", createTicketsRouter(async () => client));
	});

	afterEach(() => {
		restoreEnv(saved);
		vi.restoreAllMocks();
	});

	async function newTicket(): Promise<{ token: string; hash: string; id: string }> {
		const result = await createTickets(client, { quantity: 1 });
		const first = result.tickets[0];
		if (!first) throw new Error("No se creó el ticket de prueba.");
		const token = tokenFromParticipationUrl(first.participationUrl);
		return { token, hash: hashTicketToken(token), id: first.ticket.id };
	}

	it("valida un ticket disponible sin consumirlo", async () => {
		const { hash } = await newTicket();

		const result = await validateTicket(client, hash);
		expect(result.valid).toBe(true);
		expect(result.ticket?.status).toBe("available");

		// Sigue disponible tras validar.
		const again = await validateTicket(client, hash);
		expect(again.valid).toBe(true);
	});

	it("rechaza tokens inexistentes", async () => {
		const result = await validateTicket(client, hashTicketToken("no-existe"));
		expect(result.valid).toBe(false);
		expect(result.reason).toBe("not_found");
	});

	it("reserva una sola vez aunque haya dos peticiones simultáneas", async () => {
		const { hash } = await newTicket();

		const [first, second] = await Promise.all([
			reserveTicket(client, hash, 5),
			reserveTicket(client, hash, 5),
		]);

		const successes = [first, second].filter((item) => item.success);
		expect(successes).toHaveLength(1);

		const current = await validateTicket(client, hash);
		expect(current.ticket?.status).toBe("reserved");
		expect(current.valid).toBe(false);
	});

	it("no canjea un ticket que no está reservado", async () => {
		const { hash } = await newTicket();

		const result = await redeemTicket(client, hash, PRIZE);
		expect(result.success).toBe(false);
		expect(result.reason).toBe("not_reserved");
	});

	it("canjea, guarda el premio y es idempotente", async () => {
		const { hash } = await newTicket();

		await reserveTicket(client, hash, 5);
		const redeemed = await redeemTicket(client, hash, PRIZE);

		expect(redeemed.success).toBe(true);
		expect(redeemed.ticket?.status).toBe("redeemed");
		expect(redeemed.ticket?.prizeId).toBe(PRIZE.prizeId);
		expect(redeemed.ticket?.prizeName).toBe(PRIZE.prizeName);
		expect(redeemed.ticket?.rouletteId).toBe(PRIZE.rouletteId);
		expect(redeemed.ticket?.redeemedAt).not.toBeNull();

		// Reintento: devuelve el mismo premio, no falla ni gira otra vez.
		const retry = await redeemTicket(client, hash, {
			prizeId: 99,
			prizeName: "Otro premio",
			rouletteId: 1,
		});
		expect(retry.success).toBe(true);
		expect(retry.ticket?.prizeId).toBe(PRIZE.prizeId);
		expect(retry.ticket?.prizeName).toBe(PRIZE.prizeName);

		const validation = await validateTicket(client, hash);
		expect(validation.valid).toBe(false);
		expect(validation.reason).toBe("already_redeemed");
	});

	it("libera la reserva cuando el giro cae en Inténtalo de nuevo", async () => {
		const { hash } = await newTicket();

		const reserved = await reserveTicket(client, hash, 5);
		expect(reserved.success).toBe(true);

		// El servidor libera la reserva para no consumir el ticket.
		await releaseReservation(client, hash);

		const validation = await validateTicket(client, hash);
		expect(validation.valid).toBe(true);
		expect(validation.ticket?.status).toBe("available");
	});

	it("libera una reserva vencida", async () => {
		const { hash } = await newTicket();

		// Reserva creada en el pasado: su reserved_until ya venció.
		const past = new Date(Date.now() - 10 * 60 * 1000);
		const reserved = await reserveTicket(client, hash, 5, past);
		expect(reserved.success).toBe(true);

		const validation = await validateTicket(client, hash);
		expect(validation.valid).toBe(true);
		expect(validation.ticket?.status).toBe("available");
	});

	it("no permite reservar tickets expirados", async () => {
		const { hash } = await newTicket();

		const past = new Date(Date.now() - 60 * 1000);
		// El token se creó sin expiración; simulamos la expiración por fecha.
		const rows = await client.execute({
			sql: "UPDATE tickets SET expires_at = ? WHERE token_hash = ?",
			args: [past.toISOString(), hash],
		});
		expect(rows.rowsAffected).toBe(1);

		const reserved = await reserveTicket(client, hash, 5);
		expect(reserved.success).toBe(false);
		expect(reserved.reason).toBe("expired");
	});

	it("anula tickets disponibles y no permite anular canjeados", async () => {
		const available = await newTicket();
		const voided = await voidTicket(client, available.id);
		expect(voided.success).toBe(true);
		expect(voided.ticket?.status).toBe("void");

		const redeemedTicket = await newTicket();
		await reserveTicket(client, redeemedTicket.hash, 5);
		await redeemTicket(client, redeemedTicket.hash, PRIZE);

		const blocked = await voidTicket(client, redeemedTicket.id);
		expect(blocked.success).toBe(false);
		expect(blocked.reason).toBe("already_redeemed");
	});

	it("expone validate/reserve sin contraseña de operador", async () => {
		const { token } = await newTicket();

		const validation = await request(ticketsApp)
			.post("/tickets/validate")
			.send({ token })
			.expect(200);
		expect(validation.body.valid).toBe(true);
		expect(JSON.stringify(validation.body)).not.toContain("token_hash");

		await request(ticketsApp)
			.post("/tickets/reserve")
			.send({ token })
			.expect(200)
			.expect((response) => {
				expect(response.body.success).toBe(true);
				expect(response.body.ticket.status).toBe("reserved");
			});
	});

	it("no expone un endpoint público para fijar el premio", async () => {
		const { token } = await newTicket();

		// Sin contraseña cae en el middleware de operador: no hay canje público.
		await request(ticketsApp)
			.post("/tickets/redeem")
			.send({ token, ...PRIZE })
			.expect(401);
	});

	it("exige la contraseña de operador para anular", async () => {
		const { id } = await newTicket();

		await request(ticketsApp).post(`/tickets/${id}/void`).expect(401);

		const response = await request(ticketsApp)
			.post(`/tickets/${id}/void`)
			.set("X-Operator-Password", TEST_PASSWORD)
			.expect(200);
		expect(response.body.success).toBe(true);
	});

	it("el giro exige un token de ticket", async () => {
		// Mock the database to return a valid roulette for this test
		const { router: apiRouter } = await import("../../app");
		const { getActiveRouletteWithPrizes } = await import("../../database");
		
		vi.spyOn(await import("../../database"), "getActiveRouletteWithPrizes").mockResolvedValue({
			id: 1,
			name: "Test",
			is_active: true,
			prizes: [
				{ id: 1, roulette_id: 1, name: "Premio 1", backgroundColor: "#0A4E58", probability: 10, image: null, imageUrl: null, labelMode: "both", isSpinAgain: false, sectorIndex: 0 },
				{ id: 2, roulette_id: 1, name: "Premio 2", backgroundColor: "#00767C", probability: 10, image: null, imageUrl: null, labelMode: "both", isSpinAgain: false, sectorIndex: 1 },
				{ id: 3, roulette_id: 1, name: "Premio 3", backgroundColor: "#008087", probability: 10, image: null, imageUrl: null, labelMode: "both", isSpinAgain: false, sectorIndex: 2 },
				{ id: 4, roulette_id: 1, name: "Premio 4", backgroundColor: "#1C7C54", probability: 10, image: null, imageUrl: null, labelMode: "both", isSpinAgain: false, sectorIndex: 3 },
				{ id: 5, roulette_id: 1, name: "Premio 5", backgroundColor: "#2E8B57", probability: 10, image: null, imageUrl: null, labelMode: "both", isSpinAgain: false, sectorIndex: 4 },
				{ id: 6, roulette_id: 1, name: "Premio 6", backgroundColor: "#4A7C3F", probability: 10, image: null, imageUrl: null, labelMode: "both", isSpinAgain: false, sectorIndex: 5 },
			],
		});

		const spinApp = express();
		spinApp.use(express.json());
		spinApp.use("/", apiRouter);

		const response = await request(spinApp).post("/spin").send({}).expect(400);
		expect(response.body.message).toContain("Token");
	});
});
