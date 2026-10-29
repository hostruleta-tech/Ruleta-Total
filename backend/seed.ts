#!/usr/bin/env tsx
/**
 * Seed script to initialize Turso database with the current roulette data.
 * La base de datos se auto-sembrada al arrancar si está vacía (ver database.ts).
 * Este script es para forzar el seed manualmente si es necesario.
 * Run with: npx tsx backend/seed.ts
 * Requiere DATABASE_URL y DATABASE_AUTH_TOKEN en el entorno.
 */

import "./env";
import { getDb } from "./database";

async function main() {
	console.log("?? Forzando seed de la base de datos Turso...");

	const client = await getDb();

	// El auto-seed ya se ejecuta en ensureInitialized(). Verificar que funcionó.
	const count = await client.execute("SELECT COUNT(*) AS total FROM roulettes");
	const total = Number(count.rows[0]?.total ?? 0);

	if (total > 0) {
		console.log(`? Base de datos lista con ${total} plantilla(s).`);
	} else {
		console.log("??  Base vacía. El auto-seed debería haberse ejecutado.");
	}

	// Mostrar tablas creadas
	const tables = await client.execute(
		"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
	);
	console.log("?? Tablas:", tables.rows.map((r) => r.name).join(", "));
}

main().catch((error) => {
	console.error("? [seed] Error:", error);
	process.exit(1);
});
