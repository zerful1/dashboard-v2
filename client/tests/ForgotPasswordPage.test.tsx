import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ForgotPasswordPage } from "../src/pages/ForgotPasswordPage";
import * as apiModule from "../src/lib/api";
import { ApiError } from "../src/lib/api";

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

async function submit(email: string) {
  await userEvent.type(screen.getByLabelText(/email/i), email);
  await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));
}

afterEach(() => vi.restoreAllMocks());

// POST /api/auth/forgot-password returns 204 unconditionally server-side —
// whether or not the account exists — so the endpoint can't be used to probe
// which emails are registered. The UI must preserve that property no matter
// what happens on the wire, including when the request itself fails: the
// page has to claim success either way, with nothing on screen that would
// let the two cases be told apart.
//
// This test's whole purpose is to fail loudly if a future "improvement"
// starts branching on the outcome — e.g. showing an error banner only when
// the request rejects. That would silently reintroduce an account-enumeration
// oracle, and nothing about the change would look wrong at a glance. The
// rejection case below exists specifically to catch that.
describe("ForgotPasswordPage — enumeration defence", () => {
  it("shows the check-your-email confirmation when the request succeeds", async () => {
    vi.spyOn(apiModule, "api").mockResolvedValueOnce(undefined);

    renderPage();
    await submit("a@b.com");

    expect(await screen.findByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the identical confirmation when the request rejects with a server error", async () => {
    vi.spyOn(apiModule, "api").mockRejectedValueOnce(new ApiError(500, "Internal Server Error"));

    renderPage();
    await submit("a@b.com");

    expect(await screen.findByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    // No error banner, and no wording anywhere that implies whether the
    // request actually succeeded or whether the account exists — the failure
    // path must be visually indistinguishable from the success path.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/error|failed|wrong|try again/i)).not.toBeInTheDocument();
  });
});
