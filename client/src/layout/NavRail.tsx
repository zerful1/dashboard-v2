import { NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { NAV_ITEMS } from "./navItems";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/cn";
import { Mark } from "@/components/ui/Mark";

export function NavRail() {
  const { logout } = useAuth();

  return (
    <aside className="hidden w-[168px] shrink-0 flex-col border-r border-raised p-3 xl:flex">
      <div className="flex items-center gap-2 px-2 pb-4 text-sm font-semibold text-accent">
        <Mark size={18} />
        Dashboard
      </div>
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "mb-0.5 flex items-center gap-2.5 rounded-full px-3 py-2 text-sm transition",
              isActive ? "bg-accent/10 font-semibold text-accent" : "text-muted hover:text-text",
            )
          }
        >
          <Icon size={15} />
          {label}
        </NavLink>
      ))}
      {/* Sign-out lives at both breakpoints or neither. Below 1280px it is in
          the More sheet; without this the only one at 1280px and up was the
          button on the settings page — behind the profile query, so a user
          whose profile failed to load could not sign out from inside the app
          at all. `mt-auto` is what the column layout on the aside is for. */}
      <button
        onClick={() => void logout()}
        className="mt-auto flex items-center gap-2.5 rounded-full px-3 py-2 text-sm text-muted transition hover:text-text"
      >
        <LogOut size={15} />
        Sign out
      </button>
    </aside>
  );
}
