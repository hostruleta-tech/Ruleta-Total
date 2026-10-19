#!/usr/bin/env tsx
/**
 * Quick test to verify Turso connection works.
 * Run with: npm run db:push (or tsx backend/push-turso.ts)
 */

import "./env";
import { createClient } from "@libsql/client/web";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error("❌ TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set");
    process.exit(1);
  }

  const client = createClient({ url, authToken });

  console.log("🔄 Testing Turso connection...");

  const result = await client.execute({ sql: "SELECT 1 as ok", args: [] });
  console.log("✅ Connected:", result.rows[0]);

  const tables = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    args: [],
  });
  console.log("📋 Tables:", tables.rows.map((r) => r.name).join(", "));

  if (tables.rows.some((r) => r.name === "roulettes")) {
    const count = await client.execute({ sql: "SELECT COUNT(*) as c FROM roulettes", args: [] });
    console.log(`🎰 Roulettes: ${count.rows[0].c}`);
  }
}

main().catch((err) => {
  console.error("❌ Connection test failed:", err);
  process.exit(1);
});