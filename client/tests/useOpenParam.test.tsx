import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigationType } from "react-router-dom";
import { useOpenParam } from "../src/hooks/useOpenParam";

function Probe({ open }: { open: () => void }) {
  useOpenParam("split", open);
  return (
    <>
      <span data-testid="search">{useLocation().search}</span>
      <span data-testid="nav">{useNavigationType()}</span>
    </>
  );
}
const renderAt = (url: string, open: () => void) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Probe open={open} />
    </MemoryRouter>,
  );

describe("useOpenParam", () => {
  it("calls open for its own name and removes the parameter", () => {
    const open = vi.fn();
    renderAt("/x?open=split&keep=1", open);
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("search")).toHaveTextContent(/^\?keep=1$/);
    // Replaced, not pushed: Back must not land on the URL that opens it again.
    // (The search alone reads the same after a push.)
    expect(screen.getByTestId("nav")).toHaveTextContent("REPLACE");
  });

  it("ignores another name", () => {
    const open = vi.fn();
    renderAt("/x?open=targets", open);
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByTestId("search")).toHaveTextContent("?open=targets");
  });
});
