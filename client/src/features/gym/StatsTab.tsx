import { useState } from "react";
import { useToday } from "@/hooks/useToday";
import { LiftsOverview } from "./stats/LiftsOverview";
import { LiftDetailView } from "./stats/LiftDetailView";

/**
 * Gym's Stats (redesign part 3b): every lift by trend, and one lift in detail
 * within the tab. The search lives here, so coming back from a lift keeps it.
 */
export function StatsTab() {
  const today = useToday();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  return selected === null ? (
    <LiftsOverview today={today} search={search} onSearch={setSearch} onOpen={setSelected} />
  ) : (
    <LiftDetailView name={selected} today={today} onBack={() => setSelected(null)} />
  );
}
