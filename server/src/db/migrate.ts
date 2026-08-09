import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { config } from "../config";

const MIGRATIONS_DIR = join(__dirname, "migrations");

/**
 * Apply any unapplied .sql files, in filename order, to `schema`.
 *
 * Runs over the SESSION pooler on its own short-lived pool. Two reasons it must not
 * borrow the runtime pool:
 *
 *  1. The runtime pool points at the TRANSACTION pooler, where `SET search_path`
 *     does not survive between statements — the DDL would silently land in the
 *     wrong schema with no error.
 *  2. Owning the pool here means it can be closed before returning, so tests do not
 *     end with an open handle keeping vitest alive.
 */
export async function runMigrations(schema: string = config.DB_SCHEMA): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`Refusing to migrate unsafe schema name: ${schema}`);
  }

  const pool = new Pool({
    connectionString: config.MIGRATION_DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });

  try {
    const client = await pool.connect();
    try {
      // A schema name cannot be a bind parameter; the regex above is the guard.
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await client.query(`SET search_path TO "${schema}", public`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          name       text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const applied = new Set(
        (await client.query<{ name: string }>("SELECT name FROM _migrations")).rows.map(
          (r) => r.name,
        ),
      );

      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      let count = 0;
      for (const file of files) {
        if (applied.has(file)) continue;

        const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
        await client.query("BEGIN");
        try {
          // Re-set inside the transaction too. Session mode already persists it,
          // but this keeps the DDL correct even if the connection were recycled.
          await client.query(`SET LOCAL search_path TO "${schema}", public`);
          await client.query(sql);
          await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
          await client.query("COMMIT");
          console.log(`applied ${file} -> ${schema}`);
          count++;
        } catch (err) {
          await client.query("ROLLBACK");
          throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
        }
      }

      if (count === 0) console.log(`${schema}: up to date (${files.length} migrations)`);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
