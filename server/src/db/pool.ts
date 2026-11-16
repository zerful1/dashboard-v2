import { Pool, type PoolClient } from "pg";
import { config } from "../config";
import { sslFor } from "./ssl";

/** Runtime pool on the TRANSACTION pooler: no `options` search_path there, so queries use `T`. */
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: sslFor(config.DATABASE_URL),
  // Low: the pooler has a connection ceiling and every warm serverless instance opens its own pool.
  max: config.isProduction ? 5 : 10,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

// A pool-level error is emitted on the pool, not a query; with no listener Node crashes the process.
pool.on("error", (err) => {
  console.error("Unexpected idle client error:", err.message);
});

/** Runs `fn` in a transaction (one backend for its whole life), committing or rolling back on throw. */
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
