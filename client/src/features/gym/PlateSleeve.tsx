export interface PlateSleeveProps {
  /** Plates that stay on, heaviest first, kg. Drawn solid. */
  inner: number[];
  /** Plates that come on and off between lifters, heaviest first, kg. Drawn dashed. */
  outer?: number[];
}

/** A 25 kg plate is 100px tall; a 1.25 kg plate is held at a floor, so its label fits. */
const PX_PER_KG = 4;
const MIN_PLATE_PX = 24;

/** "15 kg", "10 kg and 2.5 kg", "25 kg, 20 kg and 10 kg". */
function kgList(kgs: number[]): string {
  const parts = kgs.map((kg) => `${kg} kg`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function sleeveLabel(inner: number[], outer: number[]): string {
  if (inner.length === 0 && outer.length === 0) return "No plates";
  if (outer.length === 0) return `Each side: ${kgList(inner)}`;
  if (inner.length === 0) return `Each side: ${kgList(outer)}, on and off`;
  const stay = inner.length === 1 ? "stays on" : "stay on";
  const move = outer.length === 1 ? "comes on and off" : "come on and off";
  return `Each side: ${kgList(inner)} ${stay}; ${kgList(outer)} ${move}`;
}

export function PlateSleeve({ inner, outer = [] }: PlateSleeveProps) {
  const plates = [
    ...inner.map((kg) => ({ kg, moves: false })),
    ...outer.map((kg) => ({ kg, moves: true })),
  ];
  return (
    <div role="img" aria-label={sleeveLabel(inner, outer)} className="flex items-center gap-1">
      {/* The bar stub and the collar that holds the plates on. Decoration only. */}
      <div aria-hidden="true" className="h-2 w-3 bg-raised" />
      <div aria-hidden="true" className="h-8 w-1.5 bg-raised" />
      {plates.map(({ kg, moves }, i) => (
        <div
          key={i}
          aria-hidden="true"
          data-moves={String(moves)}
          style={{ height: `${Math.max(MIN_PLATE_PX, kg * PX_PER_KG)}px` }}
          className={`flex w-7 items-center justify-center border text-label text-muted tabular-nums ${moves ? "border-dashed border-muted" : "border-text"}`}
        >
          {String(kg)}
        </div>
      ))}
    </div>
  );
}
