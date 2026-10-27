#!/usr/bin/env tsx
/**
 * Script de prueba para verificar conexión a MariaDB.
 * Run con: npx tsx backend/push-turso.ts
 */

import "./env";
import { getDb } from "./database";

async function main() {
  console.log("🔄 Verificando conexión a MariaDB...");

  const client = await getDb();

  const result = await client.execute("SELECT 1 as ok");
  console.log("✅ Conectado:", result.rows[0]);

  const tables = await client.execute(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
  );
  console.log("📋 Tablas:", tables.rows.map((r) => r.TABLE_NAME).join(", "));

  if (tables.rows.some((r) => r.TABLE_NAME === "roulettes")) {
    const count = await client.execute(
      "SELECT COUNT(*) as c FROM roulettes",
    );
    console.log(`🎰 Ruletas: ${count.rows[0].c}`);
  }
}

main().catch((err) => {
  console.error("❌ Error de conexión:", err);
  process.exit(1);
});