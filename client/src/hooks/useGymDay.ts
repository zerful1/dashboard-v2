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

function initialDay(split: SplitConfig): number {
  const t = getTodayDayType(split);
  return t === "rest" ? (split.days[0]?.day_type ?? 1) : t;
}

/**
 * Which day and date the gym page is logging against.
 *
 * The rule: until the user picks, the day tracks today's slot in the split
 * rotation. On a rest day there is no slot, so it falls back to the most
 * recently logged day — which arrives asynchronously. Once the user, or a
 * History hand-off, picks explicitly, nothing may override it.
 */
export function useGymDay(
  split: SplitConfig,
  /** True until the user's real split has loaded. */
  splitPending: boolean,
  lastLoggedDayType: number | null | undefined,
): GymDay {
  const [dayType, setDayType] = useState(() => initialDay(split));
  const [date, setDate] = useState(() => toLocalISO());

  /**
   * Latches true the moment the user expresses an intent.
   *
   * A ref, not state: flipping it must not re-render, and the effect below
   * reads it in the same tick it is set. v1's bug was that a slow
   * `lastDayType` query resolving AFTER a History hand-off would overwrite the
   * day the user had just been sent to — the day silently changed out from
   * under them mid-log.
   */
  const userHasChosen = useRef(false);

  useEffect(() => {
    if (userHasChosen.current) return;
    // Nothing may be decided from DEFAULT_SPLIT. useSplit returns
    // `data ?? DEFAULT_SPLIT`, so an unloaded split is indistinguishable from
    // a default one - and whether today is a rest day depends on the REAL
    // split. Deciding it early on a day the default calls rest latches the
    // rest-day fallback below, after which the real split arriving cannot
    // undo it. Same class as the Home first-paint flash, but sticky.
    if (splitPending) return;

    const todayType = getTodayDayType(split);
    if (todayType !== "rest") {
      setDayType(todayType);
    } else if (lastLoggedDayType != null) {
      // Rest day: show the last day actually trained. Latch, so a later split
      // refetch cannot pull it back to the rotation.
      setDayType(lastLoggedDayType);
      userHasChosen.current = true;
    }
  }, [split, splitPending, lastLoggedDayType]);

  const selectDay = (d: number) => {
    userHasChosen.current = true;
    setDayType(d);
  };
  const selectDate = (d: string) => {
    userHasChosen.current = true;
    setDate(d);
  };
  const jumpTo = (d: number, dt: string) => {
    userHasChosen.current = true;
    setDayType(d);
    setDate(dt);
  };

  return { dayType, date, selectDay, selectDate, jumpTo };
}
