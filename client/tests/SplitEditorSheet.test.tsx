import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SplitEditorSheet } from "../src/features/gym/SplitEditorSheet";
import { DEFAULT_SPLIT } from "@dashboard/shared";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

/** By path, per the house rule — GET and PUT share /api/split. */
function mockSplit(current: unknown) {
  return vi.spyOn(apiModule, "api").mockImplementation(async (path: string, options?: RequestInit) => {
    if (path === "/api/split") return options?.method === "PUT" ? JSON.parse(String(options.body)) : current;
    throw new Error(`unexpected ${path}`);
  });
}

function renderSheet(current: unknown = DEFAULT_SPLIT) {
  const spy = mockSplit(current);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <SplitEditorSheet open onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, spy };
}

afterEach(() => vi.restoreAllMocks());

describe("SplitEditorSheet", () => {
  it("seeds from the current split", async () => {
    renderSheet();
    // By label, not by display value: DEFAULT_SPLIT maps Wednesday to Legs, so
    // getByDisplayValue("Legs") also matches the Wednesday <select> and throws
    // on multiple matches.
    await waitFor(() => expect(screen.getByLabelText("Name for day 1")).toHaveValue("Legs"));
  });

  it("renames a day in the draft without saving", async () => {
    renderSheet();
    const input = await screen.findByLabelText("Name for day 1");

    await userEvent.clear(input);
    await userEvent.type(input, "Leg Day");
    expect(screen.getByLabelText("Name for day 1")).toHaveValue("Leg Day");
  });

  it("blocks saving when a day has a blank name", async () => {
    renderSheet();
    const input = await screen.findByLabelText("Name for day 1");

    await userEvent.clear(input);
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Every day needs a name");
  });

  it("trims labels on save", async () => {
    const { onClose, spy } = renderSheet();
    const input = await screen.findByLabelText("Name for day 1");

    await userEvent.clear(input);
    await userEvent.type(input, "  Leg Day  ");
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      const put = spy.mock.calls.find((c) => c[1]?.method === "PUT");
      expect(JSON.parse(String(put![1]!.body)).days[0].label).toBe("Leg Day");
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("adds a day with the next free day_type", async () => {
    renderSheet();
    await screen.findByLabelText("Name for day 1");

    await userEvent.click(screen.getByRole("button", { name: /add day/i }));
    // DEFAULT_SPLIT tops out at 5, so the new one is 6.
    expect(screen.getByLabelText("Name for day 6")).toBeInTheDocument();
  });

  it("refuses to remove the last remaining day", async () => {
    // Opened AFTER the split has loaded, which is what happens in the app: the
    // sheet is mounted closed and the user taps to open it. Rendering it
    // already-open fires the closed→open edge on the first paint, when
    // useSplit is still returning DEFAULT_SPLIT — so the draft would seed from
    // the default and then correctly refuse to reseed. That is the
    // edge-triggered seed working, not a bug to design around.
    mockSplit({
      days: [{ day_type: 1, label: "Only" }],
      week: ["rest", "rest", "rest", "rest", "rest", "rest", "rest"],
    });
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const Wrapper = ({ open }: { open: boolean }) => (
      <QueryClientProvider client={qc}>
        <SplitEditorSheet open={open} onClose={vi.fn()} />
      </QueryClientProvider>
    );

    const { rerender } = render(<Wrapper open={false} />);
    await waitFor(() => expect(qc.getQueryData(["split", "u1"])).toBeDefined());

    rerender(<Wrapper open />);
    expect(await screen.findByLabelText("Remove Only")).toBeDisabled();
  });

  it("does not reseed the draft while open when the split query settles", async () => {
    // The reason the seed is edge-triggered: the save this sheet performs
    // invalidates the split query, so a refetch landing mid-edit would discard
    // whatever was being typed.
    renderSheet();
    const input = await screen.findByLabelText("Name for day 1");

    await userEvent.clear(input);
    await userEvent.type(input, "Mid-edit");

    // Let any in-flight query settle and re-render the subscriber. Asserted on
    // the input itself — the Wednesday select still legitimately reads "Legs".
    await waitFor(() => expect(screen.getByLabelText("Name for day 1")).toHaveValue("Mid-edit"));
  });
});
