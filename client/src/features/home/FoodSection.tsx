import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import type { DaySummary } from "@/features/nutrition/deriveDay";
import type { useDiary } from "@/hooks/useDiary";

export interface HomeFood {
  day: DaySummary;
  isError: boolean;
  addEntry: ReturnType<typeof useDiary>["addEntry"];
}

/** Today's food: what's left (or eaten, with no target), and Add food. */
export function FoodSection({ food, prominent = false, onAdd }: { food: HomeFood; prominent?: boolean; onAdd: () => void }) {
  if (food.isError) {
    return (
      <Card>
        <div className="lbl">Food</div>
        <p className="mt-1 text-sm text-muted">Couldn't load your food.</p>
      </Card>
    );
  }
  const { kcal, target, left, bars } = food.day;
  const over = left !== null && left < 0;
  const figure = target === null || left === null ? kcal : Math.abs(left);
  const unit = target === null ? "kcal eaten" : over ? "kcal over" : "kcal left";
  const pct = target ? Math.min(100, (kcal / target.calories) * 100) : 0;
  const setTargets = (
    <Link to="/nutrition" className="text-sm text-muted underline underline-offset-4 hover:text-text">
      Set targets
    </Link>
  );

  return (
    <Card className={prominent ? "py-5" : undefined}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="lbl">Food</div>
          {/* Amber only past the target: the signal colour's one job. */}
          <div className={cn("figure mt-1", prominent ? "text-5xl" : "text-3xl", over && "text-caution")}>
            {figure.toLocaleString()}
            <span className="ml-1 text-sm font-normal tracking-normal text-muted">{unit}</span>
          </div>
        </div>
        {!prominent && (
          <Button variant="ghost" onClick={onAdd}>
            Add food
          </Button>
        )}
      </div>
      {target ? (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-raised">
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <div className="mt-2">{setTargets}</div>
      )}
      {prominent && bars.length > 0 && (
        <p className="tnum mt-2 text-xs text-muted">{bars.map((b) => `${b.label} ${b.eaten}/${b.target}`).join(" · ")}</p>
      )}
      {prominent && (
        <Button className="mt-4 w-full" onClick={onAdd}>
          Add food
        </Button>
      )}
    </Card>
  );
}
