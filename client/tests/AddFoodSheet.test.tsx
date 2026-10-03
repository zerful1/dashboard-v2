import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddFoodSheet } from "../src/features/nutrition/AddFoodSheet";
import * as apiModule from "../src/lib/api";
import type { FoodSearchResult, RecentFood } from "@dashboard/shared";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const per100g = { kcal: 380, p: 13, f: 7, c: 65, fibre: 9 };
const SEARCH: FoodSearchResult = {
  hits: [
    { source: "off", externalId: "5000", name: "Oat bar", brand: "Brand", servings: [{ label: "100 g", grams: 100, ...per100g }], per100g },
    { source: "cofid", externalId: "11-800", name: "Oats, rolled", servings: [{ label: "100 g", grams: 100, ...per100g }], per100g },
  ],
  warnings: ["Branded foods are unavailable right now"],
};
const RECENT: RecentFood[] = [
  {
    entry: {
      id: "e1", user_id: "u1", date: "2026-09-22", logged_at: "", food_item_id: "i1", name: "Oats, rolled",
      quantity: 50, unit: "g", calories: 190, protein_g: 6.5, fat_g: 3.5, carbs_g: 32.5,
      fibre_g: 4.5, sugar_g: null, sat_fat_g: null, salt_g: null,
    },
    item: null,
  },
];

function mockApi() {
  const calls: string[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    calls.push(path);
    if (path.startsWith("/api/food/search")) return SEARCH as never;
    if (path.startsWith("/api/nutrition/recents")) return RECENT as never;
    throw new Error(`unexpected ${path}`);
  });
  return calls;
}

function renderSheet(addEntry = { mutate: vi.fn(), isPending: false }) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AddFoodSheet open onClose={() => {}} date="2026-09-23" addEntry={addEntry as never} />
    </QueryClientProvider>,
  );
  return addEntry;
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("AddFoodSheet", () => {
  it("searches, shows branded then generic hits with any warning, and logs the pick", async () => {
    mockApi();
    const addEntry = renderSheet();
    await userEvent.type(screen.getByLabelText("Search foods"), "oats");
    await waitFor(() => expect(screen.getByText("Oats, rolled")).toBeInTheDocument());
    expect(screen.getByText("Branded foods are unavailable right now")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Oats, rolled"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(addEntry.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-09-23", calories: 380, food: expect.objectContaining({ source: "cofid", external_id: "11-800" }) }),
    );
  });

  it("does not search offline, and says why", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const calls = mockApi();
    renderSheet();
    await userEvent.type(screen.getByLabelText("Search foods"), "oats");
    expect(screen.getByText("Search needs a connection.")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 400));
    expect(calls.some((p) => p.startsWith("/api/food/search"))).toBe(false);
  });

  it("re-logs a recent food at the amount last used", async () => {
    mockApi();
    renderSheet();
    await userEvent.click(screen.getByRole("tab", { name: "Recent" }));
    await userEvent.click(await screen.findByText("Oats, rolled"));
    expect(screen.getByLabelText("Amount (g)")).toHaveValue("50");
  });

  it("logs a typed-in food by the serving", async () => {
    mockApi();
    const addEntry = renderSheet();
    await userEvent.click(screen.getByRole("tab", { name: "Custom" }));
    await userEvent.type(screen.getByLabelText("Name"), "Chicken wrap");
    await userEvent.click(screen.getByRole("button", { name: "Per serving" }));
    await userEvent.type(screen.getByLabelText("Calories (kcal)"), "610");
    await userEvent.type(screen.getByLabelText("Protein (g)"), "38");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(addEntry.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Chicken wrap", unit: "serving", quantity: 1, calories: 610, protein_g: 38,
        food: expect.objectContaining({ source: "manual", external_id: null, kcal_per_serving: 610, kcal_per_100g: null }),
      }),
    );
  });

  it("credits the food data", () => {
    mockApi();
    renderSheet();
    expect(screen.getByText(/Open Food Facts \(ODbL\)/)).toBeInTheDocument();
    expect(screen.getByText(/Open Government Licence v3\.0/)).toBeInTheDocument();
  });
});
