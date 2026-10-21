import { Suspense, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { NAV_ITEMS } from "./navItems";
import { NavRail } from "./NavRail";
import { BottomTabs } from "./BottomTabs";
import { useAuth } from "@/auth/AuthProvider";
import { Spinner } from "@/components/ui/Spinner";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { DemoBanner } from "@/components/ui/DemoBanner";

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
  // are visible below 1024px; NavRail is visible at 1024px and up (moved down
  // from 1280px on 2026-10-20: a laptop window that wasn't full screen got the
  // phone's tab bar stretched across it). The More sheet's `lg:hidden` here
  // and BottomTabs' must stay the exact complement of NavRail's `lg:flex`:
  // the same threshold, not just the same breakpoint name. A mismatched
  // pair — say one of these reverting to another breakpoint's hidden-utility
  // while the other two stay put — doesn't fail loudly, it
  // opens a band of viewport widths with no nav at all (or, the other
  // direction, both rail and tab bar at once). jsdom never evaluates media
  // queries, so navBreakpoints.test reads the classes instead: every
  // hidden/flex breakpoint in the three layout files must be the same one.
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main className="flex-1 overflow-y-auto">
          {/* Inside <main>, so it sits in the content column - under the nav rail
              on desktop, above the content on mobile - and cannot cover the tab
              bar, which is a sibling below. Sticky because <main> is the scroll
              container: a plain block would scroll away, and a banner saying
              "these numbers may be stale" is worth nothing if it is only true
              at the top of the page. */}
          <div className="sticky top-0 z-10">
            <DemoBanner />
            <OfflineBanner />
          </div>
          {/* One centred column at every width, Home's rule
              applied to every page on 2026-10-20. No page has a desktop layout
              of its own, and without the cap on a wide screen every row stretched
              across the screen, a lift's name a screen's width from its number. */}
          <div className="mx-auto w-full max-w-2xl px-4 py-5 lg:px-6">
            {/* Every page inside the shell is a lazy chunk, and this is the one
                boundary they all share. It sits INSIDE the layout deliberately:
                the nav and sign-out stay on screen while a chunk loads, so a
                navigation never blanks the app. A boundary above the layout
                would take the whole shell down on every transition. */}
            <Suspense fallback={<Spinner label="Loading" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <BottomTabs onMore={() => setMoreOpen(true)} />

      {moreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60 lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-[22px] border-t border-edge bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-[17px] font-semibold tracking-tight">More</div>
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
              // Closes the sheet first, unconditionally. Sign-out is
              // fire-and-forget and cannot reject, but it is also not
              // instant — leaving the sheet open over the screen behind it
              // while the request is in flight reads as a dead button.
              onClick={() => {
                setMoreOpen(false);
                void logout();
              }}
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
