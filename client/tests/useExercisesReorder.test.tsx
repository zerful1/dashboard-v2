import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Exercise } from "@dashboard/shared";
import { useExercises } from "../src/hooks/useExercises";
import { createQueryClient } from "../src/lib/queryClient";
import * as apiModule from "../src/lib/api";

vi.mock("@/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false }),
}));

afterEach(() => vi.restoreAllMocks());

const ex = (id: string, i: number): Exercise => ({ id, user_id: "u1", day_type: 1, exercise_name: id, sort_order: i });

/**
 * A server whose reorders wait until the test lets them land, one call to
 * `land` each, in the order they were sent. The list reads what has landed.
 */
function slowServer() {
  let saved = ["a", "b", "c"];
  const waiting: (() => void)[] = [];
  vi.spyOn(apiModule, "api").mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/api/exercises/reorder")) {
      const ids = JSON.parse(String(init!.body)).ordered_ids as string[];
      await new Promise<void>((resolve) => waiting.push(() => { saved = ids; resolve(); }));
      return saved.map(ex) as never;
    }
    if (path.startsWith("/api/exercises")) return saved.map(ex) as never;
    throw new Error(`unexpected ${path}`);
  });
  return {
    waiting,
    land: async () => act(async () => waiting.shift()!()),
  };
}

function setup() {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useExercises(1), { wrapper });
  const order = () => view.result.current.exercises.map((e) => e.id).join("");
  return { ...view, order };
}

describe("useExercises reorder", () => {
  // Two quick moves: the first one's save and refetch finishing must not put
  // the list back to the first move while the second is still being saved.
  it("keeps the latest move on screen while an earlier one finishes saving", async () => {
    const server = slowServer();
    const { result, order } = setup();
    await waitFor(() => expect(order()).toBe("abc"));

    act(() => result.current.reorder.mutate(["b", "a", "c"]));
    act(() => result.current.reorder.mutate(["b", "c", "a"]));
    await waitFor(() => expect(server.waiting).toHaveLength(1));
    expect(order()).toBe("bca");

    await server.land();
    await waitFor(() => expect(server.waiting).toHaveLength(1));
    expect(order()).toBe("bca");

    await server.land();
    await waitFor(() => expect(result.current.reorder.isIdle || result.current.reorder.isSuccess).toBe(true));
    expect(order()).toBe("bca");
  });
});
