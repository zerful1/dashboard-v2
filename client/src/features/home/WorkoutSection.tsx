import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import type { WorkoutProgress } from "@dashboard/shared";
import { Card } from "@/components/ui/Card";
import { buttonClass } from "@/components/ui/Button";

export interface HomeWorkout {
  label: string;
  /** The day type Home is showing, which on a swapped day is not the scheduled one. Null on a rest day. */
  dayType: number | null;
  isRest: boolean;
  progress: WorkoutProgress | null;
  isError: boolean;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "5 exercises · not started", "3 of 5 exercises · 9 sets", or "9 sets" with an empty list. */
function detail(p: WorkoutProgress): string {
  // A cardio-only day is done.
  if (p.sets === 0 && p.cardio > 0) return "Cardio only";
  if (!p.started) return p.total > 0 ? `${plural(p.total, "exercise")} · not started` : "Not started";
  return p.total > 0 ? `${p.done} of ${plural(p.total, "exercise")} · ${plural(p.sets, "set")}` : plural(p.sets, "set");
}

/** Today's workout: big with the white action in the top slot, compact below it. */
export function WorkoutSection({ workout, prominent = false }: { workout: HomeWorkout; prominent?: boolean }) {
  if (workout.isError) {
    return (
      <Card>
        <div className="lbl">Workout</div>
        <p className="mt-1 text-sm text-muted">Couldn't load your workout.</p>
      </Card>
    );
  }
  if (workout.isRest) {
    // A rest day is not a task: no button.
    return (
      <Card>
        <div className="lbl">Workout</div>
        <p className="mt-1 text-[15px] font-semibold">Rest day</p>
      </Card>
    );
  }
  const p = workout.progress;
  if (!p) return null;
  const verb = p.started ? "Continue" : "Start";
  // Open Gym on the day named here: on a swapped day the scheduled one would
  // show nothing ticked, and the sets would look gone.
  const toDay = workout.dayType === null ? undefined : { gymDay: workout.dayType };

  if (prominent) {
    return (
      <Card className="py-5">
        <div className="lbl">Workout</div>
        <div className="mt-1 text-3xl font-semibold tracking-tight">{workout.label}</div>
        <p className="mt-1 text-xs text-muted">{detail(p)}</p>
        {p.total > 0 && (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-accent" style={{ width: `${(p.done / p.total) * 100}%` }} />
          </div>
        )}
        <Link to="/gym" state={toDay} className={buttonClass("primary", "mt-4 w-full py-3")}>
          {verb} workout
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="lbl">Workout</div>
          <div className="mt-1 truncate text-[15px] font-semibold">{p.finished ? `${workout.label} · done` : workout.label}</div>
          <p className="text-xs text-muted">{detail(p)}</p>
        </div>
        {p.finished ? (
          <span role="img" aria-label="Done" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-bg">
            <Check size={12} strokeWidth={3} aria-hidden />
          </span>
        ) : (
          <Link to="/gym" state={toDay} className={buttonClass("ghost", "shrink-0 py-2")}>
            {verb}
          </Link>
        )}
      </div>
    </Card>
  );
}
