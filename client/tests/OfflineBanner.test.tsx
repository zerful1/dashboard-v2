import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OfflineBanner } from "../src/components/ui/OfflineBanner";

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
  });
}

afterEach(() => {
  setOnLine(true);
  vi.restoreAllMocks();
});

describe("OfflineBanner", () => {
  it("renders nothing while online", () => {
    setOnLine(true);
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders on mount when already offline", () => {
    // The initial state matters on its own: navigating to the app while already
    // offline fires no 'offline' event, so a banner that only listened would
    // never appear for exactly the person who needs it.
    setOnLine(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/offline/i);
  });

  it("appears when the connection drops and clears when it returns", () => {
    setOnLine(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      setOnLine(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      setOnLine(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces politely rather than interrupting", () => {
    setOnLine(false);
    render(<OfflineBanner />);
    // assertive would cut across whatever is being read. Being offline is worth
    // knowing, not worth interrupting for.
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("says changes will not save, not merely that you are offline", () => {
    // The load-bearing half of the message: writes are NOT queued, so someone
    // who logs a set offline loses it. A banner that only said "Offline" would
    // imply the app was coping.
    setOnLine(false);
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/won’t save/i);
  });

  it("stops listening once unmounted", () => {
    setOnLine(true);
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<OfflineBanner />);
    unmount();
    const events = remove.mock.calls.map((c) => c[0]);
    expect(events).toContain("online");
    expect(events).toContain("offline");
  });
});
