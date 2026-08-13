import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ResetPasswordPage } from "../src/pages/ResetPasswordPage";

function renderWithoutToken() {
  return render(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

// With no ?token= in the URL there is nothing to submit against, so the page
// must short-circuit to a "link is incomplete" state instead of rendering a
// form whose submission could only ever fail. Split into two cases — the
// message and the absent form are two separate claims, and a page that
// regressed to showing both (or neither) should fail exactly one of them
// rather than being obscured by a single combined assertion.
describe("ResetPasswordPage — missing-token branch", () => {
  it("shows the link-is-incomplete message when the URL has no ?token=", () => {
    renderWithoutToken();

    expect(screen.getByRole("heading", { name: /link is incomplete/i })).toBeInTheDocument();
  });

  it("does not render the password form when the URL has no ?token=", () => {
    renderWithoutToken();

    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    // Belt and braces: no password input anywhere, regardless of labelling.
    expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument();
  });
});
