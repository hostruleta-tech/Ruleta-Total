#!/usr/bin/env tsx
/**
 * Aplica las migraciones pendientes a la base de datos configurada.
 * Uso: npm run db:migrate
 */

import "./env";
import { createClient } from "@libsql/client/web";
import { runMigrations } from "./migrations";

async function main() {
	const url = process.env.TURSO_DATABASE_URL;
	const authToken = process.env.TURSO_AUTH_TOKEN;

	if (!url || !authToken) {
		console.error(
			"❌ TURSO_DATABASE_URL y TURSO_AUTH_TOKEN deben estar configurados.",
		);
		process.exit(1);
	}

	const client = createClient({ url, authToken });
	console.log("🔄 Aplicando migraciones...");

	const applied = await runMigrations(client);

	if (applied.length === 0) {
		console.log("✅ La base de datos ya está al día.");
	} else {
		for (const id of applied) {
			console.log(`✅ Migración aplicada: ${id}`);
		}
	}

	client.close();
}

main().catch((error) => {
	console.error(
		"❌ Error al aplicar migraciones:",
		error instanceof Error ? error.message : "desconocido",
	);
	process.exit(1);
});
