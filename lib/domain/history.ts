/**
 * Everything the History and Week recap screens show, worked out from stored
 * goals. Percentages use the same functions as the dashboard (front-loaded,
 * see progress.ts) so a week reads the same everywhere; counts stay literal.
 */
import {
  countCompleted,
  goalProgress,
  isGoalComplete,
  memberProgress,
  squadProgress,
  toPercent,
} from "./progress";
import type { DateString, Goal, Member } from "./types";
import { addDays, currentWeekStart, isWeekClosed, localDateInZone, weekEndOf } from "./week";

/** One week as stored: its Monday, the zone it was fixed in, and its goals. */
export interface StoredWeek {
  weekStart: DateString;
  timezone: string;
  goals: Goal[];
}

/** A week on the History timeline, with gaps filled and open/closed worked out. */
export interface HistoryWeek extends StoredWeek {
  closed: boolean;
  /** The week in progress right now. */
  live: boolean;
}

export type Scope = { kind: "squad" } | { kind: "member"; memberId: string };

/** How many weeks a goal must appear in to count as one that stuck. */
export const RECURRING_MIN_WEEKS = 4;
/** Fewer closed weeks than this and the trend isn't meaningful. */
export const TREND_MIN_WEEKS = 4;

/** Lower-case, trimmed, inner spaces collapsed. Same rule as carry-over, plus spacing. */
export function normaliseTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Stored weeks turned into the timeline History shows: oldest first, from the
 * first week anyone set a goal up to this week. Weeks planned ahead are left
 * out, and weeks with no row are filled in as empty ("Not locked in"), so a
 * skipped week stays visible instead of silently disappearing.
 */
export function buildTimeline(
  stored: readonly StoredWeek[],
  now: Date,
  squadTimezone: string,
): HistoryWeek[] {
  const current = currentWeekStart(now, squadTimezone);
  const byStart = new Map(stored.map((week) => [week.weekStart, week]));
  const withGoals = stored
    .filter((week) => week.goals.length > 0 && week.weekStart <= current)
    .map((week) => week.weekStart)
    .sort();
  const first = withGoals[0] ?? current;

  const timeline: HistoryWeek[] = [];
  for (let start = first; start <= current; start = addDays(start, 7)) {
    const week = byStart.get(start) ?? { weekStart: start, timezone: squadTimezone, goals: [] };
    const closed = isWeekClosed(start, now, week.timezone);
    timeline.push({ ...week, closed, live: !closed });
  }
  return timeline;
}

function goalsInScope(week: StoredWeek, scope: Scope): Goal[] {
  return scope.kind === "squad"
    ? week.goals
    : week.goals.filter((goal) => goal.ownerId === scope.memberId);
}

function ownersOf(goals: readonly Goal[]): string[] {
  return [...new Set(goals.map((goal) => goal.ownerId))];
}

/** Progress as a fraction (boosted, like the dashboard), or null when nobody in scope set goals. */
export function weekProgress(week: StoredWeek, scope: Scope): number | null {
  const goals = goalsInScope(week, scope);
  if (scope.kind === "member") return memberProgress(goals);
  return squadProgress(
    ownersOf(goals).map((owner) => memberProgress(goals.filter((goal) => goal.ownerId === owner))),
  );
}

/** Whole percentage, or null for "Not locked in". */
export function weekPercent(week: StoredWeek, scope: Scope): number | null {
  const value = weekProgress(week, scope);
  return value === null ? null : toPercent(value);
}

export interface WeekPoint {
  weekStart: DateString;
  live: boolean;
  closed: boolean;
  pct: number | null;
  done: number;
  total: number;
  /** Points vs the week before, in the same scope. Null when either is empty or there is none. */
  delta: number | null;
}

export function weekSeries(timeline: readonly HistoryWeek[], scope: Scope): WeekPoint[] {
  const points: WeekPoint[] = [];
  timeline.forEach((week, index) => {
    const pct = weekPercent(week, scope);
    const previous = index > 0 ? points[index - 1].pct : null;
    points.push({
      weekStart: week.weekStart,
      live: week.live,
      closed: week.closed,
      pct,
      ...countCompleted(goalsInScope(week, scope)),
      delta: pct === null || previous === null ? null : pct - previous,
    });
  });
  return points;
}

/** Finished goals across every week, this week included. */
export function goalsFinished(timeline: readonly HistoryWeek[], scope: Scope): number {
  return timeline.reduce(
    (sum, week) => sum + goalsInScope(week, scope).filter(isGoalComplete).length,
    0,
  );
}

/** Weeks where someone in scope set at least one goal. */
export function weeksLockedIn(timeline: readonly HistoryWeek[], scope: Scope): number {
  return timeline.filter((week) => goalsInScope(week, scope).length > 0).length;
}

/** Goals set across every week, this week included. */
export function goalsSet(timeline: readonly HistoryWeek[], scope: Scope): number {
  return timeline.reduce((sum, week) => sum + goalsInScope(week, scope).length, 0);
}

export interface ClosedStats {
  avg: number;
  best: { pct: number; weekStart: DateString };
  /** Closed weeks with goals: the ones the figures are based on. */
  count: number;
}

function closedPercents(timeline: readonly HistoryWeek[], scope: Scope) {
  return weekSeries(timeline, scope).filter(
    (point): point is WeekPoint & { pct: number } => point.closed && point.pct !== null,
  );
}

const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** Average and best of closed weeks; weeks nobody locked in are skipped. Null with none. */
export function closedStats(timeline: readonly HistoryWeek[], scope: Scope): ClosedStats | null {
  const points = closedPercents(timeline, scope);
  if (points.length === 0) return null;
  // The first week to reach the top figure keeps the title.
  const best = points.reduce((top, point) => (point.pct > top.pct ? point : top), points[0]);
  return {
    avg: Math.round(mean(points.map((point) => point.pct))),
    best: { pct: best.pct, weekStart: best.weekStart },
    count: points.length,
  };
}

export interface Trend {
  points: number;
  from: DateString;
  to: DateString;
}

/**
 * Mean of the last k closed weeks minus the mean of the first k, with
 * k = min(4, floor(n / 2)). Null with fewer than 4 closed weeks.
 */
export function trend(timeline: readonly HistoryWeek[], scope: Scope): Trend | null {
  const points = closedPercents(timeline, scope);
  const n = points.length;
  if (n < TREND_MIN_WEEKS) return null;
  const k = Math.min(4, Math.floor(n / 2));
  const first = mean(points.slice(0, k).map((point) => point.pct));
  const last = mean(points.slice(-k).map((point) => point.pct));
  return {
    points: Math.round(last - first),
    from: points[0].weekStart,
    to: points[n - 1].weekStart,
  };
}

/** Members expected to take part in a week: joined by its Sunday, not gone before its Monday. */
function activeDuring(member: Member, week: StoredWeek): boolean {
  const joined = localDateInZone(new Date(member.joinedAt), week.timezone);
  if (joined > weekEndOf(week.weekStart)) return false;
  if (!member.leftAt) return true;
  return localDateInZone(new Date(member.leftAt), week.timezone) >= week.weekStart;
}

function everyoneLockedIn(week: StoredWeek, members: readonly Member[], scope: Scope): boolean {
  const owners = new Set(week.goals.map((goal) => goal.ownerId));
  if (scope.kind === "member") return owners.has(scope.memberId);
  const expected = members.filter((member) => activeDuring(member, week));
  return expected.length > 0 && expected.every((member) => owners.has(member.userId));
}

/**
 * Consecutive weeks, counted back from the newest, where everyone in scope set
 * at least one goal. This week only adds to the streak once it qualifies; an
 * unfinished lock-in mid-week never breaks it.
 */
export function lockInStreak(
  timeline: readonly HistoryWeek[],
  members: readonly Member[],
  scope: Scope = { kind: "squad" },
): number {
  let streak = 0;
  for (let index = timeline.length - 1; index >= 0; index--) {
    const week = timeline[index];
    if (everyoneLockedIn(week, members, scope)) streak++;
    else if (!week.live) break;
  }
  return streak;
}

export type CellState = "done" | "partly" | "none" | "unset";

export interface RecurringCell {
  weekStart: DateString;
  live: boolean;
  state: CellState;
  /** 0–1, for shading partly-done cells. */
  progress: number;
  done: number;
  target: number;
}

export interface RecurringGoal {
  ownerId: string;
  /** The most recent wording. */
  title: string;
  /** Closed weeks it was set in, and how many of those it was finished. */
  weeksSet: number;
  weeksDone: number;
  cells: RecurringCell[];
}

interface GoalGroup {
  ownerId: string;
  title: string;
  byWeek: Map<DateString, Goal>;
}

function groupGoals(
  timeline: readonly HistoryWeek[],
  scope: Scope,
  include: (goal: Goal) => boolean = () => true,
): GoalGroup[] {
  const groups = new Map<string, GoalGroup>();
  for (const week of timeline) {
    for (const goal of goalsInScope(week, scope)) {
      if (!include(goal)) continue;
      const key = `${goal.ownerId}\u0000${normaliseTitle(goal.title)}`;
      let group = groups.get(key);
      if (!group) {
        group = { ownerId: goal.ownerId, title: goal.title, byWeek: new Map() };
        groups.set(key, group);
      }
      group.title = goal.title;
      // Two goals with the same title in one week: the first one stands for the week.
      if (!group.byWeek.has(week.weekStart)) group.byWeek.set(week.weekStart, goal);
    }
  }
  return [...groups.values()];
}

/**
 * Goals set in at least 4 weeks, grouped by owner and title (ignoring capitals
 * and spacing). Best follow-through first, then the most often set. A renamed
 * goal starts a new row.
 */
export function recurringGoals(timeline: readonly HistoryWeek[], scope: Scope): RecurringGoal[] {
  const rows = groupGoals(timeline, scope)
    .filter((group) => group.byWeek.size >= RECURRING_MIN_WEEKS)
    .map((group): RecurringGoal => {
      let weeksSet = 0;
      let weeksDone = 0;
      const cells = timeline.map((week): RecurringCell => {
        const goal = group.byWeek.get(week.weekStart);
        if (!goal) {
          return { weekStart: week.weekStart, live: week.live, state: "unset", progress: 0, done: 0, target: 0 };
        }
        const progress = goalProgress(goal);
        const complete = isGoalComplete(goal);
        if (week.closed) {
          weeksSet++;
          if (complete) weeksDone++;
        }
        return {
          weekStart: week.weekStart,
          live: week.live,
          state: complete ? "done" : progress > 0 ? "partly" : "none",
          progress,
          done: goal.completedCount,
          target: goal.targetCount,
        };
      });
      return { ownerId: group.ownerId, title: group.title, weeksSet, weeksDone, cells };
    });
  const rate = (row: RecurringGoal) => (row.weeksSet === 0 ? 0 : row.weeksDone / row.weeksSet);
  return rows.sort((a, b) => rate(b) - rate(a) || b.weeksSet - a.weeksSet);
}

export type NumberTile =
  | { kind: "counted"; value: number; unit: string; title: string; ownerId: string }
  | { kind: "goals_finished"; value: number }
  | { kind: "weeks_locked_in"; value: number }
  | { kind: "goals_set"; value: number }
  | { kind: "streak"; value: number };

/**
 * Four tiles. Up to three are totals of counted goals (summed across weeks,
 * this week included), biggest first. One-time goals never become quantities.
 * Missing slots are filled with goals finished, weeks locked in, goals set.
 * The last tile is always the lock-in streak.
 */
export function byTheNumbers(
  timeline: readonly HistoryWeek[],
  members: readonly Member[],
  scope: Scope,
): NumberTile[] {
  const counted = groupGoals(timeline, scope, (goal) => goal.goalType === "counted")
    .map((group): NumberTile & { kind: "counted" } => {
      const goals = [...group.byWeek.values()];
      const latest = goals[goals.length - 1];
      return {
        kind: "counted",
        value: goals.reduce((sum, goal) => sum + Math.min(goal.completedCount, goal.targetCount), 0),
        unit: latest.unitLabel?.trim() || "times",
        title: group.title,
        ownerId: group.ownerId,
      };
    })
    .filter((tile) => tile.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const fillers: NumberTile[] = [
    { kind: "goals_finished", value: goalsFinished(timeline, scope) },
    { kind: "weeks_locked_in", value: weeksLockedIn(timeline, scope) },
    { kind: "goals_set", value: goalsSet(timeline, scope) },
  ];
  return [
    ...counted,
    ...fillers.slice(0, 3 - counted.length),
    { kind: "streak", value: lockInStreak(timeline, members, scope) },
  ];
}

/** "+5 pts", "−3 pts" (a real minus sign), "0 pts". */
export function formatPoints(points: number): string {
  if (points > 0) return `+${points} pts`;
  if (points < 0) return `−${-points} pts`;
  return "0 pts";
}

/** The line under a week's figure comparing it with the week before. */
export function formatDelta(delta: number | null): string | null {
  if (delta === null) return null;
  if (delta === 0) return "Same as the week before";
  return `${formatPoints(delta)} vs the week before`;
}

/** The recap headline. Supportive at every level. */
export function recapHeadline(pct: number | null): string {
  if (pct === null) return "Nobody locked in this week.";
  if (pct >= 90) return "Huge week together.";
  if (pct >= 75) return "Solid week together.";
  if (pct >= 60) return "Good progress this week.";
  return "Some weeks are like that.";
}

export interface RecapMember {
  userId: string;
  displayName: string;
  you: boolean;
  /** Null: not locked in that week. */
  pct: number | null;
  done: number;
  total: number;
  finished: Goal[];
  open: Goal[];
}

export interface Recap {
  weekStart: DateString;
  pct: number | null;
  done: number;
  total: number;
  delta: number | null;
  /** Best closed week the squad has had. */
  isBest: boolean;
  /** The most recent closed week: the one that leads into planning. */
  isLatest: boolean;
  previous: DateString | null;
  next: DateString | null;
  members: RecapMember[];
}

/**
 * The recap for one closed week, or null if that week isn't closed or isn't
 * on the timeline. Members: you first, then by when they joined (never by
 * score). Someone who wasn't around that week is left out; someone who left
 * since still shows if they had goals.
 */
export function recapFor(
  timeline: readonly HistoryWeek[],
  weekStart: DateString,
  members: readonly Member[],
  meId: string,
): Recap | null {
  const closedWeeks = timeline.filter((week) => week.closed);
  const position = closedWeeks.findIndex((week) => week.weekStart === weekStart);
  if (position === -1) return null;
  const week = closedWeeks[position];
  const squad: Scope = { kind: "squad" };
  const point = weekSeries(timeline, squad).find((item) => item.weekStart === weekStart)!;
  const stats = closedStats(timeline, squad);

  const owners = new Set(week.goals.map((goal) => goal.ownerId));
  const shown = members
    .filter((member) => owners.has(member.userId) || activeDuring(member, week))
    .sort((a, b) => {
      if (a.userId === meId) return -1;
      if (b.userId === meId) return 1;
      return a.joinedAt.localeCompare(b.joinedAt);
    });

  return {
    weekStart,
    pct: point.pct,
    done: point.done,
    total: point.total,
    delta: point.delta,
    isBest: stats !== null && point.pct !== null && stats.best.weekStart === weekStart,
    isLatest: position === closedWeeks.length - 1,
    previous: position > 0 ? closedWeeks[position - 1].weekStart : null,
    next: position < closedWeeks.length - 1 ? closedWeeks[position + 1].weekStart : null,
    members: shown.map((member) => {
      const goals = week.goals.filter((goal) => goal.ownerId === member.userId);
      const progress = memberProgress(goals);
      return {
        userId: member.userId,
        displayName: member.displayName,
        you: member.userId === meId,
        pct: progress === null ? null : toPercent(progress),
        ...countCompleted(goals),
        finished: goals.filter(isGoalComplete),
        open: goals.filter((goal) => !isGoalComplete(goal)),
      };
    }),
  };
}

/** The most recent closed week, for links that should land on "the last recap". */
export function latestClosedWeek(timeline: readonly HistoryWeek[]): DateString | null {
  const closed = timeline.filter((week) => week.closed);
  return closed.length > 0 ? closed[closed.length - 1].weekStart : null;
}
