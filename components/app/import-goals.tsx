"use client";

import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { getStore, messageFor, type SquadSummary } from "@/lib/data";
import { importCandidates, type CarryOver } from "@/lib/domain/carry-over";
import type { DateString, Goal } from "@/lib/domain/types";

type Loaded =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; mineThere: number; items: CarryOver[] };

function detail(item: CarryOver): string | null {
  if (item.input.goalType !== "counted") return null;
  const unit = item.input.unitLabel ? ` ${item.input.unitLabel}` : "";
  return `${item.input.targetCount}${unit}`;
}

function members(squad: SquadSummary): string {
  return squad.otherMembers.length === 0 ? "Just you so far" : `With ${squad.otherMembers.join(", ")}`;
}

/** My goals for the same week in one other squad, each one droppable before adding. */
function FromSquad({
  squad,
  myId,
  weekStart,
  weekLabel,
  myGoals,
  onAdd,
}: {
  squad: SquadSummary;
  myId: string;
  weekStart: DateString;
  weekLabel: string;
  myGoals: Goal[];
  onAdd: (items: CarryOver[]) => Promise<boolean>;
}) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snapshot = await getStore().getWeek(squad.id, weekStart);
        if (cancelled) return;
        const mine = snapshot.goals.filter((goal) => goal.ownerId === myId);
        setLoaded({ status: "ready", mineThere: mine.length, items: importCandidates(mine, myGoals) });
      } catch (error) {
        if (!cancelled) setLoaded({ status: "error", message: messageFor(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // myGoals changes on every refetch; the list only needs it at load time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad.id, weekStart, myId, attempt]);

  if (loaded.status === "loading") {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground">Couldn&apos;t load your goals there. {loaded.message}</p>
        <Button
          size="touch"
          onClick={() => {
            setLoaded({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const items = loaded.items.filter((item) => !dropped.has(item.sourceId));

  if (items.length === 0) {
    return (
      <p className="py-2 text-muted-foreground">
        {loaded.mineThere === 0
          ? `You haven't set goals in ${squad.name} for ${weekLabel} yet.`
          : loaded.items.length === 0
            ? `Everything you set in ${squad.name} is already here.`
            : "Nothing left to add."}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <p className="text-sm text-muted-foreground">
        Cross off any you don&apos;t want here. Counts start at zero.
      </p>
      <ul className="mt-1 flex flex-col">
        {items.map((item) => (
          <li key={item.sourceId} className="flex min-h-11 items-center gap-2">
            <span className="min-w-0 flex-1 wrap-break-word">
              {item.input.title}
              {detail(item) && (
                <span className="ml-2 text-sm text-muted-foreground tabular-nums">
                  {detail(item)}
                </span>
              )}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDropped((previous) => new Set([...previous, item.sourceId]))}
              aria-label={`Don't copy ${item.input.title}`}
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <XIcon className="size-5" />
            </button>
          </li>
        ))}
      </ul>
      <Button
        size="touch"
        className="mt-3 w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onAdd(items);
          setBusy(false);
        }}
      >
        {busy ? "Adding…" : `Add ${items.length === 1 ? "this goal" : `these ${items.length} goals`}`}
      </Button>
    </div>
  );
}

/**
 * Copies my goals for this week from another of my squads. Pick the squad
 * (skipped when there's only one), review the list, add. Nothing is created
 * until the add button is pressed, and added goals are ordinary goals here.
 */
export function ImportGoalsSheet({
  open,
  onOpenChange,
  squads,
  myId,
  weekStart,
  weekLabel,
  myGoals,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  squads: SquadSummary[];
  myId: string;
  weekStart: DateString;
  weekLabel: string;
  myGoals: Goal[];
  onAdd: (items: CarryOver[]) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const only = squads.length === 1 ? squads[0] : null;
  const source = only ?? squads.find((squad) => squad.id === picked) ?? null;

  function change(next: boolean) {
    if (!next) setPicked(null);
    onOpenChange(next);
  }

  return (
    <Drawer open={open} onOpenChange={change}>
      <DrawerContent className="mx-auto max-w-md">
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-1">
            {source && !only && (
              <Button
                variant="ghost"
                size="icon-lg"
                className="-ml-2 size-11 shrink-0 rounded-full"
                aria-label="Pick another squad"
                onClick={() => setPicked(null)}
              >
                <ChevronLeftIcon className="size-5" />
              </Button>
            )}
            <DrawerTitle className="font-heading text-xl">
              {source ? `From ${source.name}` : "Copy from another squad"}
            </DrawerTitle>
          </div>
          <DrawerDescription>
            {source
              ? `Your goals there for ${weekLabel}.`
              : `Pick a squad to copy your goals for ${weekLabel} from.`}
          </DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[60dvh] overflow-y-auto px-4 pb-6">
          {open && source ? (
            <FromSquad
              key={source.id}
              squad={source}
              myId={myId}
              weekStart={weekStart}
              weekLabel={weekLabel}
              myGoals={myGoals}
              onAdd={async (items) => {
                const ok = await onAdd(items);
                if (ok) change(false);
                return ok;
              }}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {squads.map((squad) => (
                <li key={squad.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(squad.id)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left outline-none transition-colors active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{squad.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {members(squad)}
                      </span>
                    </span>
                    <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
