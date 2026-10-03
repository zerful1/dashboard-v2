import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { listTargets, insertTarget } from "../src/repositories/nutritionTargets";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };
const cut = { effective_from: "2026-06-09", goal_mode: "cut", calories: 2402, protein_g: 180, fat_g: 93, carbs_g: 210 };

async function signedIn(who: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who);
  return agent;
}

describe("nutrition targets", () => {
  it("requires a session", async () => {
    await request(app).get("/api/nutrition/targets").expect(401);
    await request(app).post("/api/nutrition/targets").send(cut).expect(401);
  });

  it("inserts dated rows and lists them newest first", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/nutrition/targets").send(cut).expect(201);
    await agent.post("/api/nutrition/targets").send({ ...cut, effective_from: "2026-09-23", calories: 2300 }).expect(201);

    const res = await agent.get("/api/nutrition/targets").expect(200);
    expect(res.body.map((t: { effective_from: string }) => t.effective_from)).toEqual(["2026-09-23", "2026-06-09"]);
  });

  // 9 June is inside BST: a Date-parsed value would come back as the 8th.
  it("returns effective_from as a plain, unshifted string", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/nutrition/targets").send(cut).expect(201);
    const res = await agent.get("/api/nutrition/targets").expect(200);
    expect(res.body[0].effective_from).toBe("2026-06-09");
  });

  it("rejects a malformed date, a zero calorie target and an unknown goal", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/nutrition/targets").send({ ...cut, effective_from: "09/06/2026" }).expect(400);
    await agent.post("/api/nutrition/targets").send({ ...cut, calories: 0 }).expect(400);
    await agent.post("/api/nutrition/targets").send({ ...cut, goal_mode: "shred" }).expect(400);
  });
});

describe("nutrition targets ownership scoping", () => {
  it("never lists another user's targets", async () => {
    await signedIn(alice);
    const bobAgent = await signedIn(bob);
    const aliceId = (await findUserByEmail(alice.email))!.id;
    const bobId = (await findUserByEmail(bob.email))!.id;

    await insertTarget(aliceId, cut as never);

    expect((await bobAgent.get("/api/nutrition/targets").expect(200)).body).toEqual([]);
    expect(await listTargets(bobId)).toEqual([]);
    expect(await listTargets(aliceId)).toHaveLength(1);
  });
});
