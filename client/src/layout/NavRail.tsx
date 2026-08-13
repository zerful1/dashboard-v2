import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "./navItems";
import { cn } from "@/lib/cn";

export function NavRail() {
  return (
    <aside className="hidden w-[168px] shrink-0 border-r border-raised p-3 xl:block">
      <div className="lbl px-2 pb-3 text-accent">Dashboard</div>
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
              isActive ? "bg-accent/10 font-semibold text-accent" : "text-muted hover:bg-surface",
            )
          }
        >
          <Icon size={15} />
          {label}
        </NavLink>
      ))}
    </aside>
  );
}
