import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RenameExerciseSheet } from "../src/features/gym/RenameExerciseSheet";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const NAMES = [
  { exercise_name: "Bench", day_type: 1 },
  { exercise_name: "Squat", day_type: 1 },
  { exercise_name: "Bench Press", day_type: 2 },
];

/** By path, per the house rule. */
function renderSheet() {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    if (path === "/api/exercises/names") return NAMES;
    throw new Error(`unexpected ${path}`);
  });
  const onRename = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RenameExerciseSheet
        oldName="Bench"
        dayType={1}
        onClose={vi.fn()}
        onRename={onRename}
        isPending={false}
      />
    </QueryClientProvider>,
  );
  return { onRename };
}

afterEach(() => vi.restoreAllMocks());

// findByLabelText takes an EXACT string, not /name/i: the Sheet renders
// role="dialog" with aria-label="Rename exercise", which a case-insensitive
// regex for "name" also matches.
describe("RenameExerciseSheet", () => {
  it("blocks a name already used on the same day", async () => {
    renderSheet();
    const input = await screen.findByLabelText("Name");

    await userEvent.clear(input);
    await userEvent.type(input, "Squat");

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("already uses that name"),
    );
    expect(screen.getByRole("button", { name: /^rename$/i })).toBeDisabled();
  });

  it("warns before merging with a name from another day", async () => {
    renderSheet();
    const input = await screen.findByLabelText("Name");

    await userEvent.clear(input);
    await userEvent.type(input, "Bench Press");

    expect(await screen.findByText(/will merge with/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^rename$/i })).toBeEnabled();
  });

  it("submits the existing casing when merging", async () => {
    const { onRename } = renderSheet();
    const input = await screen.findByLabelText("Name");

    await userEvent.clear(input);
    await userEvent.type(input, "bench press");
    await waitFor(() => expect(screen.getByText(/will merge with/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /^rename$/i }));

    // Not "bench press" — or the merge creates a case-variant split rather
    // than joining the two exercises.
    expect(onRename).toHaveBeenCalledWith("Bench Press");
  });

  it("submits the existing casing when merging via Enter, too", async () => {
    // The keyboard path is a second call site for the same decision; wiring it
    // to `trimmed` instead of the merge target is an easy divergence.
    const { onRename } = renderSheet();
    const input = await screen.findByLabelText("Name");

    await userEvent.clear(input);
    await userEvent.type(input, "bench press");
    await waitFor(() => expect(screen.getByText(/will merge with/i)).toBeInTheDocument());
    await userEvent.type(input, "{Enter}");

    expect(onRename).toHaveBeenCalledWith("Bench Press");
  });

  it("disables rename when the name is unchanged", async () => {
    renderSheet();
    await screen.findByLabelText("Name");
    expect(screen.getByRole("button", { name: /^rename$/i })).toBeDisabled();
  });

  it("allows an ordinary rename", async () => {
    const { onRename } = renderSheet();
    const input = await screen.findByLabelText("Name");

    await userEvent.clear(input);
    await userEvent.type(input, "Barbell Bench");
    await userEvent.click(screen.getByRole("button", { name: /^rename$/i }));

    expect(onRename).toHaveBeenCalledWith("Barbell Bench");
  });
});
