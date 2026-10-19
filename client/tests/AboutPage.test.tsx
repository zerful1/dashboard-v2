import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, RouterProvider, createMemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AboutPage } from "../src/pages/AboutPage";
import { routes } from "../src/router";
import { AuthProvider } from "../src/auth/AuthProvider";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

const USER = { id: "u1", email: "you@example.com" };
const DEMO = { id: "d", email: "demo@demo.invalid" };

/** By path, never by call order (CLAUDE.md). `me` is the session check's answer. */
function mockApi(opts: { me?: unknown; demo?: ApiError } = {}) {
  let me: unknown = opts.me ?? new ApiError(401, "Not authenticated");
  const calls: string[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    if (method === "GET" && path === "/api/auth/me") {
      if (me instanceof Error) throw me;
      return (await me) as never;
    }
    if (method === "POST" && path === "/api/auth/demo") {
      if (opts.demo) throw opts.demo;
      me = DEMO;
      return undefined as never;
    }
    throw new Error(`unmocked path: ${method} ${path}`);
  });
  return calls;
}

const providers = (children: ReactNode) => (
  <QueryClientProvider client={new QueryClient()}>
    <AuthProvider>{children}</AuthProvider>
  </QueryClientProvider>
);

function renderPage() {
  render(
    providers(
      <MemoryRouter initialEntries={["/about"]}>
        <Routes>
          <Route path="/about" element={<AboutPage />} />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

/** The real route table: a public page must sit outside ProtectedRoute. */
function renderRoutes(path: string) {
  render(providers(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />));
}

const whitePills = () => document.querySelectorAll(".bg-accent").length;
const never = new Promise<never>(() => {});

afterEach(() => vi.restoreAllMocks());

// Housekeeping PR 4 (spec §5): the public project page.
describe("AboutPage", () => {
  it("opens for a signed-out visitor with no API call but the session check", async () => {
    const calls = mockApi();
    renderRoutes("/about");
    expect(await screen.findByRole("button", { name: "Try the demo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(calls).toEqual(["GET /api/auth/me"]);
  });

  it("offers the demo and sign-in when signed out", async () => {
    mockApi();
    renderPage();
    expect(await screen.findByRole("button", { name: "Try the demo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(whitePills()).toBe(1);
    expect(screen.queryByRole("link", { name: "Open the app" })).toBeNull();
  });

  it("offers the app when signed in", async () => {
    mockApi({ me: USER });
    renderPage();
    expect(await screen.findByRole("link", { name: "Open the app" })).toHaveAttribute("href", "/");
    expect(whitePills()).toBe(1);
    expect(screen.queryByRole("button", { name: "Try the demo" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  // R3: a signed-in visitor on a slow check must not see the demo flash first.
  it("shows no actions while the session is being checked", async () => {
    mockApi({ me: never });
    renderPage();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try the demo" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open the app" })).toBeNull();
  });

  it("still offers the demo when the session check fails", async () => {
    mockApi({ me: new ApiError(500, "boom") });
    renderPage();
    expect(await screen.findByRole("button", { name: "Try the demo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("enters the demo and opens the app", async () => {
    const calls = mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Try the demo" }));
    expect(await screen.findByText("home")).toBeInTheDocument();
    expect(calls).toContain("POST /api/auth/demo");
  });

  it("says so when the demo can't be opened", async () => {
    mockApi({ demo: new ApiError(503, "The demo is unavailable") });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Try the demo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The demo is unavailable");
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  // The final review: the login page's link is the last thing on it, and a
  // navigation keeps the scroll, so a small phone opened this page past its title.
  it("opens at the top of the page", async () => {
    mockApi();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderPage();
    await screen.findByRole("button", { name: "Try the demo" });
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("says what the spec says", async () => {
    mockApi();
    renderPage();
    await screen.findByRole("button", { name: "Try the demo" });
    const copy = [
      "Project info",
      "A personal tracker for training, body weight, food and habits: my own single-user app, rebuilt as a full-stack, multi-user web app.",
      "What it does",
      "Logs gym sessions set by set, and suggests the next set from your history",
      "Tracks body weight with a trend line and a projected goal date",
      "Logs food by search or barcode against calorie and protein targets",
      "Reviews each week, and keeps daily habits",
      "Built with",
      "Worth a look",
      "Every query is scoped to its user, with an ownership test per table",
      "Works offline from a per-user cache; a failed save says so instead of vanishing",
      "The demo is kept read-only by the server, not just the buttons",
      "Dates stay as plain strings end to end, so daylight saving can't shift a day",
      "How it was built",
      "Designed and directed by me, built with Claude Code as an AI pair programmer. Every change started as a written spec, was built test-first and reviewed before merging.",
    ];
    for (const text of copy) expect(screen.getByText(text)).toBeInTheDocument();
    // R1: the mockup's grouping, 8 chips.
    const chips = ["TypeScript", "React 19", "TanStack Query", "Tailwind 4", "Node · Express", "PostgreSQL · Supabase", "Vitest", "Vercel"];
    expect(chips.map((c) => screen.getAllByText(c).length)).toEqual(chips.map(() => 1));
  });
});
