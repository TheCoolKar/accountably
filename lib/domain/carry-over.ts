import type { GoalInput } from "./goal";
import { isGoalComplete } from "./progress";
import type { Goal } from "./types";

/** A goal from elsewhere, offered for the week being planned. */
export interface CarryOver {
  /** The goal it comes from. Used to remember a "don't carry this over". */
  sourceId: string;
  input: GoalInput;
}

const sameTitle = (title: string) => title.trim().toLowerCase();

/** The goal's wording and target, with the count starting again from zero. */
function copyOf(goal: Goal): CarryOver {
  return {
    sourceId: goal.id,
    input: {
      title: goal.title,
      description: goal.description,
      goalType: goal.goalType,
      targetCount: goal.targetCount,
      unitLabel: goal.unitLabel,
    },
  };
}

/** Copies of `source` whose titles aren't already taken, each title once. */
function copies(
  source: readonly Goal[],
  thisWeekGoals: readonly Goal[],
  skip: (goal: Goal) => boolean,
): CarryOver[] {
  const taken = new Set(thisWeekGoals.map((goal) => sameTitle(goal.title)));
  const candidates: CarryOver[] = [];
  for (const goal of source) {
    const key = sameTitle(goal.title);
    if (skip(goal) || taken.has(key)) continue;
    taken.add(key);
    candidates.push(copyOf(goal));
  }
  return candidates;
}

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
  return copies(
    previousWeekGoals,
    thisWeekGoals,
    (goal) => isGoalComplete(goal) || dismissed.has(goal.id),
  );
}

/**
 * The owner's goals for the same week in another of their squads, ready to
 * be added here. Finished ones are offered too: this copies the plan, not the
 * progress, so every count starts at zero. Titles already in this week are
 * left out. Nothing is created until the owner confirms.
 */
export function importCandidates(
  otherSquadGoals: readonly Goal[],
  thisWeekGoals: readonly Goal[],
): CarryOver[] {
  return copies(otherSquadGoals, thisWeekGoals, () => false);
}
