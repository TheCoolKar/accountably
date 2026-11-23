interface Countable {
  completedCount: number;
  targetCount: number;
}

/** Fraction from 0 to 1. */
export function goalProgress(goal: Countable): number {
  if (goal.targetCount <= 0) return 0;
  return Math.min(1, Math.max(0, goal.completedCount / goal.targetCount));
}

export function isGoalComplete(goal: Countable): boolean {
  return goal.targetCount >= 1 && goal.completedCount >= goal.targetCount;
}

/**
 * How strongly early progress is rewarded. 1 would be a straight line; higher
 * makes the first goals count for more. Tune this one number.
 */
export const EARLY_PROGRESS_BOOST = 2;

/**
 * Turns the plain share of the week done into the percentage people see.
 * The curve is front-loaded on purpose: the first goals you finish move the
 * number a lot, so the week feels within reach early. With 4 goals it reads
 * 44%, 75%, 94%, 100% (a straight line would be 25, 50, 75, 100).
 *
 * It stays honest at the ends: nothing done is exactly 0 and only a fully
 * finished week is 100. The "2 of 4 done" count beside it is never adjusted.
 */
export function boostProgress(share: number): number {
  const clamped = Math.min(1, Math.max(0, share));
  return 1 - (1 - clamped) ** EARLY_PROGRESS_BOOST;
}

/**
 * A member's progress for the week: the mean of their goal progress (each
 * goal weighted equally), passed through `boostProgress`.
 * `null` means the member has no goals this week: "Not locked in".
 */
export function memberProgress(goals: readonly Countable[]): number | null {
  if (goals.length === 0) return null;
  const total = goals.reduce((sum, goal) => sum + goalProgress(goal), 0);
  return boostProgress(total / goals.length);
}

/**
 * Mean of participating members' progress, each member weighted equally.
 * Members who are not locked in (`null`) are left out. `null` when nobody
 * has goals, so the UI can show a neutral empty state instead of 0%.
 */
export function squadProgress(
  memberProgresses: readonly (number | null)[],
): number | null {
  const participating = memberProgresses.filter(
    (value): value is number => value !== null,
  );
  if (participating.length === 0) return null;
  return participating.reduce((sum, value) => sum + value, 0) / participating.length;
}

/**
 * Whole percentage for display. Never rounds up to 100 while something is
 * unfinished, and never rounds down to 0 once there is some progress.
 */
export function toPercent(fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  if (clamped >= 1) return 100;
  if (clamped <= 0) return 0;
  return Math.min(99, Math.max(1, Math.round(clamped * 100)));
}

export function countCompleted(goals: readonly Countable[]): {
  done: number;
  total: number;
} {
  return { done: goals.filter(isGoalComplete).length, total: goals.length };
}
