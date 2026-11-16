import { pool, withTransaction } from "../db/pool";
import { T } from "../config";
import { Conflict } from "../errors";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export type SafeUser = Omit<UserRow, "password_hash">;

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Creates the user and their profile atomically, since a user without a profile breaks profile reads. */
export async function createUserWithProfile(
  email: string,
  passwordHash: string,
): Promise<{ id: string; email: string }> {
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; email: string }>(
        `INSERT INTO ${T.users} (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email`,
        [normaliseEmail(email), passwordHash],
      );
      const user = rows[0]!;
      await client.query(`INSERT INTO ${T.profiles} (user_id) VALUES ($1)`, [user.id]);
      return user;
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new Conflict("An account with that email already exists");
    }
    throw err;
  }
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT id, email, password_hash, created_at FROM ${T.users} WHERE email = $1`,
    [normaliseEmail(email)],
  );
  return rows[0] ?? null;
}

/** Routine lookup that deliberately does NOT select password_hash, so a route returning a whole row can't leak it. */
export async function findUserById(id: string): Promise<SafeUser | null> {
  const { rows } = await pool.query<SafeUser>(
    `SELECT id, email, created_at FROM ${T.users} WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Same lookup including the hash. Used only by change-password. */
export async function findUserByIdWithPassword(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT id, email, password_hash, created_at FROM ${T.users} WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Changes the password and invalidates every session of the user; the caller must regenerate its own session afterwards. */
export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`UPDATE ${T.users} SET password_hash = $2 WHERE id = $1`, [
      userId,
      passwordHash,
    ]);
    await client.query(`DELETE FROM ${T.session} WHERE sess->>'userId' = $1`, [userId]);
  });
}
