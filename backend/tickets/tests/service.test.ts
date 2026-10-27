import jsQR from "jsqr";
import JSZip from "jszip";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbClient } from "../../database";
import { decryptTicketToken } from "../crypto";
import { TicketNotFoundError, TicketValidationError } from "../errors";
import {
	findTicketByTokenHash,
	getBatchById,
	getTicketById,
	listTickets,
} from "../repository";
import {
	buildBatchQrZip,
	createTickets,
	getBatchDetail,
	MAX_BATCH_SIZE,
} from "../service";
import { hashTicketToken } from "../token";
import { effectiveStatus, type Ticket } from "../types";
import {
	createTestClient,
	restoreEnv,
	setTestEnv,
	tokenFromParticipationUrl,
} from "./helpers";

function decodeBase64Png(dataUrl: string): string {
	const png = PNG.sync.read(
		Buffer.from(dataUrl.split(",")[1] ?? "", "base64"),
	);
	const decoded = jsQR(
		new Uint8ClampedArray(png.data),
		png.width,
		png.height,
	);
	if (!decoded) throw new Error("No se pudo decodificar el QR de prueba.");
	return decoded.data;
}

describe("persistencia de tickets", () => {
	let client: DbClient;
	let saved: ReturnType<typeof setTestEnv>;

	beforeEach(async () => {
		saved = setTestEnv();
		client = await createTestClient();
	});

	afterEach(() => {
		client.close();
		restoreEnv(saved);
	});

	it("guarda hash y token cifrado, nunca el token en claro", async () => {
		const result = await createTickets(client, {
			quantity: 3,
			batchLabel: "Lote Centro",
			expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
		});

		expect(result.tickets).toHaveLength(3);
		expect(result.batch.quantity).toBe(3);
		expect(result.batch.label).toBe("Lote Centro");
		expect(result.previews).toHaveLength(3);

		const rows = await client.execute("SELECT * FROM tickets ORDER BY id");
		expect(rows.rows).toHaveLength(3);

		for (const item of result.tickets) {
			const token = tokenFromParticipationUrl(item.participationUrl);
			const row = rows.rows.find((candidate) => candidate.id === item.ticket.id);

			expect(item.ticket.status).toBe("available");
			expect(item.ticket.batchId).toBe(result.batch.id);
			expect(item.ticket.createdAt).toBeTruthy();
			expect(item.ticket.expiresAt).toBe(result.batch.expiresAt);
			expect(row).toBeDefined();
			expect(row?.token_hash).toBe(hashTicketToken(token));
			expect(String(row?.token_encrypted)).not.toContain(token);
			expect(decryptTicketToken(String(row?.token_encrypted))).toBe(token);
		}
	});

	it("rechaza cantidades fuera de rango y fechas pasadas", async () => {
		await expect(createTickets(client, { quantity: 0 })).rejects.toThrow(
			TicketValidationError,
		);
		await expect(
			createTickets(client, { quantity: MAX_BATCH_SIZE + 1 }),
		).rejects.toThrow(TicketValidationError);
		await expect(
			createTickets(client, { expiresAt: "2000-01-01T00:00:00.000Z" }),
		).rejects.toThrow(TicketValidationError);
		await expect(
			createTickets(client, { batchLabel: "x".repeat(81) }),
		).rejects.toThrow(TicketValidationError);
	});

	it("impone la unicidad del hash del token", async () => {
		const result = await createTickets(client, { quantity: 1 });
		const item = result.tickets[0];
		const token = tokenFromParticipationUrl(item.participationUrl);
		const row = await client.execute({
			sql: "SELECT token_encrypted FROM tickets WHERE id = ?",
			args: [item.ticket.id],
		});

		await expect(
			client.execute({
				sql: `INSERT INTO tickets
              (id, batch_id, token_hash, token_encrypted, status, created_at)
              VALUES (?, ?, ?, ?, 'available', ?)`,
				args: [
					"ticket-duplicado",
					null,
					hashTicketToken(token),
					String(row.rows[0]?.token_encrypted),
					new Date().toISOString(),
				],
			}),
		).rejects.toThrow();
	});

	it("buscar por hash no consume ni cambia el estado", async () => {
		const result = await createTickets(client, { quantity: 1 });
		const token = tokenFromParticipationUrl(
			result.tickets[0].participationUrl,
		);

		const found = await findTicketByTokenHash(client, hashTicketToken(token));
		expect(found?.id).toBe(result.tickets[0].ticket.id);
		expect(found?.status).toBe("available");

		const again = await getTicketById(client, result.tickets[0].ticket.id);
		expect(again?.status).toBe("available");
	});

	it("los listados no exponen tokens ni hashes", async () => {
		const result = await createTickets(client, { quantity: 2 });
		const token = tokenFromParticipationUrl(
			result.tickets[0].participationUrl,
		);

		const listed = await listTickets(client, { limit: 10, offset: 0 });
		const serialized = JSON.stringify(listed.tickets);

		expect(listed.total).toBe(2);
		expect(serialized).not.toContain(token);
		expect(serialized).not.toContain(hashTicketToken(token));
		expect(serialized).not.toContain("token_encrypted");
	});

	it("filtra por estado efectivo sin modificar la base", async () => {
		const result = await createTickets(client, {
			quantity: 1,
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
		});
		const future = new Date(Date.now() + 120_000);

		const available = await listTickets(client, {
			status: "available",
			limit: 10,
			offset: 0,
			now: future,
		});
		const expired = await listTickets(client, {
			status: "expired",
			limit: 10,
			offset: 0,
			now: future,
		});

		expect(available.total).toBe(0);
		expect(expired.total).toBe(1);

		const stored = await getTicketById(client, result.tickets[0].ticket.id);
		expect(stored?.status).toBe("available");
	});

	it("marca como expirado un ticket disponible vencido", () => {
		const base: Ticket = {
			id: "ticket-vencido",
			batchId: null,
			status: "available",
			createdAt: new Date().toISOString(),
			expiresAt: null,
			reservedAt: null,
			reservedUntil: null,
			redeemedAt: null,
		};

		expect(effectiveStatus(base)).toBe("available");
		expect(
			effectiveStatus({
				...base,
				expiresAt: new Date(Date.now() - 1_000).toISOString(),
			}),
		).toBe("expired");
	});

	it("genera el detalle y el ZIP con un QR por ticket", async () => {
		const result = await createTickets(client, {
			quantity: 2,
			batchLabel: "Lote ZIP",
		});

		const detail = await getBatchDetail(client, result.batch.id);
		expect(detail.batch.id).toBe(result.batch.id);
		expect(detail.tickets).toHaveLength(2);
		expect(detail.previews).toHaveLength(2);

		const expectedByTicket = new Map(
			result.tickets.map((item) => [
				item.ticket.id,
				item.participationUrl,
			]),
		);
		for (const preview of detail.previews) {
			const expected = expectedByTicket.get(preview.id);
			expect(expected).toBeDefined();
			expect(decodeBase64Png(preview.qrDataUrl)).toBe(expected);
		}

		const { zip } = await buildBatchQrZip(client, result.batch.id);
		const archive = await JSZip.loadAsync(zip);

		const pngFiles = Object.keys(archive.files).filter((name) =>
			name.endsWith(".png"),
		);
		expect(pngFiles).toHaveLength(2);

		const manifest = await archive.file("manifest.csv")?.async("string");
		expect(manifest).toContain("ticket_id,batch_id,status,created_at,expires_at");

		for (const item of result.tickets) {
			const token = tokenFromParticipationUrl(item.participationUrl);
			expect(manifest).not.toContain(token);
			expect(manifest).toContain(item.ticket.id);

			const filename = `tickets/ticket-${item.ticket.id
				.slice(0, 8)
				.toUpperCase()}.png`;
			const png = await archive.file(filename)?.async("nodebuffer");
			expect(png).toBeDefined();

			const decoded = jsQR(
				new Uint8ClampedArray(PNG.sync.read(png as Buffer).data),
				PNG.sync.read(png as Buffer).width,
				PNG.sync.read(png as Buffer).height,
			);
			expect(decoded?.data).toBe(item.participationUrl);
		}

		const batch = await getBatchById(client, result.batch.id);
		expect(batch?.quantity).toBe(2);
	});

	it("devuelve 404 lÃ³gico si el lote no existe", async () => {
		await expect(getBatchDetail(client, "no-existe")).rejects.toThrow(
			TicketNotFoundError,
		);
		await expect(buildBatchQrZip(client, "no-existe")).rejects.toThrow(
			TicketNotFoundError,
		);
	});
});
