import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app";

/**
 * Every list a request can carry has a ceiling. The two reorders had none, so
 * the 1 MB body limit was the only bound: about 25,000 ids, each one validated
 * and, for exercises, each one an UPDATE.
 */

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };

async function signedIn() {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(alice);
  return agent;
}

const ids = (n: number) => Array.from({ length: n }, () => randomUUID());

describe("reorder lists are bounded", () => {
  it("refuses an exercise order past 200 ids, and takes one at the limit", async () => {
    const agent = await signedIn();
    const res = await agent.post("/api/exercises/reorder").send({ day_type: 1, ordered_ids: ids(201) }).expect(400);
    expect(res.body.details).toHaveProperty("ordered_ids");
    // At the limit it is read: unknown ids match nothing and change nothing.
    await agent.post("/api/exercises/reorder").send({ day_type: 1, ordered_ids: ids(200) }).expect(200);
  });

  it("refuses a habit order past 500 ids as too long, not as the wrong list", async () => {
    const agent = await signedIn();
    const res = await agent.post("/api/habits/reorder").send({ ids: ids(501) }).expect(400);
    expect(res.body.message).toBe("Validation failed");
    // At the limit it reaches the repository, which refuses it for what it is.
    const wrong = await agent.post("/api/habits/reorder").send({ ids: ids(500) }).expect(400);
    expect(wrong.body.message).toBe("That isn't your full list of habits");
  });
});
