import { createClient, type Client } from "@libsql/client";
import { runMigrations } from "../../migrations";

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

export async function createTestClient(): Promise<Client> {
	const client = createClient({ url: ":memory:" });
	await runMigrations(client);
	return client;
}

export function tokenFromParticipationUrl(url: string): string {
	const parsed = new URL(url);
	const token = new URLSearchParams(parsed.hash.replace(/^#/, "")).get("t");
	if (!token) throw new Error("La URL de prueba no contiene token.");
	return token;
}
