import type { GoalInput } from "./goal";
import { isGoalComplete } from "./progress";
import type { Goal } from "./types";

/** An unfinished goal from the week before, offered for the week being planned. */
export interface CarryOver {
  /** The goal it comes from. Used to remember a "don't carry this over". */
  sourceId: string;
  input: GoalInput;
}

const sameTitle = (title: string) => title.trim().toLowerCase();

/**
 * The owner's unfinished goals from the week before, ready to be added to the
 * week being planned. Nothing is created until the owner confirms.
 *
 * Left out: goals that were finished, ones the owner dismissed, and ones whose
 * title is already in the week being planned. The wording and target are
 * copied exactly; the count starts again from zero.
 */
export function carryOverCandidates(
  previousWeekGoals: readonly Goal[],
  thisWeekGoals: readonly Goal[],
  dismissed: ReadonlySet<string>,
): CarryOver[] {
  const taken = new Set(thisWeekGoals.map((goal) => sameTitle(goal.title)));
  const candidates: CarryOver[] = [];
  for (const goal of previousWeekGoals) {
    const key = sameTitle(goal.title);
    if (isGoalComplete(goal) || dismissed.has(goal.id) || taken.has(key)) continue;
    taken.add(key);
    candidates.push({
      sourceId: goal.id,
      input: {
        title: goal.title,
        description: goal.description,
        goalType: goal.goalType,
        targetCount: goal.targetCount,
        unitLabel: goal.unitLabel,
      },
    });
  }
  return candidates;
}
