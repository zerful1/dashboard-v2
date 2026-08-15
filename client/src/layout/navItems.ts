import { Home, Dumbbell, Apple, CheckSquare, Clapperboard, Settings } from "lucide-react";

export const NAV_ITEMS = [
  { to: "/", label: "Home", icon: Home, primary: true },
  { to: "/gym", label: "Gym", icon: Dumbbell, primary: true },
  { to: "/nutrition", label: "Food", icon: Apple, primary: true },
  { to: "/habits", label: "Habits", icon: CheckSquare, primary: false },
  { to: "/media", label: "Media", icon: Clapperboard, primary: false },
  { to: "/settings", label: "Settings", icon: Settings, primary: false },
] as const;
