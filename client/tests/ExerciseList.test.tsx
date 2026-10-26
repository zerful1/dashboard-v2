import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  // Any case, so "t bar" finds "T Bar Row".
  it("suggests names from history as you type, and adds one on tap", async () => {
    const onAdd = renderList();
    await userEvent.type(box(), "t bar");
    const list = within(suggestions()!);
    expect(list.getAllByRole("button").map((b) => b.textContent)).toEqual(["Close Grip T Bar Row", "T Bar Row"]);
    await userEvent.click(list.getByRole("button", { name: "T Bar Row" }));
    expect(onAdd).toHaveBeenCalledWith("T Bar Row");
    expect(box()).toHaveValue("");
  });

  // A phone capitalises "T bar row" for you, and stats match
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

describe("ExerciseList, dragging to reorder", () => {
  // jsdom lays nothing out, and dnd-kit moves by measured position: each row
  // stands 50 px below the one before it, as on a phone, and everything else
  // is a tall column holding them. (A 0 × 0 parent clamps every drag to its top.)
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const i = [...document.querySelectorAll("[data-exercise-row]")].indexOf(this);
      const [top, height] = i < 0 ? [0, 1000] : [i * 50, 50];
      return { x: 0, y: top, top, left: 0, right: 320, bottom: top + height, width: 320, height, toJSON: () => ({}) } as DOMRect;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const three = [ex("Bench Press", 0), ex("Incline Press", 1), ex("Lateral Raise", 2)];
  const renderDrag = () => {
    const onReorder = vi.fn();
    render(
      <ExerciseList exercises={three} sets={[]} lastSets={{}} editMode historyNames={[]}
        onOpen={vi.fn()} onDelete={vi.fn()} onReorder={onReorder} onRename={vi.fn()} onAdd={vi.fn()} />,
    );
    return onReorder;
  };

  // Space picks up, the arrows move, Space drops: dnd-kit's keyboard drag, so
  // reordering never needs a touchscreen or a mouse.
  it("saves the new order once, on drop", async () => {
    const onReorder = renderDrag();
    screen.getByRole("button", { name: "Drag Bench Press" }).focus();
    await userEvent.keyboard("[Space]");
    await userEvent.keyboard("[ArrowDown]");
    await userEvent.keyboard("[Space]");
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["e1", "e0", "e2"]);
  });

  it("saves nothing when dropped where it started", async () => {
    const onReorder = renderDrag();
    screen.getByRole("button", { name: "Drag Incline Press" }).focus();
    await userEvent.keyboard("[Space]");
    await userEvent.keyboard("[Space]");
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("drags only in edit mode", () => {
    render(
      <ExerciseList exercises={three} sets={[]} lastSets={{}} editMode={false} historyNames={[]}
        onOpen={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} onRename={vi.fn()} onAdd={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /^Drag / })).toBeNull();
  });
});
