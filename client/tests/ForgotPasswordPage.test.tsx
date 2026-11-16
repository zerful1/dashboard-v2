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

// The endpoint returns 204 whether or not the account exists, so the UI must claim success either way.
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
    // No error banner or wording that implies whether the request succeeded or the account exists.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/error|failed|wrong|try again/i)).not.toBeInTheDocument();
  });
});
