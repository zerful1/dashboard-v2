import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };

describe("profile body details", () => {
  it("saves them and returns them", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);
    const res = await agent
      .patch("/api/profile")
      .send({ height_cm: 180, birth_year: 1996, sex: "male", activity_level: "moderate" })
      .expect(200);
    expect(res.body).toMatchObject({ height_cm: 180, birth_year: 1996, sex: "male", activity_level: "moderate" });
    expect((await agent.get("/api/profile")).body.height_cm).toBe(180);
  });

  it("leaves unmentioned details alone", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);
    await agent.patch("/api/profile").send({ height_cm: 180 }).expect(200);
    const res = await agent.patch("/api/profile").send({ sex: "female" }).expect(200);
    expect(res.body).toMatchObject({ height_cm: 180, sex: "female", birth_year: null });
  });

  it("rejects values the formula cannot use", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(alice);
    await agent.patch("/api/profile").send({ height_cm: 90 }).expect(400);
    await agent.patch("/api/profile").send({ sex: "other" }).expect(400);
    await agent.patch("/api/profile").send({ activity_level: "athlete" }).expect(400);
  });

  // #17 review (11): a body detail could be changed but never cleared.
  it("clears a body detail sent as null, and leaves the ones not mentioned", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({ email: "clear@example.com", password: "correct-horse-9" }).expect(201);
    await agent.patch("/api/profile").send({ height_cm: 180, birth_year: 1996, sex: "male", activity_level: "moderate" }).expect(200);
    const res = await agent.patch("/api/profile").send({ height_cm: null, sex: null }).expect(200);
    expect(res.body).toMatchObject({ height_cm: null, sex: null, birth_year: 1996, activity_level: "moderate" });
  });
});
