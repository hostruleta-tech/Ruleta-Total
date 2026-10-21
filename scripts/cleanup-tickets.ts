#!/usr/bin/env tsx
/**
 * Script de limpieza masiva de tickets creados por el bucle.
 *
 * Uso:
 *   npx tsx scripts/cleanup-tickets.ts           # Dry-run (solo muestra qué haría)
 *   npx tsx scripts/cleanup-tickets.ts --execute # Ejecuta de verdad
 *
 * Qué hace:
 * 1. Exporta TODOS los tickets a CSV (backup) en ./backups/
 * 2. Identifica tickets del "bucle": creados entre 2026-10-21 18:53 UTC y ahora,
 *    sin etiqueta (label=null), 1 ticket por lote, estado 'available'.
 * 3. Opción A: Borra esos lotes y tickets (limpio total).
 * 4. Opción B: Los marca como 'void' (anulados) - conserva auditoría.
 *
 * Conserva SIEMPRE:
 * - Tickets canjeados (redeemed) - 3 con premios
 * - Lotes con más de 1 ticket (los 2 originales)
 * - Lotes con etiqueta ("tienda", "hola")
 */

import { createClient } from "@libsql/client";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { config } from "dotenv";

// Cargar .env igual que el backend
for (const path of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "..", ".env")]) {
	if (existsSync(path)) { config({ path }); break; }
}

const DRY_RUN = !process.argv.includes("--execute");
const VOID_INSTEAD_OF_DELETE = process.argv.includes("--void"); // por defecto borra

const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
	console.error("❌ Falta TURSO_DATABASE_URL o TURSO_AUTH_TOKEN en .env");
	process.exit(1);
}

const client = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });

interface TicketRow {
	id: string;
	batch_id: string;
	status: string;
	prize_name: string | null;
	redeemed_at: string | null;
	created_at: string;
}

interface BatchRow {
	id: string;
	label: string | null;
	expires_at: string | null;
	created_at: string;
}

async function main() {
	console.log(`\n=== LIMPIEZA DE TICKETS ${DRY_RUN ? "(DRY-RUN - solo simulación)" : "(EJECUTANDO)"} ===`);
	if (VOID_INSTEAD_OF_DELETE) console.log("Modo: ANULAR (void) en lugar de borrar\n");

	// 1. Leer todos los tickets y lotes
	const [ticketsRes, batchesRes] = await Promise.all([
		client.execute("SELECT id, batch_id, status, prize_name, redeemed_at, created_at FROM tickets ORDER BY created_at"),
		client.execute("SELECT id, label, expires_at, created_at FROM ticket_batches ORDER BY created_at"),
	]);

	const tickets: TicketRow[] = ticketsRes.rows as unknown as TicketRow[];
	const batches: BatchRow[] = batchesRes.rows as unknown as BatchRow[];

	console.log(`📊 Total tickets: ${tickets.length}`);
	console.log(`📦 Total lotes: ${batches.length}`);

	// 2. Backup CSV completo ANTES de tocar nada
	const backupDir = join(process.cwd(), "backups");
	if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupFile = join(backupDir, `tickets-backup-${timestamp}.csv`);

	const csvHeader = "id,batch_id,status,prize_name,redeemed_at,created_at,batch_label,batch_expires_at,batch_created_at\n";
	const csvRows = tickets.map(t => {
		const b = batches.find(x => x.id === t.batch_id);
		return [
			t.id, t.batch_id, t.status, t.prize_name ?? "", t.redeemed_at ?? "", t.created_at,
			b?.label ?? "", b?.expires_at ?? "", b?.created_at ?? ""
		].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
	}).join("\n");

	writeFileSync(backupFile, csvHeader + csvRows + "\n", "utf8");
	console.log(`\n💾 Backup guardado en: ${backupFile}`);

	// 3. Identificar lotes del bucle
	// Ventana: desde 2026-10-21 18:53 UTC (inicio del pico) hasta ahora
	const LOOP_START = "2026-10-21T18:53:00Z";

	// Lotes candidatos: sin etiqueta, creados en la ventana, con 1 solo ticket
	const batchTickets = new Map<string, number>();
	for (const t of tickets) {
		batchTickets.set(t.batch_id, (batchTickets.get(t.batch_id) ?? 0) + 1);
	}

	const loopBatchIds = new Set<string>();
	for (const b of batches) {
		if (b.label) continue; // tiene etiqueta -> conservar
		if (b.created_at < LOOP_START) continue; // antes del bucle -> conservar
		if ((batchTickets.get(b.id) ?? 0) !== 1) continue; // no es 1 por lote -> conservar
		// Verificar que su ticket sea 'available' (no canjeado)
		const t = tickets.find(x => x.batch_id === b.id);
		if (!t || t.status !== "available") continue; // canjeado -> conservar
		loopBatchIds.add(b.id);
	}

	const loopTickets = tickets.filter(t => loopBatchIds.has(t.batch_id));
	console.log(`\n🎯 Lotes del bucle detectados: ${loopBatchIds.size}`);
	console.log(`🎯 Tickets del bucle: ${loopTickets.length}`);

	if (loopBatchIds.size === 0) {
		console.log("✅ Nada que limpiar.");
		return;
	}

	// Mostrar muestra
	console.log("\nPrimeros 5 lotes a procesar:");
	for (const id of Array.from(loopBatchIds).slice(0, 5)) {
		const b = batches.find(x => x.id === id)!;
		const t = tickets.find(x => x.batch_id === id)!;
		console.log(`  ${id.slice(0,8)} | ${b.created_at} | label="${b.label}" | status=${t.status}`);
	}

	if (DRY_RUN) {
		console.log("\n🔍 DRY-RUN: no se modificó nada. Ejecuta con --execute para aplicar.");
		console.log("   Opciones: --execute (borra)  |  --execute --void (anula en vez de borrar)");
		return;
	}

	// 4. Ejecutar limpieza
	let deletedBatches = 0;
	let deletedTickets = 0;
	let voidedTickets = 0;

	if (VOID_INSTEAD_OF_DELETE) {
		// Anular tickets (actualizar status a 'void')
		for (const batchId of loopBatchIds) {
			const t = tickets.find(x => x.batch_id === batchId)!;
			await client.execute({
				sql: "UPDATE tickets SET status = 'void' WHERE id = ?",
				args: [t.id],
			});
			voidedTickets++;
		}
		console.log(`\n✅ Anulados ${voidedTickets} tickets (status -> void). Lotes intactos.`);
	} else {
		// Borrar tickets y lotes EN BATCH (una sola query cada uno)
		const ids = Array.from(loopBatchIds);
		if (ids.length > 0) {
			const placeholders = ids.map(() => "?").join(",");
			// Borrar todos los tickets de esos lotes
			await client.execute({
				sql: `DELETE FROM tickets WHERE batch_id IN (${placeholders})`,
				args: ids,
			});
			// Borrar los lotes
			await client.execute({
				sql: `DELETE FROM ticket_batches WHERE id IN (${placeholders})`,
				args: ids,
			});
			deletedBatches = ids.length;
			// Contar tickets borrados
			for (const id of ids) deletedTickets += batchTickets.get(id) ?? 0;
		}
		console.log(`\n🗑️ Eliminados ${deletedBatches} lotes y ${deletedTickets} tickets.`);
	}

	// 5. Verificación final
	const [finalTickets, finalBatches] = await Promise.all([
		client.execute("SELECT COUNT(*) as n FROM tickets"),
		client.execute("SELECT COUNT(*) as n FROM ticket_batches"),
	]);

	console.log(`\n📊 Estado final:`);
	console.log(`   Tickets: ${finalTickets.rows[0].n} (antes: ${tickets.length})`);
	console.log(`   Lotes:   ${finalBatches.rows[0].n} (antes: ${batches.length})`);

	client.close();
}

main().catch(e => {
	console.error("❌ Error:", e);
	client.close();
	process.exit(1);
});