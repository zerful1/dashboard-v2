import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { latestActiveTarget } from "@dashboard/shared";
import { useAuth } from "@/auth/AuthProvider";
import { useSplit } from "@/hooks/useSplit";
import { useTargets } from "@/hooks/useTargets";
import { goalsQueryOptions } from "@/hooks/useGoals";
import { useHabits } from "@/hooks/useHabits";
import { Card } from "@/components/ui/Card";
import { List } from "@/components/ui/List";
import { goalsText, habitsText, splitText, targetText } from "./shortcutText";

/**
 * The settings that live on other pages, each with its current value, linking
 * to where it is changed (redesign part 8, §3). A value is blank until its
 * source has answered, or if it failed: useSplit answers DEFAULT_SPLIT while
 * loading, which would name days that aren't yours (CLAUDE.md, isPending).
 */
export function ShortcutList({ today }: { today: string }) {
  const { user } = useAuth();
  const split = useSplit();
  const targets = useTargets({ errorToast: false });
  const goals = useQuery({ ...goalsQueryOptions(user?.id) });
  const habits = useHabits();

  const rows = [
    { name: "Gym split", to: "/gym?open=split", value: split.isPending || split.failed ? "" : splitText(split.split) },
    {
      name: "Food targets",
      to: "/nutrition?open=targets",
      value: targets.hasData ? targetText(latestActiveTarget(targets.targets, today)) : "",
    },
    { name: "Goals", to: "/insights?open=goals", value: goals.data ? goalsText(goals.data) : "" },
    { name: "Habits", to: "/habits", value: habits.hasData ? habitsText(habits.habits.length) : "" },
  ];

  return (
    <Card>
      <h2 className="lbl">Set on other pages</h2>
      {/* No closing line: the next section's hairline follows. */}
      <List className="mt-2 border-b-0">
        {rows.map((r) => (
          <Link key={r.name} to={r.to} className="flex items-center gap-3 py-3">
            <span className="text-sm">{r.name}</span>
            {r.value && <span className="min-w-0 flex-1 truncate text-right text-xs text-muted">{r.value}</span>}
            {/* Decoration: the row is the link. */}
            <ChevronRight size={16} aria-hidden className={`shrink-0 text-dim ${r.value ? "" : "ml-auto"}`} />
          </Link>
        ))}
      </List>
    </Card>
  );
}
