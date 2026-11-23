"use client";

import { useCallback, useState } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CarryOver } from "@/lib/domain/carry-over";

const STORAGE_KEY = "accountably:carry-over-dismissed";
/** Old entries fall off the end; they belong to weeks long gone. */
const KEEP = 300;

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Which carry-over suggestions this person has crossed off. Kept on the
 * device: crossing one off only hides a suggestion, it never changes a goal.
 */
export function useDismissedCarryOvers() {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(
    () => new Set(typeof window === "undefined" ? [] : readDismissed()),
  );

  const dismiss = useCallback((sourceId: string) => {
    setDismissed((previous) => {
      const next = [...previous, sourceId].slice(-KEEP);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Without storage it is forgotten on reload, which is harmless.
      }
      return new Set(next);
    });
  }, []);

  return { dismissed, dismiss };
}

function detail(item: CarryOver): string | null {
  if (item.input.goalType !== "counted") return null;
  const unit = item.input.unitLabel ? ` ${item.input.unitLabel}` : "";
  return `${item.input.targetCount}${unit}`;
}

/**
 * Unfinished goals from the week before, ready to add in one tap. Each can be
 * crossed off first. Nothing is added until the button is pressed.
 */
export function CarryOverList({
  heading,
  items,
  onDismiss,
  onAdd,
}: {
  heading: string;
  items: CarryOver[];
  onDismiss: (sourceId: string) => void;
  onAdd: (items: CarryOver[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-dashed border-primary/40 bg-accent/50 p-3">
      <h3 className="text-sm font-semibold">{heading}</h3>
      <p className="text-sm text-muted-foreground">
        Cross off any you&apos;re dropping, then add the rest.
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
              onClick={() => onDismiss(item.sourceId)}
              aria-label={`Don't carry over ${item.input.title}`}
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <XIcon className="size-5" />
            </button>
          </li>
        ))}
      </ul>
      <Button
        size="touch"
        className="mt-2 w-full"
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
