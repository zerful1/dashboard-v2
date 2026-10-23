import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { WorkoutSection, type HomeWorkout } from "../src/features/home/WorkoutSection";

/** Stands in for the Gym page: shows the day it was sent to. */
function GymProbe() {
  const state = useLocation().state as { gymDay?: number } | null;
  return <p>gym day {state?.gymDay ?? "none"}</p>;
}

const progress = { total: 5, done: 1, sets: 2, cardio: 0, started: true, finished: false };

function renderAt(workout: HomeWorkout, prominent: boolean) {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<WorkoutSection workout={workout} prominent={prominent} />} />
        <Route path="/gym" element={<GymProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WorkoutSection's link", () => {
  // On a swapped day Home names the day trained, not the scheduled one. Its
  // button must open that day, or the sets look gone.
  it.each([true, false])("opens Gym on the day it names (prominent: %s)", async (prominent) => {
    renderAt({ label: "Legs", dayType: 1, isRest: false, progress, isError: false }, prominent);
    await userEvent.click(screen.getByRole("link", { name: /continue/i }));
    expect(screen.getByText("gym day 1")).toBeInTheDocument();
  });
});
