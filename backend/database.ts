import "./env";
import { createClient, type Client } from "@libsql/client/web";
import { runMigrations } from "./migrations";
import { SEED_TEMPLATES } from "./seed-data";

export type LabelMode = "wheel" | "win" | "both";

export interface Prize {
	id?: number;
	roulette_id: number;
	name: string;
	backgroundColor: string;
	probability: number;
	/** Imagen del premio como data URL (solo se expone completa en el panel). */
	image?: string | null;
	/** URL pública y ligera para dibujar la imagen en la ruleta. */
	imageUrl?: string | null;
	/** Dónde mostrar el nombre del premio: "wheel"=en la ruleta, "win"=solo al ganar, "both"=ambos. */
	labelMode?: LabelMode | null;
	/**
	 * Casilla "Inténtalo de nuevo": al caer en ella no se consume el ticket y
	 * el participante puede volver a girar.
	 */
	isSpinAgain?: boolean;
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
	const id = Number(row.id);
	const image =
		row.image == null || String(row.image) === "" ? null : String(row.image);

	return {
		id,
		roulette_id: Number(row.roulette_id),
		name: String(row.name),
		backgroundColor: String(row.backgroundColor),
		probability: Number(row.probability),
		image,
		imageUrl: image ? `/api/prizes/${id}/image` : null,
		labelMode: (row.label_mode as LabelMode | null) ?? "both",
		isSpinAgain: Number(row.is_spin_again) === 1,
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
              image TEXT,
              FOREIGN KEY (roulette_id) REFERENCES roulettes (id) ON DELETE CASCADE
            )
          `,
					args: [],
				},
			],
			"write",
		);

		// Migración: bases creadas antes de la función de imágenes.
		const prizeColumns = await client.execute("PRAGMA table_info(prizes)");
		const hasImageColumn = prizeColumns.rows.some(
			(column) => column.name === "image",
		);
		if (!hasImageColumn) {
			await client.execute("ALTER TABLE prizes ADD COLUMN image TEXT");
			console.log("[db] Columna 'image' agregada a la tabla prizes.");
		}

		// Migración: columna label_mode para controlar visibilidad del nombre.
		const hasLabelModeColumn = prizeColumns.rows.some(
			(column) => column.name === "label_mode",
		);
		if (!hasLabelModeColumn) {
			await client.execute(
				"ALTER TABLE prizes ADD COLUMN label_mode TEXT NOT NULL DEFAULT 'both'",
			);
			console.log("[db] Columna 'label_mode' agregada a la tabla prizes.");
		}

		// Migración: columna is_spin_again para casillas "Inténtalo de nuevo".
		const spinAgainColumns = await client.execute("PRAGMA table_info(prizes)");
		const hasSpinAgainColumn = spinAgainColumns.rows.some(
			(column) => column.name === "is_spin_again",
		);
		if (!hasSpinAgainColumn) {
			await client.execute(
				"ALTER TABLE prizes ADD COLUMN is_spin_again BOOLEAN NOT NULL DEFAULT 0",
			);
			console.log("[db] Columna 'is_spin_again' agregada a la tabla prizes.");
		}

		// Migraciones del sistema de tickets (idempotentes).
		const appliedMigrations = await runMigrations(client);
		for (const id of appliedMigrations) {
			console.log(`[db] Migración aplicada: ${id}`);
		}

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
							sql: "INSERT INTO prizes (roulette_id, name, backgroundColor, probability, image, is_spin_again) VALUES (?, ?, ?, ?, ?, ?)",
							args: [
								rouletteId,
								prize.name,
								prize.backgroundColor,
								prize.probability,
								null,
								prize.isSpinAgain ? 1 : 0,
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

export async function getDb(): Promise<Client> {
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
				sql: "INSERT INTO prizes (roulette_id, name, backgroundColor, probability, image, label_mode, is_spin_again) VALUES (?, ?, ?, ?, ?, ?, ?)",
				args: [
					rouletteId,
					prize.name,
					prize.backgroundColor,
					prize.probability,
					prize.image ?? null,
					prize.labelMode ?? "both",
					prize.isSpinAgain ? 1 : 0,
				],
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
			sql: "INSERT INTO prizes (roulette_id, name, backgroundColor, probability, image, label_mode, is_spin_again) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: [
				id,
				prize.name,
				prize.backgroundColor,
				prize.probability,
				prize.image ?? null,
				prize.labelMode ?? "both",
				prize.isSpinAgain ? 1 : 0,
			],
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

/** Devuelve la imagen (data URL) de un premio, o null si no tiene. */
export async function getPrizeImage(id: number): Promise<string | null> {
	if (!Number.isFinite(id)) return null;

	const client = await getDb();
	const result = await client.execute({
		sql: "SELECT image FROM prizes WHERE id = ?",
		args: [id],
	});

	const value = result.rows[0]?.image;
	return value == null || String(value) === "" ? null : String(value);
}
