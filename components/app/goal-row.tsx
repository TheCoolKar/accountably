"use client";

import { CheckIcon, HandHeartIcon, MinusIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isGoalComplete } from "@/lib/domain/progress";
import type { Goal } from "@/lib/domain/types";

function countLabel(goal: Goal): string {
  const unit = goal.unitLabel ? ` ${goal.unitLabel}` : "";
  return `${goal.completedCount} of ${goal.targetCount}${unit}`;
}

function StatusDot({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
        done ? "border-primary bg-primary text-primary-foreground" : "border-input",
      )}
    >
      {done && <CheckIcon className="size-3.5 animate-in zoom-in-50 duration-200" strokeWidth={3} />}
    </span>
  );
}

/**
 * A friend's goal: visible, never editable. The only thing you can do to it
 * is nudge: `nudge` is "available", "sent" (this is the goal you nudged), or
 * absent when nudging doesn't apply.
 */
export function FriendGoalRow({
  goal,
  ownerName,
  nudge,
  onNudge,
}: {
  goal: Goal;
  ownerName?: string;
  nudge?: "available" | "sent";
  onNudge?: () => void;
}) {
  const done = isGoalComplete(goal);
  return (
    <li className="flex min-h-11 items-center gap-3 py-1.5">
      <StatusDot done={done} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("wrap-break-word", done && "text-muted-foreground")}>{goal.title}</span>
        {goal.goalType === "counted" && (
          <span className="text-sm text-muted-foreground tabular-nums">{countLabel(goal)}</span>
        )}
      </span>
      <span className="sr-only">{done ? "Done" : "Not done yet"}</span>
      {!done && nudge === "available" && (
        <button
          type="button"
          onClick={onNudge}
          aria-label={`Nudge ${ownerName ?? "them"} about ${goal.title}`}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold outline-none transition-colors active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <HandHeartIcon className="size-4 text-primary" />
          Nudge
        </button>
      )}
      {!done && nudge === "sent" && (
        <span className="flex h-11 shrink-0 items-center px-1 text-sm text-muted-foreground">
          Nudged
        </span>
      )}
    </li>
  );
}

const stepButton =
  "flex size-11 shrink-0 items-center justify-center rounded-full border bg-card outline-none transition-colors active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-35";

/** My goal: one tap to log progress, tap the title to edit. */
export function MyGoalRow({
  goal,
  readOnly,
  cheeredBy = [],
  onAdjust,
  onEdit,
}: {
  goal: Goal;
  readOnly: boolean;
  /** Names of squadmates who nudged this goal in the last day. */
  cheeredBy?: string[];
  /** Move the count up or down by this much. */
  onAdjust: (delta: number) => void;
  onEdit: () => void;
}) {
  const done = isGoalComplete(goal);

  if (readOnly) return <FriendGoalRow goal={goal} />;

  return (
    <li className="flex items-center gap-2 py-1.5">
      {goal.goalType === "one_time" && (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`${goal.title}: ${done ? "done, tap to undo" : "mark done"}`}
          onClick={() => onAdjust(done ? -1 : 1)}
          className="-ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <StatusDot done={done} />
        </button>
      )}

      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit goal: ${goal.title}`}
        className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className={cn("max-w-full wrap-break-word", done && "text-muted-foreground")}>
          {goal.title}
        </span>
        {goal.goalType === "counted" && (
          <span
            className={cn(
              "text-sm tabular-nums",
              done ? "font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            {countLabel(goal)}
          </span>
        )}
        {!done && cheeredBy.length > 0 && (
          <span className="text-sm font-medium text-primary">
            {cheeredBy.join(" and ")} {cheeredBy.length === 1 ? "is" : "are"} cheering you on
          </span>
        )}
      </button>

      {goal.goalType === "counted" && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label={`Remove one from ${goal.title}`}
            disabled={goal.completedCount <= 0}
            onClick={() => onAdjust(-1)}
            className={stepButton}
          >
            <MinusIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Add one to ${goal.title}`}
            disabled={done}
            onClick={() => onAdjust(1)}
            className={cn(stepButton, !done && "border-primary bg-primary text-primary-foreground active:bg-primary/85")}
          >
            {done ? <CheckIcon className="size-4" strokeWidth={3} /> : <PlusIcon className="size-4" />}
          </button>
        </div>
      )}
    </li>
  );
}
