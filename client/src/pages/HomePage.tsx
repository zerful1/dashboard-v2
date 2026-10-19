import { useState } from "react";
import { useToday } from "@/hooks/useToday";
import { useHomeDay } from "@/hooks/useHomeDay";
import { useHabits } from "@/hooks/useHabits";
import { longDate } from "@/lib/dates";
import { Spinner } from "@/components/ui/Spinner";
import { TodayHabitsCard } from "@/features/habits/TodayHabitsCard";
import { WeighIn } from "@/features/home/WeighIn";
import { WorkoutSection } from "@/features/home/WorkoutSection";
import { FoodSection } from "@/features/home/FoodSection";
import { WeightSection } from "@/features/home/WeightSection";
import { WeekLine } from "@/features/home/WeekLine";
import { AddFoodSheet } from "@/features/nutrition/AddFoodSheet";

/**
 * Today at a glance (redesign part 2). The top slot holds the next thing and
 * the screen's one white action — weigh-in, then workout, then food — and the
 * rest of today follows in a fixed order, minus whichever is on top.
 */
export function HomePage() {
  // Kept current: an app left open overnight rolls to the new day.
  const today = useToday();
  const home = useHomeDay(today);
  // Started here, with the rest of the day, rather than when the card mounts
  // after the spinner: it was the last thing to arrive. The card reads the same entry.
  useHabits();
  const [adding, setAdding] = useState(false);
  const openAdd = () => setAdding(true);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <div className="lbl text-accent">{longDate(today)}</div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Today</h1>
      </div>

      {home.isPending ? (
        <Spinner label="Loading your day" />
      ) : (
        <>
          {home.top === "weigh-in" && (
            <WeighIn
              latest={home.weight.summary.latest}
              latestDate={home.weight.summary.latestDate}
              today={today}
              save={home.weight.saveWeight}
            />
          )}
          {home.top === "workout" && <WorkoutSection prominent workout={home.workout} />}
          {home.top === "food" && <FoodSection prominent food={home.food} onAdd={openAdd} />}

          {home.top !== "workout" && <WorkoutSection workout={home.workout} />}
          {home.top !== "food" && <FoodSection food={home.food} onAdd={openAdd} />}
          <TodayHabitsCard />
          {/* The weigh-in on top already says the last weight. */}
          {home.top !== "weigh-in" && <WeightSection weight={home.weight} />}
          <WeekLine week={home.week} />
        </>
      )}

      <AddFoodSheet open={adding} onClose={() => setAdding(false)} date={today} addEntry={home.food.addEntry} />
    </div>
  );
}
