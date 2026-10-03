import { Home, Scale, Dumbbell, Apple, TrendingUp, CheckSquare, Clapperboard, Settings } from "lucide-react";

// `primary` items get a slot in the bottom tab bar; the rest live behind More.
// Five primary slots plus More is the practical ceiling — at 390px that is 78px
// per tab, and the 8px mono labels fit. A sixth would start truncating.
export const NAV_ITEMS = [
  { to: "/", label: "Home", icon: Home, primary: true },
  // Daily-use screen, and the only one here backed by real data, so it earns a
  // tab rather than sitting behind More.
  { to: "/weight", label: "Weight", icon: Scale, primary: true },
  { to: "/gym", label: "Gym", icon: Dumbbell, primary: true },
  { to: "/nutrition", label: "Food", icon: Apple, primary: true },
  // The fifth and last primary slot (see the ceiling note above).
  { to: "/insights", label: "Insights", icon: TrendingUp, primary: true },
  { to: "/habits", label: "Habits", icon: CheckSquare, primary: false },
  { to: "/media", label: "Media", icon: Clapperboard, primary: false },
  { to: "/settings", label: "Settings", icon: Settings, primary: false },
] as const;
