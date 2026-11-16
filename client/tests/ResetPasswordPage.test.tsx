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

// With no ?token= there is nothing to submit, so the page shows a "link is incomplete" state.
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
