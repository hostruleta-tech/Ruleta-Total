#!/usr/bin/env tsx
/**
 * Aplica las migraciones pendientes a la base de datos configurada.
 * Uso: npm run db:migrate
 */

import "./env";
import { runMigrations } from "./migrations";
import { getDb } from "./database";

async function main() {
	console.log("?? Aplicando migraciones...");

	const client = await getDb();

	const applied = await runMigrations(client);

	if (applied.length === 0) {
		console.log("? La base de datos ya está al día.");
	} else {
		for (const id of applied) {
			console.log(`? Migración aplicada: ${id}`);
		}
	}
}

main().catch((error) => {
	console.error(
		"? Error al aplicar migraciones:",
		error instanceof Error ? error.message : "desconocido",
	);
	process.exit(1);
});
