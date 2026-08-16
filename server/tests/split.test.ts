import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import { getSplit, saveSplit } from "../src/repositories/split";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

const custom = {
  days: [{ day_type: 1, label: "Full Body" }],
  week: [1, "rest", 1, "rest", 1, "rest", "rest"],
};

describe("split", () => {
  it("requires a session", async () => {
    await request(app).get("/api/split").expect(401);
    await request(app).put("/api/split").send(custom).expect(401);
  });

  it("returns DEFAULT_SPLIT when the user has never customised", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    const res = await agent.get("/api/split").expect(200);
    expect(res.body).toEqual(DEFAULT_SPLIT);
  });

  it("saves and returns a custom split", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    await agent.put("/api/split").send(custom).expect(200);
    const res = await agent.get("/api/split").expect(200);
    expect(res.body.days[0].label).toBe("Full Body");
  });

  it("upserts rather than creating a second row", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);

    await agent.put("/api/split").send(custom).expect(200);
    await agent
      .put("/api/split")
      .send({ ...custom, days: [{ day_type: 1, label: "Renamed" }] })
      .expect(200);

    const res = await agent.get("/api/split").expect(200);
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].label).toBe("Renamed");
  });

  it("rejects a week that is not exactly seven slots", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);
    await agent
      .put("/api/split")
      .send({ ...custom, week: [1, "rest", 1] })
      .expect(400);
  });

  it("rejects a week slot naming a day_type that does not exist", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);
    await agent
      .put("/api/split")
      .send({
        days: [{ day_type: 1, label: "Full Body" }],
        week: [1, 2, "rest", "rest", "rest", "rest", "rest"], // 2 is undefined
      })
      .expect(400);
  });
});

describe("split ownership scoping", () => {
  it("one user's split never reaches another", async () => {
    const aliceAgent = request.agent(app);
    await aliceAgent.post("/api/auth/register").send(alice);
    const bobAgent = request.agent(app);
    await bobAgent.post("/api/auth/register").send(bob);

    const aliceId = (await findUserByEmail(alice.email))!.id;
    await saveSplit(aliceId, custom as never);

    // Bob has never customised, so he must still get the default.
    const res = await bobAgent.get("/api/split").expect(200);
    expect(res.body).toEqual(DEFAULT_SPLIT);

    // And Bob saving must not touch Alice's row.
    await bobAgent
      .put("/api/split")
      .send({
        days: [{ day_type: 9, label: "Bob only" }],
        week: [9, "rest", "rest", "rest", "rest", "rest", "rest"],
      })
      .expect(200);

    expect((await getSplit(aliceId)).days[0]!.label).toBe("Full Body");
  });
});
