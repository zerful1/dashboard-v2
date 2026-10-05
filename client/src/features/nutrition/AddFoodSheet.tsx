import { useEffect, useRef, useState, type ReactNode } from "react";
import { customToChoice, entryToChoice, hitToChoice, itemToChoice, type FoodChoice } from "@dashboard/shared";
import type { FoodHit, FoodLogUnit, RecentFood } from "@dashboard/shared";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { useFoodSearch, useRecents } from "@/hooks/useFoods";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useOnline } from "@/hooks/useOnline";
import type { useDiary } from "@/hooks/useDiary";
import { AmountStep } from "./AmountStep";
import { CustomFoodForm } from "./CustomFoodForm";
import { amountOf } from "./DiaryList";
import { ScanTab } from "./ScanTab";

type Tab = "search" | "recent" | "scan" | "custom";
const TABS: { id: Tab; label: string }[] = [
  { id: "search", label: "Search" },
  { id: "recent", label: "Recent" },
  { id: "scan", label: "Scan" },
  { id: "custom", label: "Custom" },
];
interface Chosen {
  choice: FoodChoice;
  initial?: { quantity: number; unit: FoodLogUnit };
}

export function AddFoodSheet({
  open,
  onClose,
  date,
  addEntry,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  addEntry: ReturnType<typeof useDiary>["addEntry"];
}) {
  const [tab, setTab] = useState<Tab | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  // Lifted out of SearchTab, so stepping back from the amount step keeps it.
  const [q, setQ] = useState("");
  // A scanned code nobody has filed, carried into Custom so it is saved with the food.
  const [customBarcode, setCustomBarcode] = useState<string | null>(null);
  // The sheet's content outlives a close by its exit animation, so a scan's
  // lookup can land after the reset below: it checks this first (final review I1).
  const openRef = useRef(open);
  openRef.current = open;
  const recents = useRecents(open);
  // Most adds are a repeat, so the sheet opens on Recent when there is anything
  // to re-log (#17 review 6). Decided once the list is in, so it never flips
  // while the user types; a tab the user picks always wins.
  const shown: Tab | null =
    tab ?? (recents.isPending ? null : recents.data && recents.data.length > 0 ? "recent" : "search");

  useEffect(() => {
    if (!open) {
      setChosen(null);
      setTab(null);
      setQ("");
      setCustomBarcode(null);
    }
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Add food">
      <div className="max-h-[70vh] overflow-y-auto">
        {chosen ? (
          <AmountStep
            choice={chosen.choice}
            initial={chosen.initial}
            date={date}
            onBack={() => setChosen(null)}
            onAdd={(input) => {
              addEntry.mutate(input);
              onClose();
            }}
          />
        ) : (
          <>
            <div role="tablist" className="mb-3 flex gap-2">
              {TABS.map((t) => (
                <Button
                  key={t.id}
                  role="tab"
                  aria-selected={shown === t.id}
                  variant={shown === t.id ? "selected" : "ghost"}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
            {shown === null && <Spinner label="Loading" />}
            {shown === "search" && <SearchTab q={q} setQ={setQ} onPick={(hit) => setChosen({ choice: hitToChoice(hit) })} />}
            {shown === "recent" && (
              <RecentTab
                onPick={(r) =>
                  setChosen({
                    choice: r.item ? itemToChoice(r.item) : entryToChoice(r.entry),
                    initial: { quantity: r.entry.quantity, unit: r.entry.unit },
                  })
                }
              />
            )}
            {shown === "scan" && (
              <ScanTab
                onFound={(choice) => {
                  if (openRef.current) setChosen({ choice });
                }}
                onAddYourself={(barcode) => {
                  setCustomBarcode(barcode);
                  setTab("custom");
                }}
              />
            )}
            {shown === "custom" && (
              <CustomFoodForm barcode={customBarcode} onNext={(food) => setChosen({ choice: customToChoice(food) })} />
            )}
          </>
        )}
        {/* Required by the data licences (spec §10). */}
        <p className="mt-4 text-[10px] leading-snug text-dim">
          Food data: Open Food Facts (ODbL) · CoFID 2021 (Open Government Licence v3.0)
        </p>
      </div>
    </Sheet>
  );
}

function SearchTab({ q, setQ, onPick }: { q: string; setQ: (q: string) => void; onPick: (hit: FoodHit) => void }) {
  const debounced = useDebouncedValue(q, 300);
  const online = useOnline();
  const search = useFoodSearch(online ? debounced : "");

  let body: ReactNode;
  if (!online) body = <p className="text-sm text-muted">Search needs a connection.</p>;
  else if (debounced.trim().length < 2) body = <p className="text-sm text-dim">Type at least two letters.</p>;
  else if (search.isPending) body = <Spinner label="Searching" />;
  else if (search.isError) body = <p className="text-sm text-muted">Search failed. Try again.</p>;
  else {
    const { hits, warnings } = search.data;
    body = (
      <div className="space-y-2">
        {warnings?.map((w) => (
          <p key={w} className="text-xs text-gold">
            {w}
          </p>
        ))}
        {hits.length === 0 ? (
          <p className="text-sm text-dim">No matches.</p>
        ) : (
          <div className="overflow-hidden rounded-card border border-raised">
            {hits.map((h, i) => (
              <button
                key={`${h.source}-${h.externalId}`}
                onClick={() => onPick(h)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${i > 0 ? "border-t border-raised" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{h.name}</span>
                  <span className="block truncate text-xs text-dim">
                    {h.brand ?? (h.source === "cofid" ? "UK food table" : "Open Food Facts")}
                  </span>
                </span>
                <span className="tnum shrink-0 text-xs text-muted">
                  {Math.round(h.per100g?.kcal ?? h.servings[0]!.kcal)} kcal/100 g
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input aria-label="Search foods" placeholder="Search foods" value={q} onChange={(e) => setQ(e.target.value)} />
      {body}
    </div>
  );
}

function RecentTab({ onPick }: { onPick: (r: RecentFood) => void }) {
  const recents = useRecents();
  if (recents.isPending) return <Spinner label="Loading recent foods" />;
  if (recents.isError) return <p className="text-sm text-muted">Could not load recent foods.</p>;
  if (recents.data.length === 0) return <p className="text-sm text-dim">Foods you log will appear here.</p>;
  return (
    <div className="overflow-hidden rounded-card border border-raised">
      {recents.data.map((r, i) => (
        <button
          key={r.entry.id}
          onClick={() => onPick(r)}
          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${i > 0 ? "border-t border-raised" : ""}`}
        >
          <span className="min-w-0 flex-1 truncate text-sm">
            <span>{r.entry.name}</span> <span className="text-muted">· {amountOf(r.entry)}</span>
          </span>
          <span className="tnum shrink-0 text-xs text-muted">{Math.round(r.entry.calories)}</span>
        </button>
      ))}
    </div>
  );
}
