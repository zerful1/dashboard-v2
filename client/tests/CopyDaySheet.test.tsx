import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CopyDaySheet } from "../src/features/nutrition/CopyDaySheet";
import { prettyDate } from "../src/lib/dates";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const row = (id: string) => ({
  id, user_id: "u1", date: "2026-09-22", logged_at: "", food_item_id: null, name: id, quantity: 1, unit: "serving",
  calories: 100, protein_g: 0, fat_g: 0, carbs_g: 0, fibre_g: null, sugar_g: null, sat_fat_g: null, salt_g: null,
});

function mockDiary(byDate: Record<string, unknown[]>) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    const date = new URL(path, "http://x").searchParams.get("date") ?? "";
    return (byDate[date] ?? []) as never;
  });
}

function renderSheet(copy = { mutate: vi.fn(), isPending: false }) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CopyDaySheet open onClose={() => {}} to="2026-09-23" copy={copy as never} />
    </QueryClientProvider>,
  );
  return copy;
}

afterEach(() => vi.restoreAllMocks());

describe("CopyDaySheet", () => {
  it("offers yesterday's foods, and copies them", async () => {
    mockDiary({ "2026-09-22": [row("a"), row("b")] });
    const copy = renderSheet();
    const button = await screen.findByRole("button", { name: `Copy 2 foods from ${prettyDate("2026-09-22")}` });
    await userEvent.click(button);
    expect(copy.mutate).toHaveBeenCalledWith({ from: "2026-09-22", to: "2026-09-23" }, expect.anything());
  });

  // Review focus 4: nothing to copy, or a copy already on its way.
  it("cannot copy an empty day", async () => {
    mockDiary({});
    renderSheet();
    await waitFor(() => expect(screen.getByText(`Nothing logged on ${prettyDate("2026-09-22")}.`)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
  });

  // A day that failed to load is unknown, not empty.
  it("does not call a day it could not read empty", async () => {
    const calls: string[] = [];
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      calls.push(path);
      throw new Error("offline");
    });
    renderSheet();
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Nothing logged/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
  });

  it("cannot copy twice while a copy is in flight", async () => {
    mockDiary({ "2026-09-22": [row("a")] });
    renderSheet({ mutate: vi.fn(), isPending: true });
    await waitFor(() => expect(screen.getByRole("button", { name: /Copy 1 food/ })).toBeDisabled());
  });
});
