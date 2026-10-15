import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecordEvent } from "@dashboard/shared";
import { RecordList } from "../src/features/insights/RecordList";

const lift = (i: number): RecordEvent => ({
  date: "2026-09-24", exercise_name: `Lift ${i}`, heaviest: { weightKg: 100 + i, reps: 5, previousKg: 100 },
});

describe("RecordList", () => {
  it("shows one line per record: the lift, its new best and the change", () => {
    render(<RecordList title="Records that week" events={[lift(10)]} empty="No records that week." />);
    const row = within(screen.getByRole("list", { name: "Records that week" })).getByRole("listitem");
    expect(row).toHaveTextContent("Lift 10");
    expect(row).toHaveTextContent("110 kg");
    expect(row).toHaveTextContent("+10");
  });

  it("shows the count beside the title", () => {
    render(<RecordList title="Records that week" events={[lift(1), lift(2)]} empty="No records that week." />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows 5, biggest jump first, then the rest on N more", async () => {
    render(<RecordList title="Records that week" events={[1, 2, 3, 4, 5, 6, 7, 8].map(lift)} empty="No records that week." />);
    const list = screen.getByRole("list", { name: "Records that week" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("Lift 8");
    await userEvent.click(screen.getByRole("button", { name: "3 more" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    expect(screen.queryByRole("button", { name: /more/ })).toBeNull();
  });

  it("says so when there are none", () => {
    render(<RecordList title="This week so far" events={[]} empty="None yet this week." />);
    expect(screen.getByText("None yet this week.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
