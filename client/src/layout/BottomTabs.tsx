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
            cn(
              "flex flex-1 flex-col items-center gap-1 py-2",
              isActive ? "text-accent" : "text-dim",
            )
          }
        >
          <Icon size={19} />
          <span className="font-mono text-label tracking-label uppercase">{label}</span>
        </NavLink>
      ))}
      <button
        onClick={onMore}
        className="flex flex-1 flex-col items-center gap-1 py-2 text-dim"
      >
        <MoreHorizontal size={19} />
        <span className="font-mono text-label tracking-label uppercase">More</span>
      </button>
    </nav>
  );
}
