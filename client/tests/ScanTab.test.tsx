import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BarcodeResult, FoodHit, FoodItem } from "@dashboard/shared";
import { AddFoodSheet } from "../src/features/nutrition/AddFoodSheet";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const CODE = "5000112548167";
const per100g = { kcal: 0.2, p: 0, f: 0, c: 0 };
const COKE: FoodHit = {
  source: "off", externalId: CODE, barcode: CODE, name: "Coca-Cola Light",
  servings: [{ label: "100 g", grams: 100, ...per100g }, { label: "1 serving (250ml)", grams: 250, kcal: 0.5, p: 0, f: 0, c: 0 }],
  per100g,
};
const FLAPJACK = {
  id: "i9", user_id: "u1", name: "Homemade flapjack", brand: null, barcode: "5012345678900",
  serving_description: "1 square", serving_grams: 60, kcal_per_serving: 250, protein_per_serving: 4,
  fat_per_serving: 11, carbs_per_serving: 33, kcal_per_100g: null, protein_per_100g: null, fat_per_100g: null,
  carbs_per_100g: null, fibre_per_100g: null, sugar_per_100g: null, sat_fat_per_100g: null, salt_per_100g: null,
  fibre_per_serving: null, sugar_per_serving: null, sat_fat_per_serving: null, salt_per_serving: null,
  is_favourite: false, external_source: "manual", external_id: null, created_at: "",
} as FoodItem;

/** A camera that "sees" `codes`, or refuses. Returns the track's stop spy. */
function stubCamera(codes: string[] | "denied") {
  const stop = vi.fn();
  const getUserMedia = vi.fn(async () => {
    if (codes === "denied") throw new DOMException("refused", "NotAllowedError");
    return { getTracks: () => [{ stop }] } as unknown as MediaStream;
  });
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = class {
    static async getSupportedFormats() {
      return ["ean_13", "ean_8", "upc_a", "upc_e"];
    }
    async detect() {
      return codes === "denied" ? [] : codes.map((rawValue) => ({ rawValue }));
    }
  };
  return { stop, getUserMedia };
}

/** Mocked by PATH (CLAUDE.md). */
function mockApi(barcode: (code: string) => Promise<BarcodeResult>) {
  const calls: string[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    calls.push(path);
    if (path.startsWith("/api/food/barcode/")) return (await barcode(path.split("/").pop()!)) as never;
    if (path.startsWith("/api/nutrition/recents")) return [] as never;
    throw new Error(`unexpected ${path}`);
  });
  return calls;
}

function renderSheet(open = true, addEntry = { mutate: vi.fn(), isPending: false }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (o: boolean) => (
    <QueryClientProvider client={client}>
      <AddFoodSheet open={o} onClose={() => {}} date="2026-10-05" addEntry={addEntry as never} />
    </QueryClientProvider>
  );
  const view = render(ui(open));
  return { addEntry, rerender: (o: boolean) => view.rerender(ui(o)) };
}

beforeEach(() => {
  // jsdom has no media playback: the camera loop needs a "ready" video.
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { get: () => 4, configurable: true });
  HTMLMediaElement.prototype.play = vi.fn(async () => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe("Scan tab", () => {
  it("reads a code, looks it up, and opens the amount step", async () => {
    const { stop } = stubCamera([CODE]);
    const calls = mockApi(async () => ({ source: "off", hit: COKE }));
    renderSheet();
    await userEvent.click(await screen.findByRole("tab", { name: "Scan" }));
    expect(await screen.findByText("Coca-Cola Light")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(calls).toContain(`/api/food/barcode/${CODE}`);
    // Review focus 1: a read code stops the camera.
    expect(stop).toHaveBeenCalled();
  });

  // Review focus 2: logging a library food links to it, rather than storing a copy.
  it("finds a food from the library as saved, and logs it against that item", async () => {
    stubCamera(["5012345678900"]);
    mockApi(async () => ({ source: "library", item: FLAPJACK }));
    const { addEntry } = renderSheet();
    await userEvent.click(await screen.findByRole("tab", { name: "Scan" }));
    await userEvent.click(await screen.findByRole("button", { name: "Add" }));
    const sent = addEntry.mutate.mock.calls[0]![0];
    expect(sent).toMatchObject({ name: "Homemade flapjack", food_item_id: "i9" });
    expect(sent.food).toBeUndefined();
  });

  it("offers to add an unknown food, with its barcode attached", async () => {
    stubCamera([CODE]);
    mockApi(async () => {
      throw new ApiError(404, "That barcode isn't in Open Food Facts");
    });
    const { addEntry } = renderSheet();
    await userEvent.click(await screen.findByRole("tab", { name: "Scan" }));
    expect(await screen.findByText("That barcode isn't in Open Food Facts")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add it yourself" }));
    expect(screen.getByRole("tab", { name: "Custom" })).toHaveAttribute("aria-selected", "true");
    await userEvent.type(screen.getByLabelText("Name"), "Diet cola");
    await userEvent.type(screen.getByLabelText("Calories (kcal)"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(addEntry.mutate.mock.calls[0]![0].food).toMatchObject({ source: "manual", barcode: CODE, name: "Diet cola" });
  });

  it("offers a box to type the code when the camera is refused", async () => {
    stubCamera("denied");
    const calls = mockApi(async () => ({ source: "off", hit: COKE }));
    renderSheet();
    await userEvent.click(await screen.findByRole("tab", { name: "Scan" }));
    expect(await screen.findByText("Camera access was refused. Type the barcode below instead.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Type the barcode"), CODE);
    await userEvent.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("Coca-Cola Light")).toBeInTheDocument();
    expect(calls).toContain(`/api/food/barcode/${CODE}`);
  });

  // Review focus 4: a failed lookup says so, and typing stays available.
  it("says when the lookup is unavailable, and keeps the type-in box", async () => {
    stubCamera([CODE]);
    mockApi(async () => {
      throw new ApiError(502, "Product lookup is unavailable right now");
    });
    renderSheet();
    await userEvent.click(await screen.findByRole("tab", { name: "Scan" }));
    expect(await screen.findByText("Product lookup is unavailable right now")).toBeInTheDocument();
    expect(screen.getByLabelText("Type the barcode")).toBeInTheDocument();
  });

  // Review focus 1: the camera light must never stay on.
  it("stops the camera when the Scan tab is left", async () => {
    const { stop, getUserMedia } = stubCamera([]);
    mockApi(async () => ({ source: "off", hit: COKE }));
    renderSheet();
    await userEvent.click(await screen.findByRole("tab", { name: "Scan" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("tab", { name: "Recent" }));
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it("stops the camera when the sheet closes", async () => {
    const { stop, getUserMedia } = stubCamera([]);
    mockApi(async () => ({ source: "off", hit: COKE }));
    const { rerender } = renderSheet();
    await userEvent.click(await screen.findByRole("tab", { name: "Scan" }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    rerender(false);
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
});
