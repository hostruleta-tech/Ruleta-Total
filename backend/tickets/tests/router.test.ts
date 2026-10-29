import express, { type Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbClient } from "../../database";
import { createTicketsRouter } from "../router";
import {
	createTestDb,
	restoreEnv,
	setTestEnv,
	TEST_PASSWORD,
} from "./helpers";

describe("API de tickets", () => {
	let client: DbClient;
	let app: Express;
	let saved: ReturnType<typeof setTestEnv>;

	beforeEach(async () => {
		saved = setTestEnv();
		client = await createTestDb();
		app = express();
		app.use(express.json());
		app.use("/tickets", createTicketsRouter(async () => client));
	});

	afterEach(() => {
		restoreEnv(saved);
	});

	it("exige la contraseña de operador", async () => {
		await request(app).post("/tickets").send({}).expect(401);
		await request(app)
			.post("/tickets")
			.set("X-Operator-Password", "incorrecta")
			.send({})
			.expect(401);
	});

	it("responde 503 si OPERATOR_PASSWORD no está configurada", async () => {
		delete process.env.OPERATOR_PASSWORD;

		const response = await request(app)
			.post("/tickets")
			.set("X-Operator-Password", TEST_PASSWORD)
			.send({})
			.expect(503);

		expect(response.body.message).toContain("OPERATOR_PASSWORD");
	});

	it("crea un ticket individual y devuelve su QR", async () => {
		const response = await request(app)
			.post("/tickets/batch")
			.set("X-Operator-Password", TEST_PASSWORD)
			.send({ quantity: 1, batchLabel: "Individual" })
			.expect(201);

		expect(response.body.batch.quantity).toBe(1);
		expect(response.body.tickets).toHaveLength(1);
		expect(response.body.tickets[0].status).toBe("available");
		expect(response.body.tickets[0].batchId).toBe(response.body.batch.id);
		expect(response.body.previews).toHaveLength(1);
		expect(response.body.previews[0].qrDataUrl).toMatch(/^data:image\/png;base64,/);

		const serialized = JSON.stringify(response.body.tickets[0]);
		expect(serialized).not.toContain("token_hash");
		expect(serialized).not.toContain("token_encrypted");
	});

	it("crea un lote y devuelve solo las primeras vistas previas", async () => {
		const response = await request(app)
			.post("/tickets/batch")
			.set("X-Operator-Password", TEST_PASSWORD)
			.send({ quantity: 3, batchLabel: "Lote API" })
			.expect(201);

		expect(response.body.batch.quantity).toBe(3);
		expect(response.body.tickets).toHaveLength(3);
		expect(response.body.previews).toHaveLength(3);
		expect(response.body.previews[0].qrDataUrl).toMatch(
			/^data:image\/png;base64,/,
		);
		expect(JSON.stringify(response.body.tickets)).not.toContain("token_hash");
	});

	it("valida cantidad y expiración", async () => {
		await request(app)
			.post("/tickets/batch")
			.set("X-Operator-Password", TEST_PASSWORD)
			.send({ quantity: 0 })
			.expect(400);

		await request(app)
			.post("/tickets/batch")
			.set("X-Operator-Password", TEST_PASSWORD)
			.send({ quantity: 501 })
			.expect(400);

		await request(app)
			.post("/tickets/batch")
			.set("X-Operator-Password", TEST_PASSWORD)
			.send({ quantity: 1, expiresAt: "2000-01-01T00:00:00.000Z" })
			.expect(400);
	});

	it("lista tickets y lotes sin secretos", async () => {
		const created = await request(app)
			.post("/tickets/batch")
			.set("X-Operator-Password", TEST_PASSWORD)
			.send({ quantity: 2 })
			.expect(201);

		const list = await request(app)
			.get("/tickets")
			.set("X-Operator-Password", TEST_PASSWORD)
			.expect(200);

		expect(list.body.total).toBe(2);

		const batches = await request(app)
			.get("/tickets/batches")
			.set("X-Operator-Password", TEST_PASSWORD)
			.expect(200);

		expect(batches.body.batches[0].id).toBe(created.body.batch.id);
		expect(batches.body.batches[0].total).toBe(2);
		expect(batches.body.batches[0].available).toBe(2);

		const serialized = JSON.stringify(list.body);
		expect(serialized).not.toContain("token_hash");
		expect(serialized).not.toContain("token_encrypted");

		await request(app)
			.get("/tickets?status=inventado")
			.set("X-Operator-Password", TEST_PASSWORD)
			.expect(400);
	});

	it("descarga el PNG individual y el ZIP del lote", async () => {
		const created = await request(app)
			.post("/tickets/batch")
			.set("X-Operator-Password", TEST_PASSWORD)
			.send({ quantity: 2 })
			.expect(201);

		await request(app)
			.get(`/tickets/${created.body.tickets[0].id}/qr`)
			.set("X-Operator-Password", TEST_PASSWORD)
			.expect(200)
			.expect("Content-Type", /image\/png/);

		await request(app)
			.get(`/tickets/batches/${created.body.batch.id}/qr.zip`)
			.set("X-Operator-Password", TEST_PASSWORD)
			.expect(200)
			.expect("Content-Type", /application\/zip/)
			.expect("Cache-Control", "no-store");

		await request(app)
			.get(`/tickets/batches/${created.body.batch.id}`)
			.set("X-Operator-Password", TEST_PASSWORD)
			.expect(200)
			.expect((response) => {
				expect(response.body.tickets).toHaveLength(2);
				expect(response.body.previews).toHaveLength(2);
			});
	});

	it("devuelve 404 para tickets y lotes inexistentes", async () => {
		await request(app)
			.get("/tickets/no-existe/qr")
			.set("X-Operator-Password", TEST_PASSWORD)
			.expect(404);

		await request(app)
			.get("/tickets/batches/no-existe/qr.zip")
			.set("X-Operator-Password", TEST_PASSWORD)
			.expect(404);
	});
});
