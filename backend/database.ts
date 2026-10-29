import { createClient } from "@libsql/client";
import { runMigrations } from "./migrations";
import { SEED_TEMPLATES } from "./seed-data";
import {
	WHEEL_SECTOR_COUNT,
	WHEEL_SECTOR_INDEXES,
	WHEEL_DEFAULT_ALIGNMENT_OFFSET,
	WHEEL_DEFAULT_INITIAL_ANGLE,
	WHEEL_DEFAULT_DISK_OFFSET_X,
	WHEEL_DEFAULT_DISK_OFFSET_Y,
	WHEEL_DEFAULT_DISK_SCALE,
	WHEEL_DEFAULT_DISK_ROTATION,
	WHEEL_DEFAULT_CENTER_OFFSET_X,
	WHEEL_DEFAULT_CENTER_OFFSET_Y,
	WHEEL_DEFAULT_CENTER_SCALE,
	isValidSectorIndex,
	type WheelCalibration,
} from "./wheel";

export type LabelMode = "wheel" | "win" | "both";

export interface Prize {
	id?: number;
	roulette_id: number;
	name: string;
	backgroundColor: string;
	probability: number;
	/** Imagen del premio como data URL (solo se expone completa en el panel). */
	image?: string | null;
	/** URL p�blica y ligera para dibujar la imagen en la ruleta. */
	imageUrl?: string | null;
	/** D�nde mostrar el nombre del premio: "wheel"=en la ruleta, "win"=solo al ganar, "both"=ambos. */
	labelMode?: LabelMode | null;
	/**
	 * Casilla "Int�ntalo de nuevo": al caer en ella no se consume el ticket y
	 * el participante puede volver a girar.
	 */
	isSpinAgain?: boolean;
	/**
	 * Sector fijo de la ruleta (0-5). `null` significa que el premio qued�
	 * fuera de la ruleta (por ejemplo, un premio sobrante de una plantilla
	 * antigua).
	 */
	sectorIndex?: number | null;
}

export interface RouletteTemplate {
	id: number;
	name: string;
	is_active: boolean;
	prizes?: Prize[];
}

export interface InStatement {
	sql: string;
	args?: unknown[];
}

export interface Migration {
	id: string;
	statements: string[];
}

type Row = Record<string, unknown>;

/**
 * Interfaz abstracta de base de datos.
 * Envuelve @libsql/client para minimizar cambios en el resto del c�digo.
 */
export interface DbClient {
	execute(sql: string | { sql: string; args?: unknown[] }): Promise<{ rows: Row[]; rowsAffected?: number }>;
	batch(
		statements: Array<{ sql: string; args?: unknown[] }>,
		_mode: "write" | "read",
	): Promise<void>;
}

let client: ReturnType<typeof createClient> | null = null;
let initPromise: Promise<DbClient> | null = null;

/**
 * Resuelve la URL de la base de datos. Se aceptan dos nombres de variable
 * por compatibilidad: DATABASE_URL (DEPLOYMENT.md) o TURSO_DATABASE_URL
 * (backend/.env.example). Basta con definir una de las dos.
 */
function getDatabaseUrl(): string {
	const url = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
	if (!url) {
		throw new Error(
			"DATABASE_URL (o TURSO_DATABASE_URL) debe estar definida en el entorno (libsql://... para Turso).",
		);
	}
	return url;
}

function createDbClient(): DbClient {
	const url = getDatabaseUrl();
	const authToken = process.env.TURSO_AUTH_TOKEN;

	const c = createClient({ url, authToken });

	return {
		async execute(input: string | { sql: string; args?: unknown[] }) {
			const sql = typeof input === "string" ? input : input.sql;
			const args = typeof input === "string" ? [] : (input.args ?? []);

			const result = await c.execute({
				sql,
				args: args as Array<string | number | bigint | null>,
			});
			return {
				rows: result.rows as Row[],
				rowsAffected: result.rowsAffected ?? 0,
			};
		},
		async batch(statements, _mode) {
			await c.batch(
				statements.map((s) => ({
					sql: s.sql,
					args: (s.args ?? []) as Array<string | number | bigint | null>,
				})),
			);
		},
	};
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
		sectorIndex:
			row.sector_index == null ? null : Number(row.sector_index),
	};
}

const DEFAULT_SECTOR_COLORS = [
	"#0A4E58",
	"#00767C",
	"#008087",
	"#1C7C54",
	"#2E8B57",
	"#4A7C3F",
];

/** Premio base para un sector que todav�a no tiene datos configurados. */
function createSectorPlaceholder(rouletteId: number, sectorIndex: number): Prize {
	return {
		roulette_id: rouletteId,
		name: `Premio ${sectorIndex + 1}`,
		backgroundColor:
			DEFAULT_SECTOR_COLORS[sectorIndex] ?? DEFAULT_SECTOR_COLORS[0],
		probability: 10,
		image: null,
		labelMode: "both",
		isSpinAgain: false,
		sectorIndex,
	};
}

/** Crea los 6 premios base de una plantilla nueva. */
export function createDefaultSectorPrizes(): Prize[] {
	return WHEEL_SECTOR_INDEXES.map((sectorIndex) =>
		createSectorPlaceholder(0, sectorIndex),
	);
}

/**
 * Devuelve siempre 6 premios ordenados por sector. Si falta alguno, lo
 * completa con un placeholder para que el panel muestre las 6 filas fijas.
 */
function normalizeSectorPrizes(rouletteId: number, prizes: Prize[]): Prize[] {
	const bySector = new Map<number, Prize>();

	for (const prize of prizes) {
		if (!isValidSectorIndex(prize.sectorIndex)) continue;
		if (!bySector.has(prize.sectorIndex)) {
			bySector.set(prize.sectorIndex, prize);
		}
	}

	return WHEEL_SECTOR_INDEXES.map(
		(sectorIndex) =>
			bySector.get(sectorIndex) ??
			createSectorPlaceholder(rouletteId, sectorIndex),
	);
}

/**
 * Migraci�n de datos: asigna 0..5 a los primeros 6 premios de cada plantilla.
 * Los sobrantes quedan sin sector; en la plantilla activa se eliminan.
 */
export async function backfillSectorIndexes(client: DbClient): Promise<void> {
	const roulettes = await client.execute("SELECT id FROM roulettes");

	for (const row of roulettes.rows) {
		const rouletteId = Number(row.id);
		const prizes = await client.execute({
			sql: "SELECT id FROM prizes WHERE roulette_id = ? ORDER BY id",
			args: [rouletteId],
		});
		if (prizes.rows.length === 0) continue;

		await client.batch(
			prizes.rows.map((prize, index) => ({
				sql: "UPDATE prizes SET sector_index = ? WHERE id = ?",
				args: [
					index < WHEEL_SECTOR_COUNT ? index : null,
					Number(prize.id),
				],
			})),
			"write",
		);
	}

	const active = await client.execute({
		sql: "SELECT id FROM roulettes WHERE is_active = 1 LIMIT 1",
		args: [],
	});
	const activeId = active.rows[0]?.id;
	if (activeId != null) {
		await client.execute({
			sql: "DELETE FROM prizes WHERE roulette_id = ? AND sector_index IS NULL",
			args: [Number(activeId)],
		});
	}
}

async function ensureInitialized(): Promise<DbClient> {
	if (client) {
		return createDbClient();
	}
	if (initPromise) return initPromise;

	initPromise = (async () => {
		client = createClient({
			url: getDatabaseUrl(),
			authToken: process.env.TURSO_AUTH_TOKEN,
		});
		const db = createDbClient();

		// Crear tablas base en un solo lote at�mico
		await client.batch([
			{
				sql: `CREATE TABLE IF NOT EXISTS roulettes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              is_active INTEGER NOT NULL DEFAULT 0
            )`,
				args: [],
			},
			{
				sql: `CREATE TABLE IF NOT EXISTS prizes (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              roulette_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              backgroundColor TEXT NOT NULL,
              probability REAL NOT NULL,
              image TEXT,
              label_mode TEXT NOT NULL DEFAULT 'both',
              is_spin_again INTEGER NOT NULL DEFAULT 0,
              sector_index INTEGER,
              FOREIGN KEY (roulette_id) REFERENCES roulettes (id) ON DELETE CASCADE
            )`,
				args: [],
			},
			{
				sql: `CREATE TABLE IF NOT EXISTS wheel_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              alignment_offset REAL NOT NULL DEFAULT 0,
              initial_angle REAL NOT NULL DEFAULT 75,
              disk_offset_x REAL NOT NULL DEFAULT 0,
              disk_offset_y REAL NOT NULL DEFAULT 16,
              disk_scale REAL NOT NULL DEFAULT 1,
              disk_rotation REAL NOT NULL DEFAULT 0,
              updated_at TEXT
            )`,
				args: [],
			},
			{
				sql: `INSERT OR IGNORE INTO wheel_settings (id, alignment_offset, initial_angle, updated_at)
                VALUES (1, ?, ?, ?)`,
				args: [
					WHEEL_DEFAULT_ALIGNMENT_OFFSET,
					WHEEL_DEFAULT_INITIAL_ANGLE,
					new Date().toISOString(),
				],
			},
		]);

		// Migraciones del sistema de tickets (idempotentes)
		const appliedMigrations = await runMigrations(db);
		for (const id of appliedMigrations) {
			console.log(`[db] Migraci�n aplicada: ${id}`);
		}

		// Auto-seed solo si la base est� totalmente vac�a.
		const countResult = await db.execute(
			"SELECT COUNT(*) AS total FROM roulettes",
		);
		const total = Number(countResult.rows[0]?.total ?? 0);

		if (total === 0) {
			for (const template of SEED_TEMPLATES) {
				const inserted = await db.execute({
					sql: "INSERT INTO roulettes (name, is_active) VALUES (?, ?) RETURNING id",
					args: [template.name, template.isActive ? 1 : 0],
				});
				const rouletteId = Number(inserted.rows[0]?.id ?? 0);

				if (template.prizes.length > 0) {
					await db.batch(
						template.prizes.map((prize) => ({
							sql:
								"INSERT INTO prizes (roulette_id, name, backgroundColor, probability, image, label_mode, is_spin_again, sector_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
							args: [
								rouletteId,
								prize.name,
								prize.backgroundColor,
								prize.probability,
								null,
								"both",
								prize.isSpinAgain ? 1 : 0,
								prize.sectorIndex,
							],
						})),
						"write",
					);
				}
			}
			console.log("[db] Base vac�a: plantillas iniciales creadas.");
		}

		return db;
	})();

	try {
		return await initPromise;
	} catch (error) {
		// Permite reintentar en la siguiente petici�n si fall� la conexi�n.
		initPromise = null;
		client = null;
		throw error;
	}
}

export async function getDb(): Promise<DbClient> {
	return ensureInitialized();
}

export async function getActiveRouletteWithPrizes(): Promise<RouletteTemplate | null> {
	const db = await getDb();
	const result = await db.execute({
		sql: "SELECT * FROM roulettes WHERE is_active = 1 LIMIT 1",
		args: [],
	});

	const row = result.rows[0];
	if (!row) return null;

	const roulette = mapRoulette(row);
	const prizes = await db.execute({
		sql: "SELECT * FROM prizes WHERE roulette_id = ? AND sector_index IS NOT NULL ORDER BY sector_index",
		args: [roulette.id],
	});
	roulette.prizes = prizes.rows
		.map(mapPrize)
		.filter((prize) => isValidSectorIndex(prize.sectorIndex));
	return roulette;
}

export async function getAllRoulettes(): Promise<RouletteTemplate[]> {
	const db = await getDb();
	const result = await db.execute("SELECT * FROM roulettes ORDER BY name");
	return result.rows.map(mapRoulette);
}

export async function getRouletteWithPrizes(
	id: number,
): Promise<RouletteTemplate | null> {
	const db = await getDb();
	const result = await db.execute({
		sql: "SELECT * FROM roulettes WHERE id = ?",
		args: [id],
	});

	const row = result.rows[0];
	if (!row) return null;

	const roulette = mapRoulette(row);
	const prizes = await db.execute({
		sql: "SELECT * FROM prizes WHERE roulette_id = ? AND sector_index IS NOT NULL ORDER BY sector_index",
		args: [id],
	});
	roulette.prizes = normalizeSectorPrizes(
		id,
		prizes.rows.map(mapPrize),
	);
	return roulette;
}

export async function createRoulette(
	name: string,
	prizes: Prize[],
): Promise<RouletteTemplate> {
	const db = await getDb();

	const inserted = await db.execute({
		sql: "INSERT INTO roulettes (name, is_active) VALUES (?, 0) RETURNING id",
		args: [name],
	});
	const rouletteId = Number(inserted.rows[0]?.id ?? 0);

	const sectorPrizes = normalizeSectorPrizes(rouletteId, prizes);
	await db.batch(
		sectorPrizes.map((prize) => ({
			sql: "INSERT INTO prizes (roulette_id, name, backgroundColor, probability, image, label_mode, is_spin_again, sector_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			args: [
				rouletteId,
				prize.name,
				prize.backgroundColor,
				prize.probability,
				prize.image ?? null,
				prize.labelMode ?? "both",
				prize.isSpinAgain ? 1 : 0,
				prize.sectorIndex ?? null,
			],
		})),
		"write",
	);

	const newRoulette = await getRouletteWithPrizes(rouletteId);
	if (!newRoulette) throw new Error("No se pudo crear la plantilla.");
	return newRoulette;
}

export async function updateRoulette(
	id: number,
	name: string,
	prizes: Prize[],
): Promise<RouletteTemplate> {
	const db = await getDb();
	const sectorPrizes = normalizeSectorPrizes(id, prizes);

	const statements = [
		{
			sql: "UPDATE roulettes SET name = ? WHERE id = ?",
			args: [name, id],
		},
		{
			sql: "DELETE FROM prizes WHERE roulette_id = ?",
			args: [id],
		},
		...sectorPrizes.map((prize) => ({
			sql: "INSERT INTO prizes (roulette_id, name, backgroundColor, probability, image, label_mode, is_spin_again, sector_index) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
			args: [
				id,
				prize.name,
				prize.backgroundColor,
				prize.probability,
				prize.image ?? null,
				prize.labelMode ?? "both",
				prize.isSpinAgain ? 1 : 0,
				prize.sectorIndex ?? null,
			],
		})),
	];

	await db.batch(statements, "write");

	const updated = await getRouletteWithPrizes(id);
	if (!updated) throw new Error("Roulette not found");
	return updated;
}

export async function deleteRoulette(
	id: number,
): Promise<void> {
	const db = await getDb();

	const active = await db.execute({
		sql: "SELECT * FROM roulettes WHERE is_active = 1 LIMIT 1",
		args: [],
	});
	if (active.rows[0] && Number(active.rows[0].id) === id) {
		throw new Error("Cannot delete the active roulette template.");
	}

	const count = await db.execute("SELECT COUNT(*) AS cnt FROM roulettes");
	if (Number(count.rows[0]?.cnt ?? 0) <= 1) {
		throw new Error("Cannot delete the last roulette template.");
	}

	await db.batch(
		[
			{ sql: "DELETE FROM prizes WHERE roulette_id = ?", args: [id] },
			{ sql: "DELETE FROM roulettes WHERE id = ?", args: [id] },
		],
		"write",
	);
}

export async function setActiveRoulette(id: number): Promise<void> {
	const db = await getDb();

	const exists = await db.execute({
		sql: "SELECT id FROM roulettes WHERE id = ?",
		args: [id],
	});
	if (exists.rows.length === 0) throw new Error("Roulette not found");

	const sectorResult = await db.execute({
		sql: "SELECT sector_index FROM prizes WHERE roulette_id = ? AND sector_index IS NOT NULL",
		args: [id],
	});
	const sectors = sectorResult.rows
		.map((row) => Number(row.sector_index))
		.filter((sector) => isValidSectorIndex(sector));

	if (
		sectors.length !== WHEEL_SECTOR_COUNT ||
		new Set(sectors).size !== WHEEL_SECTOR_COUNT
	) {
		throw new Error(
			"La plantilla necesita los 6 sectores configurados para poder activarse.",
		);
	}

	await db.batch(
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

	const db = await getDb();
	const result = await db.execute({
		sql: "SELECT image FROM prizes WHERE id = ?",
		args: [id],
	});

	const value = result.rows[0]?.image;
	return value == null || String(value) === "" ? null : String(value);
}

/**
 * Devuelve la calibraci�n global de la ruleta (fila �nica id=1).
 * La tabla y su fila por defecto se crean en `ensureInitialized`.
 */
export async function getWheelCalibration(): Promise<WheelCalibration> {
	const db = await getDb();
	const result = await db.execute({
		sql: "SELECT alignment_offset, initial_angle, disk_offset_x, disk_offset_y, disk_scale, disk_rotation, center_offset_x, center_offset_y, center_scale FROM wheel_settings WHERE id = 1",
		args: [],
	});

	const row = result.rows[0];
	return {
		alignmentOffset:
			row == null
				? WHEEL_DEFAULT_ALIGNMENT_OFFSET
				: Number(row.alignment_offset),
		initialAngle:
			row == null ? WHEEL_DEFAULT_INITIAL_ANGLE : Number(row.initial_angle),
		diskOffsetX:
			row == null || row.disk_offset_x == null
				? WHEEL_DEFAULT_DISK_OFFSET_X
				: Number(row.disk_offset_x),
		diskOffsetY:
			row == null || row.disk_offset_y == null
				? WHEEL_DEFAULT_DISK_OFFSET_Y
				: Number(row.disk_offset_y),
		diskScale:
			row == null || row.disk_scale == null
				? WHEEL_DEFAULT_DISK_SCALE
				: Number(row.disk_scale),
		diskRotation:
			row == null || row.disk_rotation == null
				? WHEEL_DEFAULT_DISK_ROTATION
				: Number(row.disk_rotation),
		centerOffsetX:
			row == null || row.center_offset_x == null
				? WHEEL_DEFAULT_CENTER_OFFSET_X
				: Number(row.center_offset_x),
		centerOffsetY:
			row == null || row.center_offset_y == null
				? WHEEL_DEFAULT_CENTER_OFFSET_Y
				: Number(row.center_offset_y),
		centerScale:
			row == null || row.center_scale == null
				? WHEEL_DEFAULT_CENTER_SCALE
				: Number(row.center_scale),
	};
}

/** Guarda la calibraci�n global de la ruleta (upsert de la fila id=1). */
export async function saveWheelCalibration(
	calibration: WheelCalibration,
): Promise<WheelCalibration> {
	const db = await getDb();
	await db.execute({
		sql: `INSERT INTO wheel_settings (id, alignment_offset, initial_angle, disk_offset_x, disk_offset_y, disk_scale, disk_rotation, center_offset_x, center_offset_y, center_scale, updated_at)
                VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  alignment_offset = excluded.alignment_offset,
                  initial_angle = excluded.initial_angle,
                  disk_offset_x = excluded.disk_offset_x,
                  disk_offset_y = excluded.disk_offset_y,
                  disk_scale = excluded.disk_scale,
                  disk_rotation = excluded.disk_rotation,
                  center_offset_x = excluded.center_offset_x,
                  center_offset_y = excluded.center_offset_y,
                  center_scale = excluded.center_scale,
                  updated_at = excluded.updated_at`,
		args: [
			calibration.alignmentOffset,
			calibration.initialAngle,
			calibration.diskOffsetX,
			calibration.diskOffsetY,
			calibration.diskScale,
			calibration.diskRotation,
			calibration.centerOffsetX,
			calibration.centerOffsetY,
			calibration.centerScale,
			new Date().toISOString(),
		],
	});
	return calibration;
}
