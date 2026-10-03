import { useToday } from "@/hooks/useToday";
import { WeeklyReviewSection } from "./WeeklyReviewSection";
import { RecordsSection } from "./RecordsSection";

export function InsightsPage() {
  const today = useToday();
  return (
    <div className="space-y-4">
      <div>
        <div className="lbl text-accent">Insights</div>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight">Your progress</h1>
      </div>
      <WeeklyReviewSection today={today} />
      <RecordsSection />
    </div>
  );
}
