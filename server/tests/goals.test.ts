import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { findUserByEmail } from "../src/repositories/users";
import { addLiftGoal, deleteGoal, listGoals, liftPoints, setWeightGoal, weightPoints } from "../src/repositories/goals";

const app = createApp();
const alice = { email: "alice@example.com", password: "correct-horse-9" };
const bob = { email: "bob@example.com", password: "correct-horse-9" };

async function signedIn(who: typeof alice) {
  const agent = request.agent(app);
  await agent.post("/api/auth/register").send(who);
  return { agent, id: (await findUserByEmail(who.email))!.id };
}

describe("goals repository", () => {
  it("keeps one weight goal, recording the latest weigh-in as its start", async () => {
    const { agent, id } = await signedIn(alice);
    await agent.post("/api/weight").send({ date: "2026-09-20", weight_kg: 80 });
    await agent.post("/api/weight").send({ date: "2026-09-29", weight_kg: 79.1 });
    await setWeightGoal(id, 75);
    const g = await setWeightGoal(id, 74);
    expect(g).toMatchObject({ kind: "weight", exercise_name: null, target_kg: 74, start_kg: 79.1 });
    expect(await listGoals(id)).toHaveLength(1);
  });

  it("starts a lift goal from the heaviest set ever, and refuses a duplicate or a sixth", async () => {
    const { agent, id } = await signedIn(alice);
    for (const [date, kg] of [["2026-08-01", 60], ["2026-09-01", 66]] as const) {
      await agent.post("/api/workouts/sets").send({ date, day_type: 2, exercise_name: "Lat Pulldown", set_number: 1, weight_kg: kg, reps: 8, is_bodyweight: false });
    }
    expect(await addLiftGoal(id, "Lat Pulldown", 75)).toMatchObject({ kind: "lift", start_kg: 66, target_kg: 75 });
    expect(await addLiftGoal(id, "Lat Pulldown", 80)).toBe("duplicate");
    for (const name of ["A", "B", "C", "D"]) await addLiftGoal(id, name, 50);
    expect(await addLiftGoal(id, "E", 50)).toBe("full");
  });

  it("reads projection points: weigh-ins, and each date's heaviest set", async () => {
    const { agent, id } = await signedIn(alice);
    await agent.post("/api/weight").send({ date: "2026-09-29", weight_kg: 79.1 });
    await agent.post("/api/weight").send({ date: "2026-07-01", weight_kg: 81 });
    const set = (date: string, kg: number, n: number) => agent.post("/api/workouts/sets")
      .send({ date, day_type: 2, exercise_name: "Row", set_number: n, weight_kg: kg, reps: 8, is_bodyweight: false });
    await set("2026-09-01", 50, 1); await set("2026-09-01", 55, 2); await set("2026-09-08", 57.5, 1);
    expect(await weightPoints(id, "2026-08-05", "2026-09-30")).toEqual([{ date: "2026-09-29", value: 79.1 }]);
    expect(await liftPoints(id, "Row", "2026-07-08", "2026-09-30")).toEqual([
      { date: "2026-09-01", value: 55 }, { date: "2026-09-08", value: 57.5 },
    ]);
  });
});

describe("goals ownership scoping", () => {
  it("never lists, deletes or reads points from another user's data", async () => {
    const a = await signedIn(alice);
    const b = await signedIn(bob);
    await a.agent.post("/api/weight").send({ date: "2026-09-29", weight_kg: 79 });
    const goal = await setWeightGoal(a.id, 75);

    expect(await listGoals(b.id)).toEqual([]);
    expect(await deleteGoal(b.id, goal.id)).toBe(false);
    expect(await weightPoints(b.id, "2026-08-01", "2026-09-30")).toEqual([]);
    // Positive complement: the owner can delete it.
    expect(await deleteGoal(a.id, goal.id)).toBe(true);
  });
});
