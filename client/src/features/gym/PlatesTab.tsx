import { useEffect, useId, useState } from "react";
import { buddyLoadFor, loadFor, stepFor, STANDARD_PLATES_KG, type Load } from "@dashboard/shared";
import { parseDecimal } from "@/lib/number";
import { PlateSleeve } from "./PlateSleeve";
import { readPrefs, writePrefs, type PlateMode } from "./platePrefs";

const kg = (n: number) => String(Math.round(n * 100) / 100);

/** A weight worth answering for: a number from 0 to 1000 kg (the cap bounds the plate search). */
const usable = (n: number | null): n is number => n !== null && n >= 0 && n <= 1000;

function Closest({ load }: { load: Extract<Load, { kind: "ok" }> }) {
  if (load.offByKg === 0) return null;
  return (
    <p className="text-sm text-caution">
      Closest you can load: {kg(load.loadedKg)} kg, {kg(Math.abs(load.offByKg))} kg{" "}
      {load.offByKg < 0 ? "under" : "over"}
    </p>
  );
}

/** One person's side as a big figure. `plates` adds that person's own sleeve and chips. */
function Figure({ label, load, plates }: { label: string; load: Load | null; plates?: boolean }) {
  return (
    <div className="space-y-2">
      <p className="lbl">{label}</p>
      {load === null && <p className="figure text-muted">—</p>}
      {load?.kind === "below" && <p className="text-sm text-muted">Less than the machine on its own</p>}
      {load?.kind === "ok" && (
        <>
          <p className="figure">{kg(load.perSideKg)} kg</p>
          <Closest load={load} />
          {plates && load.plates.length > 0 && (
            <>
              <PlateSleeve inner={load.plates} />
              <PlateChips plates={load.plates} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function PlateChips({ plates, label = "Plates each side", dashed = false }: { plates: number[]; label?: string; dashed?: boolean }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {plates.map((p, i) => (
        <li
          key={i}
          className={`rounded-full border px-3 py-1 text-xs tabular-nums text-muted ${dashed ? "border-dashed border-muted" : "border-muted"}`}
        >
          {kg(p)}
        </li>
      ))}
    </ul>
  );
}

function Stepper({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: string;
  step: number;
  onChange: (v: string) => void;
}) {
  const id = useId();
  const nudge = (dir: 1 | -1) => {
    const now = parseDecimal(value) ?? 0;
    onChange(kg(Math.max(0, now + dir * step)));
  };
  const btn = "h-8 w-8 shrink-0 rounded-full border border-edge text-muted";
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="lbl block">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Less ${label}`} onClick={() => nudge(-1)} className={btn}>
          −
        </button>
        <input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-xl border border-edge bg-surface px-3 py-2 text-center text-sm tabular-nums text-text focus:outline-hidden focus:border-accent"
        />
        <button type="button" aria-label={`More ${label}`} onClick={() => nudge(1)} className={btn}>
          +
        </button>
      </div>
    </div>
  );
}

export function PlatesTab() {
  const [saved] = useState(readPrefs);
  const [mode, setMode] = useState<PlateMode>(saved.mode);
  const [start, setStart] = useState(saved.start);
  const [total, setTotal] = useState("");
  const [you, setYou] = useState("");
  const [buddy, setBuddy] = useState("");
  const [on, setOn] = useState<number[]>(saved.plates);
  const available = STANDARD_PLATES_KG.filter((p) => on.includes(p));
  const toggle = (p: number) => {
    if (on.includes(p) && on.length === 1) return;
    setOn(on.includes(p) ? on.filter((x) => x !== p) : [...on, p]);
  };
  useEffect(() => writePrefs({ mode, start, plates: available }), [mode, start, available.join()]);
  const step = stepFor(available);
  const s = parseDecimal(start);
  const t = parseDecimal(total);
  const y = parseDecimal(you);
  const b = parseDecimal(buddy);
  const load = usable(s) && usable(t) ? loadFor(s, t, available) : null;
  const pair =
    usable(s) && usable(y) && usable(b)
      ? buddyLoadFor(s, y, b, available)
      : {
          you: usable(s) && usable(y) ? loadFor(s, y, available) : null,
          buddy: usable(s) && usable(b) ? loadFor(s, b, available) : null,
          swap: null,
        };
  const swap = pair.swap;
  const youLabel = swap ? (swap.inside === "you" ? "You · solid" : "You · solid + dashed") : "You";
  const buddyLabel = swap ? (swap.inside === "buddy" ? "Buddy · solid" : "Buddy · solid + dashed") : "Buddy";
  const youFigure = <Figure key="you" label={youLabel} load={pair.you} plates={!swap} />;
  const buddyFigure = <Figure key="buddy" label={buddyLabel} load={pair.buddy} plates={!swap} />;
  return (
    <div className="space-y-6">
      <div className="flex gap-1">
        {(
          [
            ["me", "Just me"],
            ["buddy", "With a buddy"],
          ] as const
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium ${mode === key ? "bg-accent/10 text-accent" : "text-muted"}`}
          >
            {text}
          </button>
        ))}
      </div>
      <Stepper label="Machine starts at" value={start} step={step} onChange={setStart} />
      {mode === "me" ? (
        <Stepper label="Total weight" value={total} step={step} onChange={setTotal} />
      ) : (
        <>
          <Stepper label="You" value={you} step={step} onChange={setYou} />
          <Stepper label="Buddy" value={buddy} step={step} onChange={setBuddy} />
        </>
      )}
      {mode === "me" && load?.kind === "below" && (
        <p className="text-sm text-muted">Less than the machine on its own</p>
      )}
      {mode === "me" && load?.kind === "ok" && (
        <div className="space-y-3">
          {load.plates.length === 0 ? (
            <p className="text-sm text-muted">Just the machine</p>
          ) : (
            <div>
              <p className="lbl">Each side</p>
              <p className="figure">{kg(load.perSideKg)} kg</p>
              <p className="text-xs text-muted">{kg(load.perSideKg * 2)} kg of plates</p>
            </div>
          )}
          <Closest load={load} />
          {load.plates.length > 0 && (
            <>
              <PlateSleeve inner={load.plates} />
              <PlateChips plates={load.plates} />
            </>
          )}
        </div>
      )}
      {mode === "buddy" && (
        <div className="space-y-5">
          {swap && <PlateSleeve inner={swap.inner} outer={swap.outer} />}
          {swap?.inside === "you" ? [youFigure, buddyFigure] : [buddyFigure, youFigure]}
          {swap && (
            <div className="space-y-2">
              <p className="lbl">To swap</p>
              {swap.outer.length === 0 ? (
                <p className="text-sm text-muted">Same weight, nothing to swap</p>
              ) : (
                <>
                  <p className="text-sm">Take off or add {swap.outer.map(kg).join(" · ")} each side</p>
                  <PlateChips plates={swap.outer} label="Plates to swap" dashed />
                </>
              )}
            </div>
          )}
        </div>
      )}
      <div className="space-y-2">
        <p className="lbl">Plates at your gym</p>
        <div className="flex flex-wrap gap-2">
          {STANDARD_PLATES_KG.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={on.includes(p)}
              aria-label={`${kg(p)} kg plate`}
              onClick={() => toggle(p)}
              // Off is outlined so it still reads as something to tap; on is tinted.
              className={`rounded-full border px-3 py-1.5 text-xs tabular-nums ${on.includes(p) ? "border-transparent bg-accent/10 text-accent" : "border-edge text-muted"}`}
            >
              {kg(p)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
