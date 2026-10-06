import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Exercise } from "@dashboard/shared";
import { ExerciseList } from "../src/features/gym/ExerciseList";

const ex = (name: string, i = 0): Exercise => ({ id: `e${i}`, user_id: "u1", day_type: 2, exercise_name: name, sort_order: i });
const HISTORY = [
  "Bench Press", "Close Grip T Bar Row", "Lat Pulldown", "Machine Row", "Reverse Curl",
  "T Bar Row", "Unilateral Machine Row", "Unilateral Reverse Curl",
];

function renderList(exercises: Exercise[] = [ex("Lat Pulldown")]) {
  const onAdd = vi.fn();
  render(
    <ExerciseList exercises={exercises} sets={[]} lastSets={{}} editMode historyNames={HISTORY}
      onOpen={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} onRename={vi.fn()} onAdd={onAdd} />,
  );
  return onAdd;
}
const box = () => screen.getByLabelText("New exercise name");
const suggestions = () => screen.queryByRole("list", { name: "Suggestions" });

describe("ExerciseList suggestions", () => {
  // Review focus 5: any case, so "t bar" finds "T Bar Row".
  it("suggests names from history as you type, and adds one on tap", async () => {
    const onAdd = renderList();
    await userEvent.type(box(), "t bar");
    const list = within(suggestions()!);
    expect(list.getAllByRole("button").map((b) => b.textContent)).toEqual(["Close Grip T Bar Row", "T Bar Row"]);
    await userEvent.click(list.getByRole("button", { name: "T Bar Row" }));
    expect(onAdd).toHaveBeenCalledWith("T Bar Row");
    expect(box()).toHaveValue("");
  });

  // Review finding: a phone capitalises "T bar row" for you, and stats match
  // names exactly, so a typed near-twin must become the history's spelling.
  it("adds a typed name in the history's spelling when only the case differs", async () => {
    const onAdd = renderList();
    await userEvent.type(box(), "t bar row{Enter}");
    expect(onAdd).toHaveBeenCalledWith("T Bar Row");
  });

  it("adds a new name as typed", async () => {
    const onAdd = renderList();
    await userEvent.type(box(), "Cable Curl{Enter}");
    expect(onAdd).toHaveBeenCalledWith("Cable Curl");
  });

  it("leaves out names already on the day", async () => {
    renderList();
    await userEvent.type(box(), "pulld");
    expect(suggestions()).toBeNull();
  });

  it("shows nothing until something is typed, and at most five", async () => {
    renderList([]);
    expect(suggestions()).toBeNull();
    await userEvent.type(box(), "r");
    expect(within(suggestions()!).getAllByRole("button")).toHaveLength(5);
  });
});

describe("ExerciseList, last time loading", () => {
  const view = (lastPending: boolean) =>
    render(
      <ExerciseList exercises={[ex("Lat Pulldown")]} sets={[]} lastSets={{}} lastPending={lastPending} editMode={false}
        historyNames={[]} onOpen={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} onRename={vi.fn()} onAdd={vi.fn()} />,
    );

  // Final review, important 1.
  it("says nothing about last time while it loads", () => {
    view(true);
    expect(screen.getByText("Lat Pulldown")).toBeInTheDocument();
    expect(screen.queryByText("No history")).toBeNull();
  });

  it("says No history once loaded with none", () => {
    view(false);
    expect(screen.getByText("No history")).toBeInTheDocument();
  });
});
