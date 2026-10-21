import { useLayoutEffect, useRef, useState } from "react";
import { useToday } from "@/hooks/useToday";
import { LiftsOverview } from "./stats/LiftsOverview";
import { LiftDetailView } from "./stats/LiftDetailView";

/**
 * Gym's Stats: every lift by trend, and one lift in detail
 * within the tab. The search, the Not lately fold and the list's scroll
 * position live here, so coming back from a lift returns you to your place.
 */
export function StatsTab() {
  const today = useToday();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unfolded, setUnfolded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // AppLayout's <main> is the page's scroll container.
  const scroller = () => root.current?.closest("main") ?? null;
  const listTop = useRef(0);

  // After the switch has rendered: a lift opens at its top, and Back returns
  // to where the list was.
  useLayoutEffect(() => {
    const main = scroller();
    if (main) main.scrollTop = selected === null ? listTop.current : 0;
  }, [selected]);

  const open = (name: string) => {
    listTop.current = scroller()?.scrollTop ?? 0;
    setSelected(name);
  };

  return (
    <div ref={root}>
      {selected === null ? (
        <LiftsOverview
          today={today}
          search={search}
          onSearch={setSearch}
          unfolded={unfolded}
          onUnfold={setUnfolded}
          onOpen={open}
        />
      ) : (
        <LiftDetailView name={selected} today={today} onBack={() => setSelected(null)} />
      )}
    </div>
  );
}
