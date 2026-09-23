import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";
import { parseSignupPolicy, signupAllowed } from "../src/signups";

const alice = { email: "alice@example.com", password: "correct-horse-9" };

const userCount = async () =>
  (await pool.query<{ n: number }>(`SELECT count(*)::int n FROM ${T.users}`)).rows[0]!.n;

describe("parseSignupPolicy", () => {
  // Closed by default: an environment missing the variable must not reopen sign-ups.
  it("is closed when unset or empty", () => {
    for (const raw of [undefined, "", "   "]) {
      expect(signupAllowed(parseSignupPolicy(raw), "alice@example.com")).toBe(false);
    }
  });

  it("is open for *", () => {
    expect(signupAllowed(parseSignupPolicy("*"), "anyone@example.com")).toBe(true);
  });

  it("allows only the listed addresses, ignoring case and spaces", () => {
    const policy = parseSignupPolicy(" Demo@Example.com , you@local.test ");
    expect(signupAllowed(policy, "demo@example.com")).toBe(true);
    expect(signupAllowed(policy, "DEMO@EXAMPLE.COM")).toBe(true);
    expect(signupAllowed(policy, "you@local.test")).toBe(true);
    expect(signupAllowed(policy, "stranger@example.com")).toBe(false);
  });
});

describe("registration when sign-ups are closed", () => {
  const closed = createApp({ signups: parseSignupPolicy("") });

  it("refuses with 403 and creates nothing", async () => {
    const res = await request(closed).post("/api/auth/register").send(alice).expect(403);
    expect(res.body.message).toBe("Sign-ups are closed");
    expect(await userCount()).toBe(0);
  });

  it("still lets an existing account sign in", async () => {
    await request(createApp({ signups: parseSignupPolicy("*") }))
      .post("/api/auth/register")
      .send(alice)
      .expect(201);
    await request(closed).post("/api/auth/login").send(alice).expect(200);
  });

  // The positive complement: a policy that refused everyone would pass the
  // tests above on its own.
  it("lets a listed address register, and only that one", async () => {
    const listed = createApp({ signups: parseSignupPolicy("alice@example.com") });
    await request(listed).post("/api/auth/register").send(alice).expect(201);
    await request(listed)
      .post("/api/auth/register")
      .send({ ...alice, email: "bob@example.com" })
      .expect(403);
    expect(await userCount()).toBe(1);
  });
});
