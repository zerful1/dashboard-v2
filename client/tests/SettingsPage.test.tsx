import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { SettingsPage } from "../src/pages/SettingsPage";
import { AuthProvider } from "../src/auth/AuthProvider";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

function renderPage() {
  return render(
    <MemoryRouter>
    <QueryClientProvider
      client={
        new QueryClient({
          // No retries: the point here is what the settled failure renders,
          // and the app's own `retry: 1` would only make the test slower.
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      <AuthProvider>
        <SettingsPage />
      </AuthProvider>
    </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => vi.restoreAllMocks());

const PROFILE = {
  user_id: "1",
  timezone: "Europe/London",
  updated_at: "",
  height_cm: null,
  birth_year: null,
  sex: null,
  activity_level: null,
};

const SUMMARY = { since: "2026-06-24", weighIns: 108, sessions: 71, foodDays: 112, habits: 2 };

/** Serves the page, and captures the DELETE and PATCH it sends. Mocked by PATH, longest first. */
function mockWithDelete(summary: unknown = SUMMARY) {
  const calls: { path: string; init?: RequestInit }[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/auth/me") return { id: "1", email: "a@b.com" } as never;
    if (path.startsWith("/api/export/summary")) return summary as never;
    if (path.startsWith("/api/split")) return { days: [{ day_type: 1, label: "Push" }], week: [1, 1, 1, 1, 1, "rest", "rest"] } as never;
    if (path.startsWith("/api/nutrition/targets")) return [] as never;
    if (path.startsWith("/api/goals")) return [] as never;
    if (path.startsWith("/api/habits")) return [] as never;
    if (path === "/api/profile" && init?.method === "PATCH") {
      calls.push({ path, init });
      return { ...PROFILE, ...JSON.parse(String(init.body)) } as never;
    }
    if (path === "/api/profile" && (init?.method ?? "GET") === "GET") return PROFILE as never;
    if (path === "/api/profile" && init?.method === "DELETE") {
      calls.push({ path, init });
      // Never resolves: onSuccess would assign window.location, which jsdom
      // cannot perform. The body is captured at call time regardless.
      return new Promise(() => {}) as never;
    }
    throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
  });
  return calls;
}

describe("SettingsPage account deletion", () => {
  it("keeps the delete button disabled until a password is typed", async () => {
    mockWithDelete();
    renderPage();
    const button = await screen.findByRole("button", { name: /delete account/i });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/confirm with your password/i), "hunter2");
    expect(button).toBeEnabled();
  });

  it("sends the typed password with the delete request", async () => {
    const calls = mockWithDelete();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await userEvent.type(
      await screen.findByLabelText(/confirm with your password/i),
      "hunter2",
    );
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ password: "hunter2" });
  });
});

describe("SettingsPage", () => {
  // The failure this pins is silent by construction: in TanStack Query v5 a
  // settled-with-error query has isLoading false and data undefined, so a
  // guard written as `isLoading || !profile` falls through to the spinner and
  // stays there. Nothing throws, nothing logs, and the page says "loading"
  // about a request that stopped a minute ago. The database this reads
  // through pauses when it has been idle for a week, so it is a live case.
  it("renders an error with a retry, not a spinner, when the profile query fails", async () => {
    const spy = vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
      if (path === "/api/auth/me") return { id: "1", email: "a@b.com" };
      throw new ApiError(503, "Service Unavailable");
    });

    renderPage();

    const retry = await screen.findByRole("button", { name: /try again/i });
    // Restyled like Insights (redesign part 8): red words, an outline retry.
    expect(screen.getByRole("alert")).toHaveClass("text-negative");
    expect(retry).toHaveClass("border-edge");

    // Both halves matter. An error that appears *next to* a permanent spinner
    // would satisfy "an error is shown" while leaving the page just as stuck.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(retry).toBeInTheDocument();

    // And the retry is wired to a refetch rather than being decoration.
    const before = spy.mock.calls.filter((c) => c[0] === "/api/profile").length;
    await userEvent.click(retry);
    await waitFor(() =>
      expect(spy.mock.calls.filter((c) => c[0] === "/api/profile").length).toBeGreaterThan(before),
    );
  });
});

describe("SettingsPage data export", () => {
  it("offers the download above the account controls", async () => {
    mockWithDelete();
    renderPage();
    const download = await screen.findByRole("button", { name: "Download my data" });
    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(download.compareDocumentPosition(signOut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("SettingsPage, redesigned (part 8)", () => {
  it("is headed Settings, with its sections in order", async () => {
    mockWithDelete();
    renderPage();
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByText("Your account")).toBeNull();
    const names = ["Set on other pages", "Your data", "Password", "App", "Account"];
    const headings = names.map((name) => screen.getByRole("heading", { level: 2, name }));
    for (let i = 1; i < headings.length; i++) {
      expect(headings[i - 1]!.compareDocumentPosition(headings[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("has one white action, Change password", async () => {
    mockWithDelete();
    const { container } = renderPage();
    await screen.findByRole("heading", { level: 1, name: "Settings" });
    const white = [...container.querySelectorAll("button.bg-accent")].map((b) => b.textContent);
    expect(white).toEqual(["Change password"]);
  });

  it("shows what is stored", async () => {
    mockWithDelete();
    renderPage();
    expect(
      await screen.findByText((_, el) => el?.tagName === "P" &&
        el.textContent === "Since 24 Jun 2026: 108 weigh-ins · 71 sessions · 112 days of food · 2 habits"),
    ).toBeInTheDocument();
  });

  it("says when nothing is logged yet", async () => {
    mockWithDelete({ since: null, weighIns: 0, sessions: 0, foodDays: 0, habits: 0 });
    renderPage();
    expect(await screen.findByText("Nothing logged yet.")).toBeInTheDocument();
  });

  it("shows the email and the timezone under Account", async () => {
    const calls = mockWithDelete();
    renderPage();
    const tz = await screen.findByLabelText("Timezone");
    expect(screen.getByText("Used to keep times right when you copy a day of food.")).toBeInTheDocument();
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    await userEvent.clear(tz);
    await userEvent.type(tz, "europe/warsaw");
    await userEvent.tab();
    await waitFor(() => expect(calls.filter((c) => c.init?.method === "PATCH")).toHaveLength(1));
    expect(JSON.parse(String(calls.find((c) => c.init?.method === "PATCH")!.init!.body))).toEqual({ timezone: "Europe/Warsaw" });
  });

  it("no longer offers display name or units", async () => {
    mockWithDelete();
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Settings" });
    expect(screen.queryByLabelText("Display name")).toBeNull();
    expect(screen.queryByText("Units")).toBeNull();
  });
});
