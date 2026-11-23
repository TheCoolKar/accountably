import type { ActivityType, GoalType } from "./types";

export const GOAL_TITLE_MAX = 120;
export const GOAL_DESCRIPTION_MAX = 500;
export const GOAL_UNIT_MAX = 20;
export const GOAL_TARGET_MAX = 999;
/** Guidance shown in the UI. Not a limit. */
export const SUGGESTED_GOALS_MIN = 3;
export const SUGGESTED_GOALS_MAX = 5;

export interface GoalDraft {
  title: string;
  description: string;
  goalType: GoalType;
  /** Raw text from the form, or a number. */
  targetCount: string | number;
  unitLabel: string;
}

export interface GoalInput {
  title: string;
  description: string | null;
  goalType: GoalType;
  targetCount: number;
  unitLabel: string | null;
}

export type GoalField = "title" | "description" | "targetCount" | "unitLabel";

export type GoalValidation =
  | { ok: true; value: GoalInput }
  | { ok: false; errors: Partial<Record<GoalField, string>> };

/**
 * Cleans up whitespace and checks limits. The title is stored as the owner
 * wrote it: this never rewrites wording or invents a target.
 */
export function validateGoalDraft(draft: GoalDraft): GoalValidation {
  const errors: Partial<Record<GoalField, string>> = {};
  const title = draft.title.trim();
  const description = draft.description.trim();
  const unitLabel = draft.unitLabel.trim();

  if (title.length === 0) errors.title = "Give your goal a name.";
  else if (title.length > GOAL_TITLE_MAX)
    errors.title = `Keep it under ${GOAL_TITLE_MAX} characters.`;

  if (description.length > GOAL_DESCRIPTION_MAX)
    errors.description = `Keep it under ${GOAL_DESCRIPTION_MAX} characters.`;

  let targetCount = 1;
  if (draft.goalType === "counted") {
    const raw =
      typeof draft.targetCount === "number"
        ? draft.targetCount
        : Number(draft.targetCount.trim());
    if (
      (typeof draft.targetCount === "string" && draft.targetCount.trim() === "") ||
      !Number.isInteger(raw) ||
      raw < 1
    ) {
      errors.targetCount = "Enter a whole number, 1 or more.";
    } else if (raw > GOAL_TARGET_MAX) {
      errors.targetCount = `Keep it at ${GOAL_TARGET_MAX} or less.`;
    } else {
      targetCount = raw;
    }
    if (unitLabel.length > GOAL_UNIT_MAX)
      errors.unitLabel = `Keep it under ${GOAL_UNIT_MAX} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      title,
      description: description.length > 0 ? description : null,
      goalType: draft.goalType,
      targetCount,
      unitLabel:
        draft.goalType === "counted" && unitLabel.length > 0 ? unitLabel : null,
    },
  };
}

/** Keeps a count inside 0..target whatever the caller asks for. */
export function clampCount(count: number, targetCount: number): number {
  return Math.min(targetCount, Math.max(0, Math.trunc(count)));
}

interface GoalState {
  title: string;
  description: string | null;
  goalType: GoalType;
  targetCount: number;
  completedCount: number;
  unitLabel: string | null;
}

/**
 * Which activity event a goal change produces, or `null` if nothing the squad
 * should see changed. The database trigger in `supabase/migrations` follows
 * the same rules; keep the two in step.
 */
export function activityForGoalChange(
  before: GoalState,
  after: GoalState,
): ActivityType | null {
  const edited =
    before.title !== after.title ||
    before.description !== after.description ||
    before.goalType !== after.goalType ||
    before.targetCount !== after.targetCount ||
    before.unitLabel !== after.unitLabel;
  if (edited) return "goal_edited";

  if (before.completedCount === after.completedCount) return null;

  const wasComplete = before.completedCount >= before.targetCount;
  const isComplete = after.completedCount >= after.targetCount;
  if (!wasComplete && isComplete) return "goal_completed";
  if (wasComplete && !isComplete) return "goal_reopened";
  return "progress_updated";
}
