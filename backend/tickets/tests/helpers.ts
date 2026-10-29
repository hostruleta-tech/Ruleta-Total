import { createClient } from "@libsql/client";
import { runMigrations } from "../../migrations";
import type { DbClient } from "../../database";

export const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
export const TEST_BASE_URL = "https://ruleta.test";
export const TEST_PASSWORD = "clave-de-prueba";

const ENV_KEYS = [
	"TICKET_ENCRYPTION_KEY",
	"PUBLIC_APP_URL",
	"OPERATOR_PASSWORD",
	"VERCEL_PROJECT_PRODUCTION_URL",
	"NODE_ENV",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];
type SavedEnv = Partial<Record<EnvKey, string>>;

export function setTestEnv(): SavedEnv {
	const saved: SavedEnv = {};
	for (const key of ENV_KEYS) {
		if (process.env[key] !== undefined) saved[key] = process.env[key];
	}

	process.env.TICKET_ENCRYPTION_KEY = TEST_KEY;
	process.env.PUBLIC_APP_URL = TEST_BASE_URL;
	process.env.OPERATOR_PASSWORD = TEST_PASSWORD;
	delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
	process.env.NODE_ENV = "test";

	return saved;
}

export function restoreEnv(saved: SavedEnv): void {
	for (const key of ENV_KEYS) {
		const value = saved[key];
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

/** Crea un cliente de BD en memoria para tests y ejecuta migraciones. */
export async function createTestDb(): Promise<DbClient> {
	const client = createClient({ url: ":memory:" });

	const db: DbClient = {
		async execute(input: string | { sql: string; args?: unknown[] }) {
			const sql = typeof input === "string" ? input : input.sql;
			const args = typeof input === "string" ? [] : (input.args ?? []);
			const result = await client.execute({ sql, args: args as any[] });
			return { rows: result.rows as Record<string, unknown>[], rowsAffected: result.rowsAffected ?? 0 };
		},
		async batch(statements, _mode) {
			await client.batch(statements.map((s) => ({ sql: s.sql, args: s.args as any[] })));
		},
	};

	// Ejecutar migraciones del sistema de tickets
	await runMigrations(db);

	return db;
}

export function tokenFromParticipationUrl(url: string): string {
	const parsed = new URL(url);
	const token = new URLSearchParams(parsed.hash.replace(/^#/, "")).get("t");
	if (!token) throw new Error("La URL de prueba no contiene token.");
	return token;
}
