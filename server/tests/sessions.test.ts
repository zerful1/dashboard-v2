import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import { getOrCreateSession, findSession, listSessions } from "../src/repositories/sessions";
import { findUserByEmail } from "../src/repositories/users";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

async function idFor(creds: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(creds);
  return { agent, id: (await findUserByEmail(creds.email))!.id };
}

describe("sessions", () => {
  it("snapshots day_name from the split at creation", async () => {
    const { id } = await idFor(alice);
    // DEFAULT_SPLIT: day_type 3 is Push.
    const s = await getOrCreateSession(id, "2026-08-16", 3, DEFAULT_SPLIT);
    expect(s.day_name).toBe("Push");
  });

  it("falls back to 'Workout' for a day_type the split does not define", async () => {
    const { id } = await idFor(alice);
    const s = await getOrCreateSession(id, "2026-08-16", 99, DEFAULT_SPLIT);
    expect(s.day_name).toBe("Workout");
  });

  it("does NOT recompute day_name on a later call", async () => {
    const { id } = await idFor(alice);
    await getOrCreateSession(id, "2026-08-16", 1, DEFAULT_SPLIT); // Legs

    const renamed = { ...DEFAULT_SPLIT, days: [{ day_type: 1, label: "Leg Day" }] };
    const again = await getOrCreateSession(id, "2026-08-16", 1, renamed as never);

    // The snapshot is why history survives a split rename. In the migrated
    // history 'Upper A' and 'Legs' are both day_type 1 — recomputing would
    // relabel five real sessions from the retired era.
    expect(again.day_name).toBe("Legs");
  });

  it("is idempotent for the same date and day_type", async () => {
    const { id } = await idFor(alice);
    const a = await getOrCreateSession(id, "2026-08-16", 1, DEFAULT_SPLIT);
    const b = await getOrCreateSession(id, "2026-08-16", 1, DEFAULT_SPLIT);
    expect(b.id).toBe(a.id);
  });

  it("returns the date as a string, unshifted", async () => {
    const { id } = await idFor(alice);
    // June is BST; a Date round trip would render this as the 25th.
    const s = await getOrCreateSession(id, "2026-06-26", 1, DEFAULT_SPLIT);
    expect(s.date).toBe("2026-06-26");
    expect(typeof s.date).toBe("string");
  });

  it("GET /session does not create one", async () => {
    const { agent, id } = await idFor(alice);
    const res = await agent.get("/api/workouts/session?date=2026-08-16&day_type=1").expect(200);
    expect(res.body).toBeNull();
    expect(await findSession(id, "2026-08-16", 1)).toBeNull();
  });

  it("lists newest first and filters by the snapshotted day_name", async () => {
    const { agent, id } = await idFor(alice);
    await getOrCreateSession(id, "2026-08-10", 1, DEFAULT_SPLIT); // Legs
    await getOrCreateSession(id, "2026-08-14", 3, DEFAULT_SPLIT); // Push

    const all = await agent.get("/api/workouts/sessions").expect(200);
    expect(all.body.map((s: { date: string }) => s.date)).toEqual(["2026-08-14", "2026-08-10"]);

    const legs = await agent.get("/api/workouts/sessions?day_name=Legs").expect(200);
    expect(legs.body).toHaveLength(1);
  });

  it("paginates", async () => {
    const { agent, id } = await idFor(alice);
    for (const d of ["2026-08-10", "2026-08-11", "2026-08-12"]) {
      await getOrCreateSession(id, d, 1, DEFAULT_SPLIT);
    }
    const page = await agent.get("/api/workouts/sessions?limit=2&offset=1").expect(200);
    expect(page.body.map((s: { date: string }) => s.date)).toEqual(["2026-08-11", "2026-08-10"]);
  });

  it("day-names lists the distinct snapshots", async () => {
    const { agent, id } = await idFor(alice);
    await getOrCreateSession(id, "2026-08-10", 1, DEFAULT_SPLIT); // Legs
    await getOrCreateSession(id, "2026-08-14", 3, DEFAULT_SPLIT); // Push
    await getOrCreateSession(id, "2026-08-17", 3, DEFAULT_SPLIT); // Push again

    const res = await agent.get("/api/workouts/day-names").expect(200);
    expect(res.body).toEqual(["Legs", "Push"]);
  });
});

describe("session ownership scoping", () => {
  it("never returns another user's sessions", async () => {
    const { id: aliceId } = await idFor(alice);
    const { agent: bobAgent, id: bobId } = await idFor(bob);

    await getOrCreateSession(aliceId, "2026-08-16", 1, DEFAULT_SPLIT);
    await getOrCreateSession(bobId, "2026-08-15", 1, DEFAULT_SPLIT);

    const seen = await bobAgent.get("/api/workouts/sessions").expect(200);
    expect(seen.body).toHaveLength(1);
    expect(seen.body[0].date).toBe("2026-08-15");

    expect(await listSessions(aliceId, { limit: 50, offset: 0 })).toHaveLength(1);
  });

  it("the same date and day_type for two users does not collide", async () => {
    const { id: aliceId } = await idFor(alice);
    const { id: bobId } = await idFor(bob);
    // UNIQUE is (user_id, date, day_type), not (date, day_type).
    const a = await getOrCreateSession(aliceId, "2026-08-16", 1, DEFAULT_SPLIT);
    const b = await getOrCreateSession(bobId, "2026-08-16", 1, DEFAULT_SPLIT);
    expect(a.id).not.toBe(b.id);
  });
});
