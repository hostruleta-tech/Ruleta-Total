#!/usr/bin/env tsx
/**
 * Seed script to initialize Turso database with the current roulette data.
 * Run with: npm run db:seed
 * Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in environment.
 */

import "./env";
import { createClient } from "@libsql/client/web";
import { SEED_TEMPLATES } from "./seed-data";

async function main() {
	const url = process.env.TURSO_DATABASE_URL;
	const authToken = process.env.TURSO_AUTH_TOKEN;

	if (!url || !authToken) {
		console.error(
			"❌ TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in environment.",
		);
		console.error(
			"Create a database at https://turso.tech and add credentials to .env",
		);
		process.exit(1);
	}

	const client = createClient({ url, authToken });

	console.log("🔄 Connecting to Turso...");

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

	console.log("✅ Tables created/verified");

	for (const tmpl of SEED_TEMPLATES) {
		const existing = await client.execute({
			sql: "SELECT id FROM roulettes WHERE name = ?",
			args: [tmpl.name],
		});

		if (existing.rows.length > 0) {
			const rouletteId = Number(existing.rows[0].id);
			console.log(
				`⏭️  Template "${tmpl.name}" already exists (id: ${rouletteId})`,
			);
			continue;
		}

		const result = await client.execute({
			sql: "INSERT INTO roulettes (name, is_active) VALUES (?, ?)",
			args: [tmpl.name, tmpl.isActive ? 1 : 0],
		});
		const rouletteId = Number(result.lastInsertRowid ?? 0);

		if (tmpl.prizes.length > 0) {
			await client.batch(
				tmpl.prizes.map((prize) => ({
					sql: "INSERT INTO prizes (roulette_id, name, backgroundColor, probability) VALUES (?, ?, ?, ?)",
					args: [rouletteId, prize.name, prize.backgroundColor, prize.probability],
				})),
				"write",
			);
		}

		console.log(
			`✅ Created template "${tmpl.name}" (id: ${rouletteId}) with ${tmpl.prizes.length} prizes`,
		);
	}

	// Verify
	const count = await client.execute(
		"SELECT COUNT(*) AS c FROM roulettes",
	);
	const prizeCount = await client.execute(
		"SELECT COUNT(*) AS c FROM prizes",
	);
	console.log(
		`\n📊 Database now has ${count.rows[0].c} templates and ${prizeCount.rows[0].c} prizes`,
	);

	const active = await client.execute({
		sql: "SELECT * FROM roulettes WHERE is_active = 1 LIMIT 1",
		args: [],
	});
	if (active.rows.length > 0) {
		const activeTmpl = active.rows[0];
		const prizes = await client.execute({
			sql: "SELECT * FROM prizes WHERE roulette_id = ?",
			args: [activeTmpl.id],
		});
		console.log(
			`🎯 Active: "${activeTmpl.name}" with ${prizes.rows.length} prizes`,
		);
	}

	console.log("\n✨ Seed complete!");
}

main().catch((err) => {
	console.error("❌ Seed failed:", err);
	process.exit(1);
});
