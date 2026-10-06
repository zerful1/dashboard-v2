/**
 * The trend-line mark: the app icon's line and dot (public/favicon.svg),
 * without its black tile, in the current text colour. Decorative — the word
 * beside it is the name.
 */
export function Mark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <polyline
        points="7,22 12.5,16.5 17,19 24.5,10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={24.5} cy={10.5} r={2.9} fill="currentColor" />
    </svg>
  );
}
