import { Pool, type PoolClient } from "pg";
import { config } from "../config";
import { sslFor } from "./ssl";

/**
 * Runtime connection pool, pointed at Supabase's TRANSACTION pooler.
 *
 * Deliberately no `options: '-c search_path=...'`. Transaction-mode pooling does not
 * guarantee the same backend between statements, so connection-level state is not
 * dependable; queries carry their schema via `T` in config.ts instead. Supavisor's
 * handling of the `options` startup parameter is also in flux, which is a second
 * reason not to build on it.
 */
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: sslFor(config.DATABASE_URL),
  // Kept low in production: the pooler has a connection ceiling and every warm
  // serverless instance opens a pool of its own.
  max: config.isProduction ? 5 : 10,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

// A pool-level error (a backend dropped while idle) is emitted on the pool, not on
// any query. Without a listener Node treats it as an unhandled 'error' event and
// crashes the process.
pool.on("error", (err) => {
  console.error("Unexpected idle client error:", err.message);
});

/**
 * Run `fn` inside a transaction, committing on success and rolling back on throw.
 *
 * Transaction mode guarantees one backend for the life of a transaction, so
 * multi-statement work is safe here in a way that loose sequential queries are not.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection is already broken; the original error is the useful one.
    }
    throw err;
  } finally {
    client.release();
  }
}
