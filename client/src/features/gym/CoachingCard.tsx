import type { CoachingResult } from "@dashboard/shared";

// The domain returns green/amber/red; the palette speaks good/caution/negative.
// Mapping here keeps the domain free of presentation — computeRecommendation
// has no idea what colours this app uses, and should not.
const TONE = {
  green: { text: "text-good", edge: "border-l-good" },
  amber: { text: "text-caution", edge: "border-l-caution" },
  red: { text: "text-negative", edge: "border-l-negative" },
} as const;

export function CoachingCard({
  data,
  isLoading,
}: {
  data: CoachingResult | null | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return <div className="h-10 animate-pulse rounded-lg bg-raised" />;
  // Null for an exercise with no history — render nothing rather than invent
  // encouragement.
  if (!data) return null;

  const tone = TONE[data.color];
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-raised border-l-2 bg-surface px-3 py-2 ${tone.edge}`}
    >
      <span className={`lbl shrink-0 font-bold ${tone.text}`}>{data.tag}</span>
      <span className="text-xs leading-snug text-text">{data.headline}</span>
    </div>
  );
}
