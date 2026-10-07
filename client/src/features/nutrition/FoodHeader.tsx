import { Button } from "@/components/ui/Button";
import { DateEyebrow } from "@/components/ui/DateEyebrow";

/** Food's header (redesign part 4, §2): the open day as the eyebrow, Targets on the right. */
export function FoodHeader({ date, onDate, onTargets }: { date: string; onDate: (d: string) => void; onTargets: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <DateEyebrow date={date} onDate={onDate} />
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Food</h1>
      </div>
      <Button variant="ghost" onClick={onTargets}>
        Targets
      </Button>
    </div>
  );
}
