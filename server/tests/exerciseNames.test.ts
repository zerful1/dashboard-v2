import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { addExercise } from "../src/repositories/exercises";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

async function signedIn(creds: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(creds);
  return agent;
}

describe("GET /api/exercises/names", () => {
  it("requires a session", async () => {
    await request(app).get("/api/exercises/names").expect(401);
  });

  it("returns every template row across all days", async () => {
    const agent = await signedIn(alice);
    await agent.post("/api/exercises").send({ day_type: 1, exercise_name: "Squat" });
    await agent.post("/api/exercises").send({ day_type: 2, exercise_name: "Row" });

    const res = await agent.get("/api/exercises/names").expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((r: { exercise_name: string }) => r.exercise_name).sort()).toEqual([
      "Row",
      "Squat",
    ]);
    expect(res.body[0]).toHaveProperty("day_type");
  });

  it("is not shadowed by a parameterised route", async () => {
    // "names" is not a uuid. There is no GET "/:id" today, so this passes
    // trivially — it is a forward guard: adding one later without putting it
    // after this route would turn this into a 400.
    const agent = await signedIn(alice);
    await agent.get("/api/exercises/names").expect(200);
  });

  it("never returns another user's names", async () => {
    await signedIn(alice);
    const bobAgent = await signedIn(bob);
    const aliceId = (await findUserByEmail(alice.email))!.id;
    await addExercise(aliceId, 1, "Alice Only");

    expect((await bobAgent.get("/api/exercises/names")).body).toEqual([]);
  });
});
