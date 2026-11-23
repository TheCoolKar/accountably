import type { Nudge } from "./types";

/**
 * Nudge allowance: up to NUDGE_LIMIT nudges from one person to another in any
 * NUDGE_WINDOW_HOURS, each on a different goal. After that the sender waits
 * until the oldest of them is a day old.
 * The database enforces the same numbers in send_nudge; keep them equal.
 */
export const NUDGE_LIMIT = 3;
export const NUDGE_WINDOW_HOURS = 24;

const WINDOW_MS = NUDGE_WINDOW_HOURS * 60 * 60 * 1000;

/** Nudges from `senderId` to `recipientId` that still count against the allowance. */
function recentNudges(
  nudges: readonly Nudge[],
  senderId: string,
  recipientId: string,
  now: Date,
): Nudge[] {
  const since = now.getTime() - WINDOW_MS;
  return nudges.filter(
    (nudge) =>
      nudge.senderId === senderId &&
      nudge.recipientId === recipientId &&
      new Date(nudge.createdAt).getTime() > since,
  );
}

/** How many more nudges `senderId` can send `recipientId` right now. */
export function nudgesLeft(
  nudges: readonly Nudge[],
  senderId: string,
  recipientId: string,
  now: Date,
): number {
  return Math.max(0, NUDGE_LIMIT - recentNudges(nudges, senderId, recipientId, now).length);
}

/** Goals of `recipientId` that `senderId` has nudged within the window. */
export function nudgedGoalIds(
  nudges: readonly Nudge[],
  senderId: string,
  recipientId: string,
  now: Date,
): ReadonlySet<string> {
  return new Set(recentNudges(nudges, senderId, recipientId, now).map((nudge) => nudge.goalId));
}

/**
 * When the allowance opens up again, or null if a nudge can be sent now.
 * That is a day after the oldest nudge still counting.
 */
export function nudgeAvailableAt(
  nudges: readonly Nudge[],
  senderId: string,
  recipientId: string,
  now: Date,
): Date | null {
  const recent = recentNudges(nudges, senderId, recipientId, now);
  if (recent.length < NUDGE_LIMIT) return null;
  const oldest = Math.min(...recent.map((nudge) => new Date(nudge.createdAt).getTime()));
  return new Date(oldest + WINDOW_MS);
}

/** Who has nudged this goal in the last day, most recent first, each person once. */
export function recentNudgers(
  nudges: readonly Nudge[],
  goalId: string,
  recipientId: string,
  now: Date,
): string[] {
  const since = now.getTime() - WINDOW_MS;
  const recent = nudges
    .filter(
      (nudge) =>
        nudge.goalId === goalId &&
        nudge.recipientId === recipientId &&
        new Date(nudge.createdAt).getTime() > since,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((nudge) => nudge.senderId);
  return [...new Set(recent)];
}
