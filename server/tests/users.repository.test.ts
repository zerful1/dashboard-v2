import { describe, it, expect } from "vitest";
import {
  createUserWithProfile,
  findUserByEmail,
  findUserById,
  findUserByIdWithPassword,
} from "../src/repositories/users";
import { hashPassword, verifyPassword, DUMMY_HASH } from "../src/services/password";
import { Conflict } from "../src/errors";
import { pool } from "../src/db/pool";
import { T } from "../src/config";

describe("users repository", () => {
  it("creates a user and finds them by email", async () => {
    const hash = await hashPassword("correct horse battery staple");
    const created = await createUserWithProfile("Alice@Example.COM", hash);

    expect(created.email).toBe("alice@example.com");

    const found = await findUserByEmail("alice@example.com");
    expect(found?.id).toBe(created.id);
  });

  it("creates the profile row in the same transaction", async () => {
    const hash = await hashPassword("pw-12345678");
    const created = await createUserWithProfile("prof@example.com", hash);

    const { rows } = await pool.query(
      `SELECT user_id FROM ${T.profiles} WHERE user_id = $1`,
      [created.id],
    );
    expect(rows).toHaveLength(1);
  });

  it("treats email as case-insensitive on lookup", async () => {
    const hash = await hashPassword("pw-12345678");
    await createUserWithProfile("bob@example.com", hash);

    expect(await findUserByEmail("BOB@EXAMPLE.COM")).not.toBeNull();
  });

  it("rejects a duplicate email with Conflict", async () => {
    const hash = await hashPassword("pw-12345678");
    await createUserWithProfile("dup@example.com", hash);

    await expect(createUserWithProfile("DUP@example.com", hash)).rejects.toBeInstanceOf(
      Conflict,
    );
  });

  it("leaves no orphan user when the duplicate insert rolls back", async () => {
    const hash = await hashPassword("pw-12345678");
    await createUserWithProfile("once@example.com", hash);
    await expect(createUserWithProfile("once@example.com", hash)).rejects.toThrow();

    const { rows } = await pool.query(`SELECT id FROM ${T.users} WHERE email = $1`, [
      "once@example.com",
    ]);
    expect(rows).toHaveLength(1);
  });

  it("returns null for an unknown id", async () => {
    expect(await findUserById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("stores a verifiable hash and never the plaintext", async () => {
    const hash = await hashPassword("s3cret-passphrase");
    const created = await createUserWithProfile("carol@example.com", hash);
    const row = (await findUserByIdWithPassword(created.id))!;

    expect(row.password_hash).not.toContain("s3cret-passphrase");
    expect(await verifyPassword(row.password_hash, "s3cret-passphrase")).toBe(true);
    expect(await verifyPassword(row.password_hash, "wrong")).toBe(false);
  });

  it("keeps the hash out of routine reads", async () => {
    const hash = await hashPassword("s3cret-passphrase");
    const created = await createUserWithProfile("dave@example.com", hash);

    const safe = await findUserById(created.id);
    expect(safe).not.toBeNull();
    expect("password_hash" in safe!).toBe(false);
  });
});

describe("password service", () => {
  it("produces a different hash for the same input each time", async () => {
    // Distinct salts — identical passwords must not produce identical hashes, or
    // a leaked table reveals which users share one.
    const a = await hashPassword("same-password-1");
    const b = await hashPassword("same-password-1");
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "same-password-1")).toBe(true);
    expect(await verifyPassword(b, "same-password-1")).toBe(true);
  });

  it("returns false rather than throwing on a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    expect(await verifyPassword("", "anything")).toBe(false);
  });

  it("DUMMY_HASH is a real verifiable hash that matches nothing plausible", async () => {
    // If this were malformed, verify would throw, be caught, and return early —
    // reopening the timing gap it exists to close.
    expect(DUMMY_HASH.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(DUMMY_HASH, "not-a-real-password")).toBe(true);
    expect(await verifyPassword(DUMMY_HASH, "anything-else")).toBe(false);
  });
});
