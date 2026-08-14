import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "./navItems";
import { NavRail } from "./NavRail";
import { BottomTabs } from "./BottomTabs";
import { useAuth } from "@/auth/AuthProvider";

export function AppLayout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuth();

  // The sheet's only pointer-based dismissal is the backdrop click. A
  // keyboard user has no pointer, so without this Escape would leave them
  // with no way out short of tabbing through every option — this is the
  // minimal, non-focus-trapping fix for that gap.
  useEffect(() => {
    if (!moreOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);

  // Two layouts, not three. BottomTabs and the More sheet below (the same
  // mobile affordance — the sheet is what the tab bar's "More" button opens)
  // are visible below 1280px; NavRail is visible at 1280px and up. Both
  // `xl:hidden` occurrences here must stay the exact complement of NavRail's
  // `xl:block`: the same threshold, not just the same breakpoint name. A
  // mismatched pair — say one of these reverting to a smaller breakpoint's
  // hidden-utility while the other two stay put — doesn't fail loudly, it
  // opens a band of viewport widths with no nav at all (or, the other
  // direction, both rail and tab bar at once). jsdom never evaluates media
  // queries, so no test will catch that drift; this has to
  // be caught by whoever next touches one of these three classes.
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main className="flex-1 overflow-y-auto">
          {/* Single column below 1280px; two-pane layouts are introduced
              per-feature from phase 4, only where a detail view exists. */}
          <div className="mx-auto w-full max-w-2xl px-4 py-5 xl:max-w-none xl:px-6">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomTabs onMore={() => setMoreOpen(true)} />

      {moreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60 xl:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-2xl border-t border-raised bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lbl mb-3">More</div>
            {NAV_ITEMS.filter((i) => !i.primary).map(({ to, label }) => (
              <button
                key={to}
                onClick={() => {
                  setMoreOpen(false);
                  navigate(to);
                }}
                className="flex w-full items-center justify-between border-b border-raised py-3.5 text-left text-base last:border-0"
              >
                {label}
                <span className="text-dim">›</span>
              </button>
            ))}
            <button
              onClick={() => void logout()}
              className="mt-2 w-full py-3.5 text-left text-base text-muted"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
