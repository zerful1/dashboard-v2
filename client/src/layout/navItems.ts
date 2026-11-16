import { Home, Scale, Dumbbell, Apple, TrendingUp, CheckSquare, Settings } from "lucide-react";

// `primary` items get a bottom-tab slot, the rest sit behind More; five plus More is the ceiling at 390px.
export const NAV_ITEMS = [
  { to: "/", label: "Home", icon: Home, primary: true },
  // Daily-use screen, so it earns a tab rather than sitting behind More.
  { to: "/weight", label: "Weight", icon: Scale, primary: true },
  { to: "/gym", label: "Gym", icon: Dumbbell, primary: true },
  { to: "/nutrition", label: "Food", icon: Apple, primary: true },
  // The fifth and last primary slot (see the ceiling note above).
  { to: "/insights", label: "Insights", icon: TrendingUp, primary: true },
  { to: "/habits", label: "Habits", icon: CheckSquare, primary: false },
  { to: "/settings", label: "Settings", icon: Settings, primary: false },
] as const;
