"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getStore,
  messageFor,
  StoreError,
  type ConnectionStatus,
  type Session,
  type SquadHistory,
  type Store,
} from "@/lib/data";
import { currentWeekStart } from "@/lib/domain/week";

/** How often an open screen checks whether the week has rolled over. */
const WEEK_CHECK_MS = 30_000;

export type SquadHistoryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; session: Session; history: SquadHistory; now: Date };

/**
 * Loads a squad's whole history for the History and recap screens and keeps
 * it fresh: the live week updates in realtime, and the screen moves on by
 * itself when Sunday ends in the squad's zone. Read-only.
 */
export function useSquadHistory(squadId: string | null) {
  const router = useRouter();
  const [state, setState] = useState<SquadHistoryState>({ status: "loading" });
  const [connection, setConnection] = useState<ConnectionStatus>("connected");
  const [loaded, setLoaded] = useState(false);
  const storeRef = useRef<Store | null>(null);
  const requestId = useRef(0);
  const clock = useRef<{ timezone: string; currentWeek: string } | null>(null);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const store = (storeRef.current ??= getStore());
    const toSignIn = () =>
      router.replace(
        `/auth?mode=signin&next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
    if (!squadId) {
      router.replace("/squad");
      return;
    }
    try {
      const session = await store.getSession();
      if (!session) {
        toSignIn();
        return;
      }
      const history = await store.getHistory(squadId);
      if (id !== requestId.current) return;
      const now = new Date();
      clock.current = {
        timezone: history.squad.timezone,
        currentWeek: currentWeekStart(now, history.squad.timezone),
      };
      setLoaded(true);
      setState({ status: "ready", session, history, now });
    } catch (error) {
      if (id !== requestId.current) return;
      if (error instanceof StoreError && error.code === "not_signed_in") {
        toSignIn();
        return;
      }
      // Keep showing what we have if a background refresh fails.
      setState((previous) =>
        previous.status === "ready" ? previous : { status: "error", message: messageFor(error) },
      );
      if (error instanceof StoreError && error.code === "network") setConnection("reconnecting");
    }
  }, [router, squadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loaded || !squadId) return;
    const store = (storeRef.current ??= getStore());
    return store.subscribe(squadId, () => void load(), setConnection);
  }, [loaded, squadId, load]);

  useEffect(() => {
    const tick = setInterval(() => {
      const last = clock.current;
      if (last && currentWeekStart(new Date(), last.timezone) !== last.currentWeek) void load();
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

  return { state, connection, reload: load };
}
