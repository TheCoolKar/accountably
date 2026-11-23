import type { Goal } from "./types";

/**
 * Whether a change of count on `source` is copied to `other`: the same
 * person's goal for the same week in a different squad, with the same title
 * (ignoring capitals and surrounding spaces), type and target.
 *
 * The database does the copying (goals_sync_progress in
 * supabase/migrations/20261123000000_sync_progress_across_squads.sql), and
 * also skips weeks that have closed and squads the owner has left. Keep the
 * two rules the same.
 */
export function isLinkedGoal(source: Goal, other: Goal): boolean {
  return (
    other.id !== source.id &&
    other.ownerId === source.ownerId &&
    other.squadId !== source.squadId &&
    other.weekStart === source.weekStart &&
    other.title.trim().toLowerCase() === source.title.trim().toLowerCase() &&
    other.goalType === source.goalType &&
    other.targetCount === source.targetCount
  );
}
