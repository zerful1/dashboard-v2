import { describe, it, expect } from "vitest";
import request from "supertest";
import type { Habit, HabitSummary } from "@dashboard/shared";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { T } from "../src/config";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };
type Agent = ReturnType<typeof request.agent>;

async function signedIn(who: typeof alice): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who).expect(201);
  return agent;
}
const add = async (agent: Agent, name: string, emoji?: string) =>
  (await agent.post("/api/habits").send({ name, emoji }).expect(201)).body as Habit;
const list = async (agent: Agent, today = "2026-10-04") =>
  (await agent.get(`/api/habits?today=${today}`).expect(200)).body as HabitSummary[];
const mark = (agent: Agent, id: string, date: string) => agent.put(`/api/habits/${id}/days/${date}`);
const unmark = (agent: Agent, id: string, date: string) => agent.delete(`/api/habits/${id}/days/${date}`);
const completions = async (habitId: string) =>
  (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${T.habitCompletions} WHERE habit_id = $1`, [habitId]))
    .rows[0]!.n;

describe("habits", () => {
  it("adds habits in order, trims names and stores a blank emoji as null", async () => {
    const agent = await signedIn(alice);
    expect(await add(agent, "  Skincare ", "🫧")).toMatchObject({ name: "Skincare", emoji: "🫧", sort_order: 1 });
    expect(await add(agent, "Put on retainer", "  ")).toMatchObject({ emoji: null, sort_order: 2 });
    expect((await list(agent)).map((h) => h.name)).toEqual(["Skincare", "Put on retainer"]);
    await agent.post("/api/habits").send({ name: "   " }).expect(400);
  });

  // Browser pass: the app sends emoji: null for "no emoji", and the add
  // schema took only a string or nothing.
  it("adds a habit sent with emoji null, as the app sends it", async () => {
    const agent = await signedIn(alice);
    const res = await agent.post("/api/habits").send({ name: "Put on retainer", emoji: null }).expect(201);
    expect(res.body.emoji).toBeNull();
  });

  it("stops at 12 habits", async () => {
    const agent = await signedIn(alice);
    for (let i = 1; i <= 12; i++) await add(agent, `Habit ${i}`);
    const res = await agent.post("/api/habits").send({ name: "Thirteenth" }).expect(409);
    expect(res.body.message).toBe("You can have up to 12 habits");
  });

  it("counts the streak back from today or yesterday, and lists only the last 7 days", async () => {
    const agent = await signedIn(alice);
    const h = await add(agent, "Skincare");
    for (const d of ["2026-09-20", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"]) {
      await mark(agent, h.id, d).expect(204);
    }
    // Today (10-04) unticked keeps the run; 10-05 is in the future and ignored;
    // 09-20 is outside the strip.
    expect((await list(agent, "2026-10-04"))[0]).toMatchObject({
      streak: 3, recent: ["2026-10-01", "2026-10-02", "2026-10-03"],
    });
    await unmark(agent, h.id, "2026-10-02").expect(204);
    expect((await list(agent, "2026-10-04"))[0]!.streak).toBe(1);
  });

  // Review focus 2.
  it("marks and unmarks a day idempotently", async () => {
    const agent = await signedIn(alice);
    const h = await add(agent, "Skincare");
    await mark(agent, h.id, "2026-10-04").expect(204);
    await mark(agent, h.id, "2026-10-04").expect(204);
    expect(await completions(h.id)).toBe(1);
    await unmark(agent, h.id, "2026-10-04").expect(204);
    await unmark(agent, h.id, "2026-10-04").expect(204);
    expect(await completions(h.id)).toBe(0);
    await agent.put(`/api/habits/${h.id}/days/2026-02-30`).expect(400);
  });

  it("renames, clears the emoji, and refuses an empty change", async () => {
    const agent = await signedIn(alice);
    const h = await add(agent, "Skincare", "🫧");
    expect((await agent.patch(`/api/habits/${h.id}`).send({ name: " Skin care " }).expect(200)).body)
      .toMatchObject({ name: "Skin care", emoji: "🫧" });
    expect((await agent.patch(`/api/habits/${h.id}`).send({ emoji: null }).expect(200)).body.emoji).toBeNull();
    await agent.patch(`/api/habits/${h.id}`).send({}).expect(400);
  });

  // Review focus 5.
  it("reorders by the full list only", async () => {
    const agent = await signedIn(alice);
    const [a, b, c] = [await add(agent, "A"), await add(agent, "B"), await add(agent, "C")];
    await agent.post("/api/habits/reorder").send({ ids: [c.id, a.id, b.id] }).expect(204);
    expect((await list(agent)).map((h) => h.name)).toEqual(["C", "A", "B"]);
    const refused = await agent.post("/api/habits/reorder").send({ ids: [a.id, b.id] }).expect(400);
    expect(refused.body.message).toBe("That isn't your full list of habits");
    // Right length, every id hers, but one twice and one missing: only the duplicate check sees it.
    await agent.post("/api/habits/reorder").send({ ids: [a.id, b.id, a.id] }).expect(400);
  });

  // A restore adds habits back without the 12 limit (redesign part 8, §6.4), so
  // the list can be longer; reordering it must still work.
  it("reorders a list longer than 12, as a restore can leave", async () => {
    const agent = await signedIn(alice);
    for (let i = 0; i < 12; i++) await add(agent, `H${i}`);
    const { rows } = await pool.query<{ user_id: string }>(`SELECT user_id FROM ${T.habits} LIMIT 1`);
    await pool.query(`INSERT INTO ${T.habits} (user_id, name, sort_order) VALUES ($1, 'Restored', 12)`, [rows[0]!.user_id]);
    const ids = (await list(agent)).map((h) => h.id).reverse();
    await agent.post("/api/habits/reorder").send({ ids }).expect(204);
    expect((await list(agent))[0]!.name).toBe("Restored");
  });

  it("deletes a habit with its history", async () => {
    const agent = await signedIn(alice);
    const h = await add(agent, "Skincare");
    await mark(agent, h.id, "2026-10-03").expect(204);
    await agent.delete(`/api/habits/${h.id}`).expect(204);
    expect(await completions(h.id)).toBe(0);
    await agent.delete(`/api/habits/${h.id}`).expect(404);
  });

  // Review focus 1.
  it("keeps every habit to its owner", async () => {
    const a = await signedIn(alice);
    const h = await add(a, "Skincare");
    await mark(a, h.id, "2026-10-03").expect(204);
    const b = await signedIn(bob);
    expect(await list(b)).toEqual([]);
    await b.patch(`/api/habits/${h.id}`).send({ name: "Mine now" }).expect(404);
    await mark(b, h.id, "2026-10-04").expect(404);
    await unmark(b, h.id, "2026-10-03").expect(404);
    await b.post("/api/habits/reorder").send({ ids: [h.id] }).expect(400);
    await b.delete(`/api/habits/${h.id}`).expect(404);
    expect(await completions(h.id)).toBe(1);
    expect((await list(a, "2026-10-04"))[0]).toMatchObject({ name: "Skincare", streak: 1 });
  });

  it("is for signed-in users, and needs the caller's date", async () => {
    await request(app).get("/api/habits?today=2026-10-04").expect(401);
    const agent = await signedIn(alice);
    await agent.get("/api/habits").expect(400);
  });
});
