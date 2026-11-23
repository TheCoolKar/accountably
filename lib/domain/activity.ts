import type { ActivityEvent } from "./types";

/**
 * True for the events worth celebrating in the feed: a goal finished, or a
 * counted goal moved forward (a "sub-goal" done). Taking a count back down,
 * edits and removals are not wins.
 */
export function isProgressWin(event: Pick<ActivityEvent, "type" | "metadata">): boolean {
  if (event.type === "goal_completed") return true;
  if (event.type !== "progress_updated") return false;
  const { completed_count: now, previous_count: before } = event.metadata;
  // Events recorded before the previous count was stored: assume forward.
  if (now === undefined || before === undefined) return true;
  return now > before;
}
