import { NavLink } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { NAV_ITEMS } from "./navItems";
import { cn } from "@/lib/cn";

export function BottomTabs({ onMore }: { onMore: () => void }) {
  const primary = NAV_ITEMS.filter((i) => i.primary);

  return (
    <nav className="flex shrink-0 border-t border-raised bg-bg pb-[env(safe-area-inset-bottom)] xl:hidden">
      {primary.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn("flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5", isActive ? "text-accent" : "text-muted")
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={18} />
              <span className="text-label font-medium">{label}</span>
              {/* The current tab's dot: identity chrome, not an action. */}
              <span data-part="dot" aria-hidden className={cn("h-1 w-1 rounded-full", isActive && "bg-accent")} />
            </>
          )}
        </NavLink>
      ))}
      <button onClick={onMore} className="flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-muted">
        <MoreHorizontal size={18} />
        <span className="text-label font-medium">More</span>
        <span aria-hidden className="h-1 w-1" />
      </button>
    </nav>
  );
}
