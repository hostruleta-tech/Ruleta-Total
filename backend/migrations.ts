import type { Client, InStatement } from "@libsql/client";

interface Migration {
	id: string;
	statements: string[];
}

/**
 * Migraciones idempotentes en TypeScript.
 *
 * Se mantienen en código (no en archivos .sql) para que funcionen igual en
 * local y en la función serverless de Vercel, donde `backend/dist` no
 * incluye archivos que no sean JavaScript compilado.
 */
const MIGRATIONS: readonly Migration[] = [
	{
		id: "001_ticket_batches",
		statements: [
			`
        CREATE TABLE IF NOT EXISTS ticket_batches (
          id TEXT PRIMARY KEY,
          label TEXT,
          quantity INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT
        )
      `,
			`
        CREATE INDEX IF NOT EXISTS idx_ticket_batches_created_at
        ON ticket_batches (created_at)
      `,
		],
	},
	{
		id: "002_tickets",
		statements: [
			`
        CREATE TABLE IF NOT EXISTS tickets (
          id TEXT PRIMARY KEY,
          batch_id TEXT,
          token_hash TEXT NOT NULL UNIQUE,
          token_encrypted TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'available'
            CHECK (status IN ('available', 'reserved', 'redeemed', 'expired', 'void')),
          created_at TEXT NOT NULL,
          expires_at TEXT,
          reserved_at TEXT,
          reserved_until TEXT,
          redeemed_at TEXT,
          FOREIGN KEY (batch_id) REFERENCES ticket_batches (id) ON DELETE SET NULL
        )
      `,
			"CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status)",
			"CREATE INDEX IF NOT EXISTS idx_tickets_batch_id ON tickets (batch_id)",
			"CREATE INDEX IF NOT EXISTS idx_tickets_expires_at ON tickets (expires_at)",
		],
	},
	{
		id: "003_ticket_prize_fields",
		statements: [
			`
        ALTER TABLE tickets ADD COLUMN prize_id INTEGER
      `,
			`
        ALTER TABLE tickets ADD COLUMN prize_name TEXT
      `,
			`
        ALTER TABLE tickets ADD COLUMN roulette_id INTEGER
      `,
			"CREATE INDEX IF NOT EXISTS idx_tickets_reserved_until ON tickets (reserved_until)",
		],
	},
];

/**
 * Aplica las migraciones pendientes y devuelve sus identificadores.
 * Es seguro llamarla en cada arranque: la tabla `schema_migrations`
 * evita repetir trabajo.
 */
export async function runMigrations(client: Client): Promise<string[]> {
	await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

	const appliedResult = await client.execute(
		"SELECT id FROM schema_migrations",
	);
	const applied = new Set(appliedResult.rows.map((row) => String(row.id)));
	const newlyApplied: string[] = [];

	for (const migration of MIGRATIONS) {
		if (applied.has(migration.id)) continue;

		const statements: InStatement[] = migration.statements.map((sql) => ({
			sql,
			args: [],
		}));
		statements.push({
			sql: "INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)",
			args: [migration.id, new Date().toISOString()],
		});

		// El lote es atómico: o se crean las tablas y se registra la migración,
		// o no se aplica nada.
		await client.batch(statements, "write");
		newlyApplied.push(migration.id);
	}

	return newlyApplied;
}
