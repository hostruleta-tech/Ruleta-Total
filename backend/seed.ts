#!/usr/bin/env tsx
/**
 * Seed script to initialize MariaDB database with the current roulette data.
 * Run with: npm run db:seed
 * Requires MARIADB_DATABASE, MARIADB_USER, MARIADB_PASSWORD in environment.
 */

import "./env";
import { getDb } from "./database";
import { SEED_TEMPLATES } from "./seed-data";
import mysql from "mysql2/promise";

async function main() {
	const connection = await mysql.createConnection({
		host: process.env.MARIADB_HOST ?? "127.0.0.1",
		port: Number(process.env.MARIADB_PORT ?? 3306),
		database: process.env.MARIADB_DATABASE,
		user: process.env.MARIADB_USER,
		password: process.env.MARIADB_PASSWORD,
	});

	try {
		const [rows] = await connection.execute(
			"SELECT COUNT(*) AS total FROM roulettes",
		);
		const total = Number((rows as any)[0].total ?? 0);
		console.log(`Total plantillas en base: ${total}`);

		if (total === 0) {
			for (const template of SEED_TEMPLATES) {
				await connection.execute(
					"INSERT INTO roulettes (name, is_active) VALUES (?, ?)",
					[template.name, template.isActive ? 1 : 0],
				);

				const [insertedResult] = await connection.execute(
					"SELECT LAST_INSERT_ID() AS id FROM roulettes",
				);
				const insertedRows = insertedResult as any[];
				const rouletteId = Number(insertedRows[0]?.id ?? 0);

				if (template.prizes.length > 0) {
					for (const prize of template.prizes) {
						await connection.execute(
							`INSERT INTO prizes
                            (roulette_id, name, backgroundColor, probability, image, is_spin_again, sector_index)
                            VALUES (?, ?, ?, ?, NULL, ?, ?)`,
							[
								rouletteId,
								prize.name,
								prize.backgroundColor,
								prize.probability,
								prize.isSpinAgain ? 1 : 0,
								prize.sectorIndex,
							],
						);
					}
				}
				console.log(`Seed plantilla: ${template.name}`);
			}
			console.log("Base vacía: plantillas iniciales creadas.");
		} else {
			console.log(`Base no vacía (${total} plantillas). Saliendo.`);
		}
	} finally {
		await connection.end();
	}
}

main().catch((error) => {
	console.error("[seed] Error:", error);
	process.exit(1);
});