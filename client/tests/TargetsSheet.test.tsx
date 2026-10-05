import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TargetsSheet } from "../src/features/nutrition/TargetsSheet";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";
import type { NutritionTarget, Profile, TdeeHint } from "@dashboard/shared";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

const PROFILE: Profile = {
  user_id: "u1", display_name: "", avatar_path: null, units: "kg", timezone: "Europe/London", updated_at: "",
  height_cm: null, birth_year: null, sex: null, activity_level: null,
};
const cut: NutritionTarget = {
  id: "t", user_id: "u1", effective_from: "2026-06-09", goal_mode: "cut",
  calories: 2402, protein_g: 180, fat_g: 93, carbs_g: 210, created_at: "",
};

function mockApi(hint: TdeeHint, profile: Profile = PROFILE, patchFails = false) {
  const calls: { path: string; init?: RequestInit }[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.startsWith("/api/nutrition/tdee")) return hint as never;
    if (path === "/api/profile" && init?.method === "PATCH") {
      if (patchFails) throw new ApiError(400, "Validation failed");
      return { ...profile, ...JSON.parse(String(init.body)) } as never;
    }
    if (path === "/api/profile") return profile as never;
    throw new Error(`unexpected ${path}`);
  });
  return calls;
}

function renderSheet(addTarget = { mutate: vi.fn(), isPending: false }) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TargetsSheet open onClose={() => {}} today="2026-09-23" targets={[cut]} addTarget={addTarget as never} />
    </QueryClientProvider>,
  );
  return addTarget;
}

afterEach(() => vi.restoreAllMocks());

describe("TargetsSheet", () => {
  it("starts from the current target and saves a new dated row", async () => {
    mockApi({ formula: null, adaptive: null, days_logged: 3 });
    const addTarget = renderSheet();
    expect(screen.getByLabelText("Calories (kcal)")).toHaveValue("2402");
    expect(screen.getByText("Macros add up to 2,397 kcal")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Calories (kcal)"));
    await userEvent.type(screen.getByLabelText("Calories (kcal)"), "2300");
    await userEvent.click(screen.getByRole("button", { name: "Save targets" }));
    expect(addTarget.mutate).toHaveBeenCalledWith({
      effective_from: "2026-09-23", goal_mode: "cut", calories: 2300, protein_g: 180, fat_g: 93, carbs_g: 210,
    });
  });

  it("will not save without calories", async () => {
    mockApi({ formula: null, adaptive: null, days_logged: 0 });
    renderSheet();
    await userEvent.clear(screen.getByLabelText("Calories (kcal)"));
    expect(screen.getByRole("button", { name: "Save targets" })).toBeDisabled();
  });

  it("shows the estimate from the user's own data instead of the formula once it exists", async () => {
    mockApi({
      formula: { kcal: 2759, weight_kg: 80, age: 30 },
      adaptive: { kcal: 2650, days_logged: 21, weigh_ins: 18 },
      days_logged: 21,
    });
    renderSheet();
    await waitFor(() => expect(screen.getByText("≈ 2,650 kcal maintenance")).toBeInTheDocument());
    expect(screen.getByText(/last 21 logged days and 18 weigh-ins/)).toBeInTheDocument();
    expect(screen.queryByText(/Estimated from your height/)).not.toBeInTheDocument();
  });

  it("falls back to the formula, then to asking for details", async () => {
    mockApi({ formula: { kcal: 2759, weight_kg: 80, age: 30 }, adaptive: null, days_logged: 5 });
    renderSheet();
    await waitFor(() => expect(screen.getByText("≈ 2,759 kcal maintenance")).toBeInTheDocument());
    expect(screen.getByText(/Estimated from your height, age \(30\), sex and activity at 80.0 kg/)).toBeInTheDocument();
  });

  it("always says it is an estimate", async () => {
    mockApi({ formula: null, adaptive: null, days_logged: 0 });
    renderSheet();
    await waitFor(() => expect(screen.getByText(/Add your body details/)).toBeInTheDocument());
    expect(screen.getByText(/not medical advice/)).toBeInTheDocument();
  });

  it("saves body details to the profile", async () => {
    const calls = mockApi({ formula: null, adaptive: null, days_logged: 0 });
    renderSheet();
    await userEvent.click(screen.getByText("Body details (for the estimate)"));
    await userEvent.type(screen.getByLabelText("Height (cm)"), "180");
    await userEvent.type(screen.getByLabelText("Birth year"), "1996");
    await userEvent.click(screen.getByRole("button", { name: "Male" }));
    await userEvent.selectOptions(screen.getByLabelText("Activity"), "moderate");
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === "PATCH");
      expect(JSON.parse(String(patch!.init!.body))).toEqual({
        height_cm: 180, birth_year: 1996, sex: "male", activity_level: "moderate",
      });
    });
  });

  // Final review: when the band hides an implausible estimate, the hint still
  // promised "after 14 logged days this uses your own numbers" to someone past 14.
  it("says why its own numbers aren't used after 14 days, rather than promising them", async () => {
    mockApi({ formula: { kcal: 2759, weight_kg: 80, age: 30 }, adaptive: null, days_logged: 21 });
    renderSheet();
    expect(await screen.findByText(/don't give a believable estimate yet/)).toBeInTheDocument();
    expect(screen.queryByText(/After 14 logged days/)).not.toBeInTheDocument();
  });

  it("says the same when there is no formula to fall back to", async () => {
    mockApi({ formula: null, adaptive: null, days_logged: 21 });
    renderSheet();
    expect(await screen.findByText(/don't give a believable estimate yet/)).toBeInTheDocument();
    expect(screen.queryByText(/log food for 14 days/)).not.toBeInTheDocument();
  });

  // Final review: the form sends all four details, so saving before the profile
  // has loaded would clear the ones it had not shown yet.
  it("waits for the profile before saving details", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/nutrition/tdee")) return { formula: null, adaptive: null, days_logged: 0 } as never;
      if (path === "/api/profile") return new Promise(() => {}) as never;
      throw new Error(`unexpected ${path}`);
    });
    renderSheet();
    await userEvent.click(screen.getByText("Body details (for the estimate)"));
    await userEvent.type(screen.getByLabelText("Height (cm)"), "180");
    expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
  });

  // #17 review (12): with no targets yet, every render passed a fresh [] and the
  // reset effect wiped what had been typed.
  it("keeps what's typed when the page re-renders before any target exists", async () => {
    mockApi({ formula: null, adaptive: null, days_logged: 0 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const sheet = () => (
      <QueryClientProvider client={client}>
        <TargetsSheet open onClose={() => {}} today="2026-09-23" targets={[]} addTarget={{ mutate: vi.fn(), isPending: false } as never} />
      </QueryClientProvider>
    );
    const { rerender } = render(sheet());
    await userEvent.type(screen.getByLabelText("Calories (kcal)"), "2200");
    rerender(sheet());
    expect(screen.getByLabelText("Calories (kcal)")).toHaveValue("2200");
  });

  // #17 review (11): details could not be cleared, an unreadable height was
  // dropped while the rest saved, and a refusal was a toast.
  it("clears a body detail left blank", async () => {
    const calls = mockApi(
      { formula: null, adaptive: null, days_logged: 0 },
      { ...PROFILE, height_cm: 180, birth_year: 1996, sex: "male", activity_level: "moderate" },
    );
    renderSheet();
    await userEvent.click(screen.getByText("Body details (for the estimate)"));
    await waitFor(() => expect(screen.getByLabelText("Height (cm)")).toHaveValue("180"));
    await userEvent.clear(screen.getByLabelText("Height (cm)"));
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => {
      const patch = calls.find((c) => c.init?.method === "PATCH");
      expect(JSON.parse(String(patch!.init!.body))).toEqual({ height_cm: null, birth_year: 1996, sex: "male", activity_level: "moderate" });
    });
  });

  it("says a height it can't read is wrong, instead of dropping it", async () => {
    mockApi({ formula: null, adaptive: null, days_logged: 0 });
    renderSheet();
    await userEvent.click(screen.getByText("Body details (for the estimate)"));
    await userEvent.type(screen.getByLabelText("Height (cm)"), "1.8m");
    expect(screen.getByText("Enter a height between 100 and 250 cm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save details" })).toBeDisabled();
  });

  it("shows a refused save beside the details", async () => {
    mockApi({ formula: null, adaptive: null, days_logged: 0 }, PROFILE, true);
    renderSheet();
    await userEvent.click(screen.getByText("Body details (for the estimate)"));
    await userEvent.type(screen.getByLabelText("Height (cm)"), "180");
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Validation failed");
  });
});
