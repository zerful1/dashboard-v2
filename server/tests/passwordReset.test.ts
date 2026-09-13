import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { createResetToken, consumeResetToken } from "../src/repositories/passwordResets";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const creds = { email: "alice@example.com", password: "correct-horse-9" };
const other = { email: "bob@example.com", password: "correct-horse-9" };

describe("change password", () => {
  it("changes it and lets the new password log in", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);

    await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: creds.password, newPassword: "brand-new-pw-1" })
      .expect(204);

    await request(app)
      .post("/api/auth/login")
      .send({ email: creds.email, password: "brand-new-pw-1" })
      .expect(200);

    await request(app).post("/api/auth/login").send(creds).expect(401);
  });

  it("rejects a wrong current password", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);

    await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "not-it-at-all", newPassword: "brand-new-pw-1" })
      .expect(401);
  });

  it("requires a session", async () => {
    await request(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: "x", newPassword: "brand-new-pw-1" })
      .expect(401);
  });

  it("rejects a too-short new password", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);
    await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: creds.password, newPassword: "short" })
      .expect(400);
  });

  it("signs out other devices but keeps the caller signed in", async () => {
    const deviceA = request.agent(app);
    await deviceA.post("/api/auth/register").send(creds);

    const deviceB = request.agent(app);
    await deviceB.post("/api/auth/login").send(creds);
    await deviceB.get("/api/auth/me").expect(200);

    await deviceA
      .post("/api/auth/change-password")
      .send({ currentPassword: creds.password, newPassword: "brand-new-pw-1" })
      .expect(204);

    await deviceB.get("/api/auth/me").expect(401);
    await deviceA.get("/api/auth/me").expect(200);
  });

  it("leaves another user's sessions alone", async () => {
    const alice = request.agent(app);
    await alice.post("/api/auth/register").send(creds);
    const bob = request.agent(app);
    await bob.post("/api/auth/register").send(other);

    await alice
      .post("/api/auth/change-password")
      .send({ currentPassword: creds.password, newPassword: "brand-new-pw-1" })
      .expect(204);

    await bob.get("/api/auth/me").expect(200);
  });
});

describe("forgot password", () => {
  it("returns 204 for an unknown email so accounts cannot be enumerated", async () => {
    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" })
      .expect(204);

    const { rows } = await pool.query(`SELECT id FROM ${T.passwordResetTokens}`);
    expect(rows).toHaveLength(0);
  });

  it("issues a token for a known email", async () => {
    await request(app).post("/api/auth/register").send(creds);
    await request(app).post("/api/auth/forgot-password").send({ email: creds.email }).expect(204);

    const { rows } = await pool.query(`SELECT id FROM ${T.passwordResetTokens}`);
    expect(rows).toHaveLength(1);
  });
});

describe("reset password", () => {
  it("stores only a hash of the token, never the raw value", async () => {
    await request(app).post("/api/auth/register").send(creds);
    const user = (await findUserByEmail(creds.email))!;

    const raw = await createResetToken(user.id);
    const { rows } = await pool.query<{ token_hash: string }>(
      `SELECT token_hash FROM ${T.passwordResetTokens} WHERE user_id = $1`,
      [user.id],
    );

    expect(rows[0]!.token_hash).not.toBe(raw);
    expect(rows[0]!.token_hash).toHaveLength(64);
  });

  it("resets with a valid token", async () => {
    await request(app).post("/api/auth/register").send(creds);
    const user = (await findUserByEmail(creds.email))!;
    const raw = await createResetToken(user.id);

    await request(app)
      .post("/api/auth/reset-password")
      .send({ token: raw, newPassword: "reset-password-7" })
      .expect(204);

    await request(app)
      .post("/api/auth/login")
      .send({ email: creds.email, password: "reset-password-7" })
      .expect(200);
  });

  it("signs out every device", async () => {
    const device = request.agent(app);
    await device.post("/api/auth/register").send(creds);
    await device.get("/api/auth/me").expect(200);

    const user = (await findUserByEmail(creds.email))!;
    const raw = await createResetToken(user.id);

    await request(app)
      .post("/api/auth/reset-password")
      .send({ token: raw, newPassword: "reset-password-7" })
      .expect(204);

    await device.get("/api/auth/me").expect(401);
  });

  it("refuses to reuse a token", async () => {
    await request(app).post("/api/auth/register").send(creds);
    const user = (await findUserByEmail(creds.email))!;
    const raw = await createResetToken(user.id);

    expect(await consumeResetToken(raw)).toBe(user.id);
    expect(await consumeResetToken(raw)).toBeNull();
  });

  it("rejects an expired token", async () => {
    await request(app).post("/api/auth/register").send(creds);
    const user = (await findUserByEmail(creds.email))!;
    const raw = await createResetToken(user.id);

    await pool.query(
      `UPDATE ${T.passwordResetTokens}
          SET expires_at = now() - interval '1 minute'
        WHERE user_id = $1`,
      [user.id],
    );

    expect(await consumeResetToken(raw)).toBeNull();
  });

  it("rejects a well-formed but unknown token through the endpoint", async () => {
    await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "f".repeat(64), newPassword: "reset-password-7" })
      .expect(400);
  });

  it("rejects a malformed token at validation", async () => {
    await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "too-short", newPassword: "reset-password-7" })
      .expect(400);
  });
});

describe("password reset tokens — the repository's guarantees", () => {
  async function aUser() {
    await request(app).post("/api/auth/register").send(creds);
    return (await findUserByEmail(creds.email))!;
  }

  it("stores exactly the SHA-256 of the raw token, not merely something different", async () => {
    // The existing test asserts the stored value is not the raw token and is 64
    // characters — which any other 64-char string would satisfy. This pins the
    // actual derivation, so a change of algorithm cannot pass unnoticed.
    const user = await aUser();
    const raw = await createResetToken(user.id);

    const { rows } = await pool.query<{ token_hash: string }>(
      `SELECT token_hash FROM ${T.passwordResetTokens} WHERE user_id = $1`,
      [user.id],
    );
    expect(rows[0]!.token_hash).toBe(createHash("sha256").update(raw).digest("hex"));
  });

  it("returns null for an unknown token at the repository, not just the route", async () => {
    await aUser();
    // Well-formed but never issued. The route's 400 could come from validation;
    // this proves the repository itself refuses it.
    expect(await consumeResetToken("a".repeat(64))).toBeNull();
  });

  it("lets exactly one of two concurrent consumers win", async () => {
    // The property UPDATE ... RETURNING exists for. A read-then-write would let
    // both callers see used_at IS NULL and both succeed — two password resets
    // from one emailed link.
    const user = await aUser();
    const raw = await createResetToken(user.id);

    // WARM TWO CONNECTIONS FIRST, or this test proves nothing.
    //
    // Without it the pool holds one idle client: the first call takes it and
    // the second waits on a NEW connection being established, which costs long
    // enough for the first to finish both statements. The calls never overlap,
    // and a read-then-write implementation passes this test unchanged —
    // measured, not assumed. With both clients warm the reads genuinely
    // interleave, and the broken version returns the user id twice.
    const [c1, c2] = await Promise.all([pool.connect(), pool.connect()]);
    c1.release();
    c2.release();

    const results = await Promise.all([consumeResetToken(raw), consumeResetToken(raw)]);

    expect(results.filter((r) => r !== null)).toEqual([user.id]);
    expect(results.filter((r) => r === null)).toHaveLength(1);
  });

  it("scopes to the token, so one user's token never resets another's password", async () => {
    // The ownership invariant for this repository: the token is the only thing
    // that identifies the account, so it must map to its own user and no other.
    const alice = await aUser();
    await request(app).post("/api/auth/register").send(other);
    const bob = (await findUserByEmail(other.email))!;

    const aliceToken = await createResetToken(alice.id);
    const bobToken = await createResetToken(bob.id);

    expect(await consumeResetToken(aliceToken)).toBe(alice.id);
    expect(await consumeResetToken(bobToken)).toBe(bob.id);
  });
});
