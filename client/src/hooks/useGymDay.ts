import { useEffect, useRef, useState } from "react";
import { getTodayDayType, toLocalISO } from "@dashboard/shared";
import type { SplitConfig } from "@dashboard/shared";

export interface GymDay {
  dayType: number;
  date: string;
  selectDay: (dayType: number) => void;
  selectDate: (date: string) => void;
  /** History → Log hand-off: set both at once and lock out the fallback. */
  jumpTo: (dayType: number, date: string) => void;
}

/** Away this long, the page starts over on the new day, so a workout past midnight stays one session. */
const LONG_BREAK_MS = 3 * 60 * 60 * 1000;

function initialDay(split: SplitConfig): number {
  const t = getTodayDayType(split);
  return t === "rest" ? (split.days[0]?.day_type ?? 1) : t;
}

/** Which day/date the gym page logs against: tracks today's slot until the user picks, then never overridden. */
export function useGymDay(
  split: SplitConfig,
  /** True until the user's real split has loaded. */
  splitPending: boolean,
  lastLoggedDayType: number | null | undefined,
): GymDay {
  const [dayType, setDayType] = useState(() => initialDay(split));
  const [date, setDate] = useState(() => toLocalISO());

  /** Latches once the user expresses intent; a ref so it doesn't re-render and the effect reads it the same tick. */
  const userHasChosen = useRef(false);
  /** False once a date other than today is picked. That date stays put. */
  const onToday = useRef(true);
  const shownDate = useRef(date);
  useEffect(() => {
    shownDate.current = date;
  }, [date]);

  // Back from a long break on a new day, start fresh: a date read once at mount logs sets onto yesterday.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      const today = toLocalISO();
      if (away < LONG_BREAK_MS || !onToday.current || today === shownDate.current) return;
      // Unlatched only when the date really moves, since the effect below re-decides the day on that change.
      userHasChosen.current = false;
      setDate(today);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (userHasChosen.current) return;
    // Decide nothing from DEFAULT_SPLIT: an early rest-day verdict latches the fallback and the real split can't undo it.
    if (splitPending) return;

    const todayType = getTodayDayType(split);
    if (todayType !== "rest") {
      setDayType(todayType);
    } else if (lastLoggedDayType != null) {
      // Rest day: show the last day trained; latch so a later split refetch cannot pull it back.
      setDayType(lastLoggedDayType);
      userHasChosen.current = true;
    }
  }, [split, splitPending, lastLoggedDayType, date]);

  const selectDay = (d: number) => {
    userHasChosen.current = true;
    setDayType(d);
  };
  const selectDate = (d: string) => {
    userHasChosen.current = true;
    onToday.current = d === toLocalISO();
    setDate(d);
  };
  const jumpTo = (d: number, dt: string) => {
    userHasChosen.current = true;
    onToday.current = dt === toLocalISO();
    setDayType(d);
    setDate(dt);
  };

  return { dayType, date, selectDay, selectDate, jumpTo };
}
