import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { RESTORED_TABLES, type RestoreCounts } from "@dashboard/shared";
import { createQueryClient } from "../src/lib/queryClient";
import { ApiError } from "../src/lib/api";
import { restoreApi } from "../src/api/restore";
import { RestoreSheet } from "../src/features/settings/RestoreSheet";
import { REQUEST_CAP_BYTES, packBody, type PackedBody } from "../src/features/settings/restoreFile";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("../src/api/restore", () => ({ restoreApi: { preview: vi.fn(), restore: vi.fn() } }));
// Packing is restoreFile.test's; here the body only has to reach the API unchanged.
vi.mock("../src/features/settings/restoreFile", async (orig) => ({
  ...(await orig<typeof import("../src/features/settings/restoreFile")>()),
  packBody: vi.fn(async (text: string) => ({ body: text, gzipped: false, bytes: text.length })),
}));

const zero = Object.fromEntries(RESTORED_TABLES.map((t) => [t, 0])) as RestoreCounts;
const DOWNLOAD = JSON.stringify({ format: "dashboard-export", version: 1, tables: {} });
const PACKED = { body: DOWNLOAD, gzipped: false, bytes: DOWNLOAD.length };
const download = (text = DOWNLOAD) => new File([text], "download.json", { type: "application/json" });

function renderSheet(open = true) {
  const qc = createQueryClient();
  const onClose = vi.fn();
  const view = render(
    <QueryClientProvider client={qc}>
      <RestoreSheet open={open} onClose={onClose} />
    </QueryClientProvider>,
  );
  const reopen = (o: boolean) =>
    view.rerender(
      <QueryClientProvider client={qc}>
        <RestoreSheet open={o} onClose={onClose} />
      </QueryClientProvider>,
    );
  return { qc, onClose, reopen };
}

const pick = async (file = download()) => userEvent.upload(screen.getByLabelText("Your download"), file);

beforeEach(() => {
  vi.mocked(restoreApi.preview).mockReset();
  vi.mocked(restoreApi.restore).mockReset();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

describe("RestoreSheet", () => {
  it("lists what's missing and adds it back", async () => {
    const added = { ...zero, body_weight: 2, workout_sessions: 1 };
    vi.mocked(restoreApi.preview).mockResolvedValue({ added });
    vi.mocked(restoreApi.restore).mockResolvedValue({ added });
    const { qc, onClose } = renderSheet();
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    await pick();
    expect(await screen.findByText("Weigh-ins 2 · Gym sessions 1")).toBeInTheDocument();
    expect(
      screen.getByText("Everything else in the file is already here. Nothing in your account will change or be removed."),
    ).toBeInTheDocument();
    expect(restoreApi.preview).toHaveBeenCalledWith(PACKED);

    await userEvent.click(screen.getByRole("button", { name: "Add them back" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Added back 3 things"));
    expect(restoreApi.restore).toHaveBeenCalledTimes(1);
    expect(restoreApi.restore).toHaveBeenCalledWith(PACKED);
    expect(invalidate).toHaveBeenCalledWith();
    expect(onClose).toHaveBeenCalled();
  });

  it("says 'Added back 1 thing' for one", async () => {
    const added = { ...zero, habits: 1 };
    vi.mocked(restoreApi.preview).mockResolvedValue({ added });
    vi.mocked(restoreApi.restore).mockResolvedValue({ added });
    renderSheet();
    await pick();
    await userEvent.click(await screen.findByRole("button", { name: "Add them back" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Added back 1 thing"));
  });

  it("says everything's already here, with no button", async () => {
    vi.mocked(restoreApi.preview).mockResolvedValue({ added: zero });
    renderSheet();
    await pick();
    expect(await screen.findByText("Everything in this file is already here.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add them back" })).toBeNull();
  });

  it("says it isn't a download, and sends nothing", async () => {
    renderSheet();
    await pick(download(JSON.stringify({ hello: "world" })));
    expect(await screen.findByText("This isn't a dashboard download")).toBeInTheDocument();
    expect(restoreApi.preview).not.toHaveBeenCalled();
  });

  it("shows a refusal in the sheet, not as a toast", async () => {
    vi.mocked(restoreApi.preview).mockRejectedValue(new ApiError(400, "This download belongs to another account."));
    renderSheet();
    await pick();
    expect(await screen.findByRole("alert")).toHaveTextContent("This download belongs to another account.");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows a failed restore in the sheet too, and stays open", async () => {
    vi.mocked(restoreApi.preview).mockResolvedValue({ added: { ...zero, body_weight: 1 } });
    vi.mocked(restoreApi.restore).mockRejectedValue(new ApiError(400, "This file couldn't be restored. Nothing was changed."));
    const { onClose } = renderSheet();
    await pick();
    await userEvent.click(await screen.findByRole("button", { name: "Add them back" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This file couldn't be restored. Nothing was changed.");
    expect(toast.error).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // Both mutations opt out of the toast, so the sheet words these as the toast would.
  it("says it's offline in words, not the browser's", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.mocked(restoreApi.preview).mockRejectedValue(new TypeError("Failed to fetch"));
    renderSheet();
    await pick();
    expect(await screen.findByRole("alert")).toHaveTextContent("You're offline — not saved");
    vi.restoreAllMocks();
  });

  it("says a timed-out restore may not have saved", async () => {
    vi.mocked(restoreApi.preview).mockResolvedValue({ added: { ...zero, body_weight: 1 } });
    vi.mocked(restoreApi.restore).mockRejectedValue(new ApiError(0, "Timed out", "timeout"));
    renderSheet();
    await pick();
    await userEvent.click(await screen.findByRole("button", { name: "Add them back" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Timed out — may not have saved");
  });

  it("tells the demo it can't restore", async () => {
    vi.mocked(restoreApi.preview).mockRejectedValue(new ApiError(403, "This is a read-only demo — nothing you change is saved"));
    renderSheet();
    await pick();
    expect(await screen.findByRole("alert")).toHaveTextContent("The demo can't restore downloads.");
  });

  it("can't add twice while the first is saving", async () => {
    vi.mocked(restoreApi.preview).mockResolvedValue({ added: { ...zero, body_weight: 1 } });
    vi.mocked(restoreApi.restore).mockReturnValue(new Promise(() => {}));
    renderSheet();
    await pick();
    const add = await screen.findByRole("button", { name: "Add them back" });
    await userEvent.click(add);
    await waitFor(() => expect(add).toBeDisabled());
    await userEvent.click(add);
    expect(restoreApi.restore).toHaveBeenCalledTimes(1);
  });

  // Another device restored the same file between the preview and the button.
  it("says everything's already here when the restore adds nothing", async () => {
    vi.mocked(restoreApi.preview).mockResolvedValue({ added: { ...zero, body_weight: 1 } });
    vi.mocked(restoreApi.restore).mockResolvedValue({ added: zero });
    const { onClose } = renderSheet();
    await pick();
    await userEvent.click(await screen.findByRole("button", { name: "Add them back" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Everything in this file is already here"));
    expect(onClose).toHaveBeenCalled();
  });

  it("says a file is too large for this browser to send, and sends nothing", async () => {
    vi.mocked(packBody).mockResolvedValueOnce({ body: DOWNLOAD, gzipped: false, bytes: REQUEST_CAP_BYTES + 1 });
    renderSheet();
    await pick();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This browser can't send a file this large. Try an up-to-date browser.",
    );
    expect(restoreApi.preview).not.toHaveBeenCalled();
  });

  // Packing the first file outlasts reading and previewing the second.
  it("keeps the newer file when an older pick finishes after it", async () => {
    const older = JSON.stringify({ format: "dashboard-export", version: 1, tables: {}, which: "older" });
    let release!: () => void;
    vi.mocked(packBody).mockImplementationOnce(
      (text) =>
        new Promise<PackedBody>((resolve) => {
          release = () => resolve({ body: text, gzipped: false, bytes: text.length });
        }),
    );
    vi.mocked(restoreApi.preview).mockImplementation(async ({ body }) => ({
      added: body === older ? { ...zero, body_weight: 5 } : { ...zero, habits: 1 },
    }));
    renderSheet();
    await pick(download(older));
    await waitFor(() => expect(packBody).toHaveBeenCalledWith(older));
    await pick();
    expect(await screen.findByText("Habits 1")).toBeInTheDocument();

    await act(async () => release());
    expect(screen.getByText("Habits 1")).toBeInTheDocument();
    expect(screen.queryByText("Weigh-ins 5")).toBeNull();
    expect(restoreApi.preview).toHaveBeenCalledTimes(1);
  });

  it("can't pick another file while a restore is running", async () => {
    vi.mocked(restoreApi.preview).mockResolvedValue({ added: { ...zero, body_weight: 1 } });
    vi.mocked(restoreApi.restore).mockReturnValue(new Promise(() => {}));
    renderSheet();
    await pick();
    expect(screen.getByLabelText("Your download")).toBeEnabled();
    await userEvent.click(await screen.findByRole("button", { name: "Add them back" }));
    await waitFor(() => expect(screen.getByLabelText("Your download")).toBeDisabled());
  });

  it("starts clean when reopened", async () => {
    vi.mocked(restoreApi.preview).mockResolvedValue({ added: { ...zero, body_weight: 1 } });
    const { reopen } = renderSheet();
    await pick();
    await screen.findByText("Weigh-ins 1");

    reopen(false);
    // The sheet's exit animation keeps it mounted for a moment.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    reopen(true);
    expect(await screen.findByLabelText("Your download")).toBeInTheDocument();
    expect(screen.queryByText("Weigh-ins 1")).toBeNull();
  });
});
