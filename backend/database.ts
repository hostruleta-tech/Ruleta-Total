import "./env";
import { createClient, type Client } from "@libsql/client/web";
import { SEED_TEMPLATES } from "./seed-data";

export interface Prize {
	id?: number;
	roulette_id: number;
	name: string;
	backgroundColor: string;
	probability: number;
}

export interface RouletteTemplate {
	id: number;
	name: string;
	is_active: boolean;
	prizes?: Prize[];
}

type Row = Record<string, unknown>;

let db: Client | null = null;
let initPromise: Promise<Client> | null = null;

function createDbClient(): Client {
	const url = process.env.TURSO_DATABASE_URL;
	const authToken = process.env.TURSO_AUTH_TOKEN;

	if (!url || !authToken) {
		throw new Error(
			"TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in the environment.",
		);
	}

	return createClient({ url, authToken });
}

function mapRoulette(row: Row): RouletteTemplate {
	return {
		id: Number(row.id),
		name: String(row.name),
		is_active: Number(row.is_active) === 1,
	};
}

function mapPrize(row: Row): Prize {
	return {
		id: Number(row.id),
		roulette_id: Number(row.roulette_id),
		name: String(row.name),
		backgroundColor: String(row.backgroundColor),
		probability: Number(row.probability),
	};
}

async function ensureInitialized(): Promise<Client> {
	if (db) return db;
	if (initPromise) return initPromise;

	initPromise = (async () => {
		const client = createDbClient();

		await client.batch(
			[
				{
					sql: `
            CREATE TABLE IF NOT EXISTS roulettes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              is_active BOOLEAN NOT NULL DEFAULT 0
            )
          `,
					args: [],
				},
				{
					sql: `
            CREATE TABLE IF NOT EXISTS prizes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              roulette_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              backgroundColor TEXT NOT NULL,
              probability REAL NOT NULL,
              FOREIGN KEY (roulette_id) REFERENCES roulettes (id) ON DELETE CASCADE
            )
          `,
					args: [],
				},
			],
			"write",
		);

		// Auto-seed solo si la base está totalmente vacía.
		const countResult = await client.execute(
			"SELECT COUNT(*) AS total FROM roulettes",
		);
		const total = Number(countResult.rows[0]?.total ?? 0);

		if (total === 0) {
			for (const template of SEED_TEMPLATES) {
				const inserted = await client.execute({
					sql: "INSERT INTO roulettes (name, is_active) VALUES (?, ?)",
					args: [template.name, template.isActive ? 1 : 0],
				});
				const rouletteId = Number(inserted.lastInsertRowid ?? 0);

				if (template.prizes.length > 0) {
					await client.batch(
						template.prizes.map((prize) => ({
							sql: "INSERT INTO prizes (roulette_id, name, backgroundColor, probability) VALUES (?, ?, ?, ?)",
							args: [
								rouletteId,
								prize.name,
								prize.backgroundColor,
								prize.probability,
							],
						})),
						"write",
					);
				}
			}
			console.log("[db] Base vacía: plantillas iniciales creadas.");
		}

		db = client;
		return client;
	})();

	try {
		return await initPromise;
	} catch (error) {
		// Permite reintentar en la siguiente petición si falló la conexión.
		initPromise = null;
		throw error;
	}
}

async function getDb(): Promise<Client> {
	return ensureInitialized();
}

export async function getActiveRouletteWithPrizes(): Promise<RouletteTemplate | null> {
	const client = await getDb();
	const result = await client.execute({
		sql: "SELECT * FROM roulettes WHERE is_active = 1 LIMIT 1",
		args: [],
	});

	const row = result.rows[0];
	if (!row) return null;

	const roulette = mapRoulette(row);
	const prizes = await client.execute({
		sql: "SELECT * FROM prizes WHERE roulette_id = ? ORDER BY id",
		args: [roulette.id],
	});
	roulette.prizes = prizes.rows.map(mapPrize);
	return roulette;
}

export async function getAllRoulettes(): Promise<RouletteTemplate[]> {
	const client = await getDb();
	const result = await client.execute("SELECT * FROM roulettes ORDER BY name");
	return result.rows.map(mapRoulette);
}

export async function getRouletteWithPrizes(
	id: number,
): Promise<RouletteTemplate | null> {
	const client = await getDb();
	const result = await client.execute({
		sql: "SELECT * FROM roulettes WHERE id = ?",
		args: [id],
	});

	const row = result.rows[0];
	if (!row) return null;

	const roulette = mapRoulette(row);
	const prizes = await client.execute({
		sql: "SELECT * FROM prizes WHERE roulette_id = ? ORDER BY id",
		args: [id],
	});
	roulette.prizes = prizes.rows.map(mapPrize);
	return roulette;
}

export async function createRoulette(
	name: string,
	prizes: Prize[],
): Promise<RouletteTemplate> {
	const client = await getDb();

	const inserted = await client.execute({
		sql: "INSERT INTO roulettes (name, is_active) VALUES (?, 0)",
		args: [name],
	});
	const rouletteId = Number(inserted.lastInsertRowid ?? 0);

	if (prizes.length > 0) {
		await client.batch(
			prizes.map((prize) => ({
				sql: "INSERT INTO prizes (roulette_id, name, backgroundColor, probability) VALUES (?, ?, ?, ?)",
				args: [rouletteId, prize.name, prize.backgroundColor, prize.probability],
			})),
			"write",
		);
	}

	const newRoulette = await getRouletteWithPrizes(rouletteId);
	if (!newRoulette) throw new Error("No se pudo crear la plantilla.");
	return newRoulette;
}

export async function updateRoulette(
	id: number,
	name: string,
	prizes: Prize[],
): Promise<RouletteTemplate> {
	const client = await getDb();

	const statements = [
		{
			sql: "UPDATE roulettes SET name = ? WHERE id = ?",
			args: [name, id],
		},
		{
			sql: "DELETE FROM prizes WHERE roulette_id = ?",
			args: [id],
		},
		...prizes.map((prize) => ({
			sql: "INSERT INTO prizes (roulette_id, name, backgroundColor, probability) VALUES (?, ?, ?, ?)",
			args: [id, prize.name, prize.backgroundColor, prize.probability],
		})),
	];

	await client.batch(statements, "write");

	const updated = await getRouletteWithPrizes(id);
	if (!updated) throw new Error("Roulette not found");
	return updated;
}

export async function deleteRoulette(id: number): Promise<void> {
	const client = await getDb();

	const roulette = await client.execute({
		sql: "SELECT * FROM roulettes WHERE id = ?",
		args: [id],
	});
	if (roulette.rows.length === 0) throw new Error("Roulette not found");

	const active = await client.execute(
		"SELECT * FROM roulettes WHERE is_active = 1 LIMIT 1",
	);
	if (active.rows[0] && Number(active.rows[0].id) === id) {
		throw new Error("Cannot delete the active roulette template.");
	}

	const count = await client.execute("SELECT COUNT(*) AS cnt FROM roulettes");
	if (Number(count.rows[0]?.cnt ?? 0) <= 1) {
		throw new Error("Cannot delete the last roulette template.");
	}

	await client.batch(
		[
			{ sql: "DELETE FROM prizes WHERE roulette_id = ?", args: [id] },
			{ sql: "DELETE FROM roulettes WHERE id = ?", args: [id] },
		],
		"write",
	);
}

export async function setActiveRoulette(id: number): Promise<void> {
	const client = await getDb();

	const exists = await client.execute({
		sql: "SELECT id FROM roulettes WHERE id = ?",
		args: [id],
	});
	if (exists.rows.length === 0) throw new Error("Roulette not found");

	await client.batch(
		[
			{ sql: "UPDATE roulettes SET is_active = 0", args: [] },
			{ sql: "UPDATE roulettes SET is_active = 1 WHERE id = ?", args: [id] },
		],
		"write",
	);
}
