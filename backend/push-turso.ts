#!/usr/bin/env tsx
/**
 * Script de prueba para verificar conexión a Turso/libSQL.
 * Run con: npx tsx backend/push-turso.ts
 */

import "./env";
import { getDb } from "./database";

async function main() {
  console.log("?? Verificando conexión a Turso...");

  const client = await getDb();

  const result = await client.execute("SELECT 1 as ok");
  console.log("? Conectado:", result.rows[0]);

  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  console.log("?? Tablas:", tables.rows.map((r) => r.name).join(", "));

  if (tables.rows.some((r) => r.name === "roulettes")) {
    const count = await client.execute(
      "SELECT COUNT(*) as c FROM roulettes",
    );
    console.log(`?? Ruletas: ${count.rows[0].c}`);
  }
}

main().catch((err) => {
  console.error("? Error de conexión:", err);
  process.exit(1);
});
