"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getStore,
  messageFor,
  StoreError,
  type ConnectionStatus,
  type Session,
  type SquadSummary,
  type Store,
} from "@/lib/data";
import { clampCount } from "@/lib/domain/goal";
import type { Goal, WeekSnapshot } from "@/lib/domain/types";
import { addDays, currentWeekStart, isSundayInZone } from "@/lib/domain/week";

/** How long to wait after the last tap before saving a count. */
const SAVE_DELAY_MS = 350;
/** How often an open screen checks whether the week has rolled over. */
const WEEK_CHECK_MS = 30_000;

/** This week, next week, or the week after. */
export type WeekChoice = "current" | "upcoming" | "after";

const WEEK_OFFSET: Record<WeekChoice, number> = { current: 0, upcoming: 1, after: 2 };

export type SquadWeekState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      session: Session;
      snapshot: WeekSnapshot;
      /** Which week the snapshot is for. */
      week: WeekChoice;
      /** My goals from the week before the one shown: the source for carry-over. */
      previousGoals: Goal[];
      /**
       * On a Sunday, while looking at this week: whether I already have goals
       * for next week. `null` when it wasn't checked.
       */
      nextWeekPlanned: boolean | null;
      /** My other squads, for copying goals across. */
      otherSquads: SquadSummary[];
      /** The moment the snapshot was fetched. Used for anything time-dependent. */
      now: Date;
    };

/**
 * Loads one of the signed-in member's squads for a week and keeps it fresh.
 * With no squad asked for, a member of exactly one squad gets that squad and
 * a member of several is sent to the list to choose. Then: realtime
 * changes, coming back to the tab, and coming back online all refetch.
 * Progress taps are shown immediately and rolled back if the save fails.
 */
export function useSquadWeek(week: WeekChoice, requestedSquadId: string | null = null) {
  const router = useRouter();
  const [state, setState] = useState<SquadWeekState>({ status: "loading" });
  const [connection, setConnection] = useState<ConnectionStatus>("connected");
  const [loadedSquadId, setLoadedSquadId] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, number>>({});
  const storeRef = useRef<Store | null>(null);
  // Latest unsaved counts, readable without waiting for a re-render, so taps
  // that land in quick succession each build on the one before.
  const latest = useRef<Record<string, number>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const requestId = useRef(0);
  // The week that was "this week" when we last loaded, in the squad's zone.
  const clock = useRef<{ timezone: string; currentWeek: string } | null>(null);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const store = (storeRef.current ??= getStore());
    try {
      const session = await store.getSession();
      if (!session) {
        router.replace("/auth?mode=signin&next=%2Fsquad");
        return;
      }
      const squads = await store.getMySquads();
      if (squads.length === 0) {
        router.replace("/join");
        return;
      }
      // Home rule: one squad opens straight away; with several you choose.
      const squad = requestedSquadId
        ? squads.find((candidate) => candidate.id === requestedSquadId)
        : squads.length === 1
          ? squads[0]
          : undefined;
      if (!squad) {
        router.replace("/squads");
        return;
      }
      const now = new Date();
      const current = currentWeekStart(now, squad.timezone);
      const weekStart = addDays(current, 7 * WEEK_OFFSET[week]);
      const checkNextWeek = week === "current" && isSundayInZone(now, squad.timezone);
      const [snapshot, previous, next] = await Promise.all([
        store.getWeek(squad.id, weekStart),
        store.getWeek(squad.id, addDays(weekStart, -7)),
        checkNextWeek ? store.getWeek(squad.id, addDays(weekStart, 7)) : null,
      ]);
      // A newer request started while this one was in flight: drop this result.
      if (id !== requestId.current) return;
      clock.current = { timezone: squad.timezone, currentWeek: current };
      setLoadedSquadId(squad.id);
      const mine = (goal: Goal) => goal.ownerId === session.userId;
      setState({
        status: "ready",
        session,
        snapshot,
        week,
        previousGoals: previous.goals.filter(mine),
        nextWeekPlanned: next ? next.goals.some(mine) : null,
        otherSquads: squads.filter((candidate) => candidate.id !== squad.id),
        now,
      });
    } catch (error) {
      if (id !== requestId.current) return;
      if (error instanceof StoreError && error.code === "not_signed_in") {
        router.replace("/auth?mode=signin&next=%2Fsquad");
        return;
      }
      // Keep showing what we have if a background refresh fails.
      setState((previous) =>
        previous.status === "ready"
          ? previous
          : { status: "error", message: messageFor(error) },
      );
      if (error instanceof StoreError && error.code === "network") {
        setConnection("reconnecting");
      }
    }
  }, [router, week, requestedSquadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loadedSquadId) return;
    const store = (storeRef.current ??= getStore());
    const unsubscribe = store.subscribe(loadedSquadId, () => void load(), setConnection);
    return unsubscribe;
  }, [loadedSquadId, load]);

  // The clock: when Sunday ends in the squad's zone, move an open screen on to
  // the new week without waiting for a refresh.
  useEffect(() => {
    const tick = setInterval(() => {
      const loaded = clock.current;
      if (loaded && currentWeekStart(new Date(), loaded.timezone) !== loaded.currentWeek) {
        void load();
      }
    }, WEEK_CHECK_MS);
    return () => clearInterval(tick);
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onOnline = () => {
      setConnection("connected");
      void load();
    };
    const onOffline = () => setConnection("reconnecting");
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [load]);

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => clearTimeout(timer));
  }, []);

  /**
   * Moves a goal's count by `delta`. Shows the new count straight away, then
   * saves the final value once the taps stop. Saving an absolute count means repeated taps or a retry can
   * never double-count.
   */
  const adjustCount = useCallback(
    (goal: Goal, delta: number) => {
      const base = latest.current[goal.id] ?? goal.completedCount;
      const value = clampCount(base + delta, goal.targetCount);
      if (value === base) return;
      latest.current[goal.id] = value;
      setPending((previous) => ({ ...previous, [goal.id]: value }));

      const existing = timers.current.get(goal.id);
      if (existing) clearTimeout(existing);

      const clearPending = () =>
        setPending((previous) => {
          if (previous[goal.id] !== value) return previous;
          delete latest.current[goal.id];
          const rest = { ...previous };
          delete rest[goal.id];
          return rest;
        });

      timers.current.set(
        goal.id,
        setTimeout(async () => {
          timers.current.delete(goal.id);
          const store = (storeRef.current ??= getStore());
          try {
            await store.setProgress(goal.id, value);
            await load();
          } catch (error) {
            toast.error(`Not saved. ${messageFor(error)}`);
            await load();
          } finally {
            // Success: the snapshot now holds the value. Failure: roll back.
            clearPending();
          }
        }, SAVE_DELAY_MS),
      );
    },
    [load],
  );

  /** Runs a write, then refetches. Returns false (after telling the user) if it failed. */
  const run = useCallback(
    async (action: (store: Store) => Promise<unknown>): Promise<boolean> => {
      const store = (storeRef.current ??= getStore());
      try {
        await action(store);
        await load();
        return true;
      } catch (error) {
        const cooldown = error instanceof StoreError && error.code === "cooldown";
        toast.error(cooldown ? messageFor(error) : `Not saved. ${messageFor(error)}`);
        // Someone else may have changed things: show the current state.
        void load();
        return false;
      }
    },
    [load],
  );

  /** Goals with unsaved taps applied, so the screen and the maths agree. */
  const goals = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.snapshot.goals.map((goal) =>
      goal.id in pending ? { ...goal, completedCount: pending[goal.id] } : goal,
    );
  }, [state, pending]);

  return { state, goals, connection, reload: load, adjustCount, run };
}
