import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toLocalISO } from "@dashboard/shared";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";
import { YourDataCard } from "../src/features/settings/YourDataCard";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

/** The card reads the summary query now (redesign part 8), so it needs a client. */
const renderCard = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <YourDataCard />
    </QueryClientProvider>,
  );

const FILE = {
  format: "dashboard-export", version: 1, exported_at: "2026-10-04T12:00:00.000Z",
  account: { id: "u", email: "a@b.com", created_at: "2026-01-01T00:00:00+00:00" },
  tables: { body_weight: [{ date: "2026-10-01", weight_kg: 79.4 }] },
};

// jsdom has no URL.createObjectURL, and a link's click() does not download.
// These record what the card handed the browser instead.
let saved: { name: string; blob: Blob }[];
beforeEach(() => {
  saved = [];
  vi.mocked(toast.error).mockClear();
  const blobs = new Map<string, Blob>();
  URL.createObjectURL = vi.fn((b: Blob) => {
    const url = `blob:test/${blobs.size}`;
    blobs.set(url, b);
    return url;
  }) as never;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, blob: blobs.get(this.getAttribute("href")!)! });
  });
});
afterEach(() => vi.restoreAllMocks());

/** Mocked by PATH, per CLAUDE.md. */
function mockApi(answer: () => Promise<unknown>) {
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string) => {
    if (path === "/api/export/summary") return { since: null, weighIns: 0, sessions: 0, foodDays: 0, habits: 0 } as never;
    if (path === "/api/export") return (await answer()) as never;
    throw new Error(`unexpected ${path}`);
  });
}

const read = (b: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsText(b);
  });

describe("YourDataCard", () => {
  it("saves everything as one JSON file named with today's date", async () => {
    mockApi(async () => FILE);
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Download my data" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toBe(`dashboard-export-${toLocalISO()}.json`);
    expect(saved[0]!.blob.type).toBe("application/json");
    expect(JSON.parse(await read(saved[0]!.blob))).toEqual(FILE);
    expect(toast.error).not.toHaveBeenCalled();
  });

  // Review focus 5.
  it("says so when the download fails, saves nothing, and can be tried again", async () => {
    mockApi(async () => {
      throw new ApiError(500, "boom");
    });
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Download my data" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't download your data. Try again."));
    expect(saved).toHaveLength(0);
    await waitFor(() => expect(screen.getByRole("button", { name: "Download my data" })).toBeEnabled());
  });
});
