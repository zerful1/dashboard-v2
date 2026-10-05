import type { CoachingResult } from "@dashboard/shared";

// The domain returns green/amber/red; the palette speaks good/caution/negative.
// Mapping here keeps the domain free of presentation — computeRecommendation
// has no idea what colours this app uses, and should not.
const TONE = {
  green: { text: "text-good", edge: "border-l-good" },
  amber: { text: "text-caution", edge: "border-l-caution" },
  red: { text: "text-negative", edge: "border-l-negative" },
} as const;

/** The domain's tags are capitals ("ADD WEIGHT"); labels are sentence case now. */
function sentence(tag: string): string {
  return tag.charAt(0) + tag.slice(1).toLowerCase();
}

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
      className={`flex items-start gap-3 border-l-2 py-1 pl-3 ${tone.edge}`}
    >
      <span className={`lbl shrink-0 font-semibold ${tone.text}`}>{sentence(data.tag)}</span>
      <span className="text-xs leading-snug text-text">{data.headline}</span>
    </div>
  );
}
