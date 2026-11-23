import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  byTheNumbers,
  closedStats,
  formatDelta,
  formatPoints,
  goalsFinished,
  latestClosedWeek,
  lockInStreak,
  normaliseTitle,
  recapFor,
  recapHeadline,
  recurringGoals,
  trend,
  weekPercent,
  weekSeries,
  weeksLockedIn,
  type HistoryWeek,
  type StoredWeek,
} from "./history";
import type { Goal, Member } from "./types";
import { addDays } from "./week";

const TORONTO = "America/Toronto";
const LONDON = "Europe/London";
const A = "member-a";
const B = "member-b";
const C = "member-c";

let nextId = 0;
function goal(
  ownerId: string,
  title: string,
  completedCount: number,
  targetCount = 1,
  extra: Partial<Goal> = {},
): Goal {
  return {
    id: `goal-${++nextId}`,
    squadId: "squad",
    ownerId,
    weekStart: "",
    title,
    description: null,
    goalType: targetCount > 1 ? "counted" : "one_time",
    targetCount,
    completedCount,
    unitLabel: null,
    lockedInAt: null,
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

function member(userId: string, displayName: string, joinedAt = "2026-01-01T12:00:00Z", leftAt: string | null = null): Member {
  return { userId, displayName, role: "member", joinedAt, leftAt };
}

const members = [member(A, "Sam"), member(B, "Alex")];

/** Mondays from Sep 7, 2026. */
const monday = (n: number) => addDays("2026-09-07", 7 * n);
/** Wednesday noon in Toronto, inside week n. */
const during = (n: number) => new Date(`${addDays(monday(n), 2)}T16:00:00Z`);

function stored(n: number, goals: Goal[], timezone = TORONTO): StoredWeek {
  return { weekStart: monday(n), timezone, goals };
}

/** Closed weeks with exact squad percentages (one one-time goal per member keeps it simple). */
function weeksAt(percents: (number | null)[]): HistoryWeek[] {
  return percents.map((pct, index) => ({
    weekStart: monday(index),
    timezone: TORONTO,
    closed: true,
    live: false,
    // A single member with 100 goals, `pct` of them done, gives a known share.
    goals:
      pct === null
        ? []
        : Array.from({ length: 100 }, (_, i) => goal(A, `g${i}`, i < pct ? 1 : 0)),
  }));
}

describe("normaliseTitle", () => {
  it("ignores capitals and spacing", () => {
    expect(normaliseTitle("  Meal   Prep ")).toBe("meal prep");
    expect(normaliseTitle("GYM")).toBe(normaliseTitle("gym"));
  });
});

describe("buildTimeline", () => {
  it("runs from the first week with goals to this week, oldest first", () => {
    const timeline = buildTimeline(
      [stored(2, [goal(A, "Gym", 1)]), stored(0, [goal(A, "Gym", 0)])],
      during(3),
      TORONTO,
    );
    expect(timeline.map((week) => week.weekStart)).toEqual([monday(0), monday(1), monday(2), monday(3)]);
  });

  it("fills a skipped week in as empty, never dropping it", () => {
    const timeline = buildTimeline([stored(0, [goal(A, "Gym", 1)])], during(2), TORONTO);
    expect(timeline[1].goals).toEqual([]);
    expect(weekPercent(timeline[1], { kind: "squad" })).toBeNull();
  });

  it("leaves out weeks planned ahead", () => {
    const timeline = buildTimeline(
      [stored(0, [goal(A, "Gym", 1)]), stored(2, [goal(A, "Read for seminar", 0)])],
      during(0),
      TORONTO,
    );
    expect(timeline.map((week) => week.weekStart)).toEqual([monday(0)]);
  });

  it("is just this week, live, for a brand new squad", () => {
    const timeline = buildTimeline([], during(0), TORONTO);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ weekStart: monday(0), live: true, closed: false });
  });

  it("closes a week at the end of Sunday in the squad zone, not a moment before", () => {
    const weeks = [stored(0, [goal(A, "Gym", 1)])];
    // Sunday Sep 13, 23:59 in Toronto (EDT, UTC−4) is 03:59 UTC on Monday.
    const sundayNight = buildTimeline(weeks, new Date("2026-09-14T03:59:00Z"), TORONTO);
    expect(sundayNight.map((w) => [w.weekStart, w.live])).toEqual([[monday(0), true]]);
    // Monday 00:00 in Toronto.
    const mondayMorning = buildTimeline(weeks, new Date("2026-09-14T04:00:00Z"), TORONTO);
    expect(mondayMorning.map((w) => [w.weekStart, w.closed])).toEqual([
      [monday(0), true],
      [monday(1), false],
    ]);
  });

  it("gets the boundary right across a DST change", () => {
    // Clocks go back in London on Sunday Oct 25, 2026, so midnight is 00:00 UTC.
    const weeks = [{ weekStart: "2026-10-19", timezone: LONDON, goals: [goal(A, "Gym", 1)] }];
    const before = buildTimeline(weeks, new Date("2026-10-25T23:59:00Z"), LONDON);
    expect(before.at(-1)).toMatchObject({ weekStart: "2026-10-19", live: true });
    const after = buildTimeline(weeks, new Date("2026-10-26T00:00:00Z"), LONDON);
    expect(after.at(-1)).toMatchObject({ weekStart: "2026-10-26", live: true });
    expect(after[0].closed).toBe(true);

    // Toronto falls back on Sunday Nov 1: midnight Monday is 05:00 UTC (EST).
    const toronto = [{ weekStart: "2026-10-26", timezone: TORONTO, goals: [goal(A, "Gym", 1)] }];
    expect(buildTimeline(toronto, new Date("2026-11-02T04:59:00Z"), TORONTO).at(-1)?.live).toBe(true);
    expect(buildTimeline(toronto, new Date("2026-11-02T05:00:00Z"), TORONTO)[0].closed).toBe(true);
  });

  it("uses the zone each week was fixed in", () => {
    // Week fixed in Auckland is already over there while it is still Sunday in Toronto.
    const weeks = [{ weekStart: monday(0), timezone: "Pacific/Auckland", goals: [goal(A, "Gym", 1)] }];
    const timeline = buildTimeline(weeks, new Date("2026-09-13T23:00:00Z"), TORONTO);
    expect(timeline[0].closed).toBe(true);
  });
});

describe("weekSeries and percentages", () => {
  const week: HistoryWeek = {
    ...stored(0, [
      goal(A, "Gym", 3, 4),
      goal(A, "Call the bank", 1),
      goal(B, "Meal prep", 5, 3), // over target: clamped
      goal(B, "Read for seminar", 0),
    ]),
    closed: true,
    live: false,
  };

  it("matches the dashboard maths for mixed and over-target goals", () => {
    // A: (0.75 + 1) / 2 = 0.875 → boosted 0.984 → 98%. B: (1 + 0) / 2 → 0.75 → 75%.
    expect(weekPercent(week, { kind: "member", memberId: A })).toBe(98);
    expect(weekPercent(week, { kind: "member", memberId: B })).toBe(75);
    // Squad: mean of boosted members (0.984375 + 0.75) / 2 → 87%.
    expect(weekPercent(week, { kind: "squad" })).toBe(87);
  });

  it("leaves out a member who didn't lock in", () => {
    const onlyA: HistoryWeek = { ...week, goals: week.goals.filter((g) => g.ownerId === A) };
    expect(weekPercent(onlyA, { kind: "squad" })).toBe(98);
    expect(weekPercent(onlyA, { kind: "member", memberId: B })).toBeNull();
  });

  it("counts literally and works out deltas in the same scope", () => {
    const next: HistoryWeek = { ...stored(1, [goal(A, "Gym", 4, 4), goal(B, "Meal prep", 0, 3)]), closed: true, live: false };
    const empty: HistoryWeek = { ...stored(2, []), closed: true, live: false };
    const series = weekSeries([week, next, empty], { kind: "squad" });
    expect(series.map((p) => [p.done, p.total])).toEqual([[2, 4], [1, 2], [0, 0]]);
    expect(series[0].delta).toBeNull();
    expect(series[1].delta).toBe(series[1].pct! - series[0].pct!);
    expect(series[2]).toMatchObject({ pct: null, delta: null });
  });
});

describe("goalsFinished and weeksLockedIn", () => {
  it("counts every week, this week included", () => {
    const timeline = buildTimeline(
      [stored(0, [goal(A, "Gym", 1), goal(B, "Gym", 1)]), stored(1, [goal(A, "Gym", 1), goal(A, "Call the bank", 0)])],
      during(1),
      TORONTO,
    );
    expect(goalsFinished(timeline, { kind: "squad" })).toBe(3);
    expect(goalsFinished(timeline, { kind: "member", memberId: B })).toBe(1);
    expect(weeksLockedIn(timeline, { kind: "member", memberId: B })).toBe(1);
  });
});

describe("closedStats", () => {
  it("is null with no closed weeks", () => {
    expect(closedStats(buildTimeline([], during(0), TORONTO), { kind: "squad" })).toBeNull();
  });

  it("skips weeks nobody locked in instead of counting them as 0%", () => {
    const stats = closedStats(weeksAt([40, null, 80]), { kind: "squad" });
    // Boosted: 40% plain → 64%, 80% plain → 96%.
    expect(stats).toEqual({ avg: 80, best: { pct: 96, weekStart: monday(2) }, count: 2 });
  });

  it("ignores the live week", () => {
    const timeline = weeksAt([50]);
    timeline.push({ ...stored(1, [goal(A, "Gym", 1)]), closed: false, live: true });
    expect(closedStats(timeline, { kind: "squad" })?.best.pct).toBe(75);
  });
});

describe("trend", () => {
  // Plain shares chosen so boosted values are easy: 0 → 0%, 100 → 100%.
  it("is null below 4 closed weeks", () => {
    expect(trend(weeksAt([]), { kind: "squad" })).toBeNull();
    expect(trend(weeksAt([0, 100, 100]), { kind: "squad" })).toBeNull();
  });

  it("compares halves with 4 weeks (k = 2)", () => {
    expect(trend(weeksAt([0, 0, 100, 100]), { kind: "squad" })?.points).toBe(100);
  });

  it("uses k = 3 with 7 weeks", () => {
    // First 3: 0, 0, 100 → 33.3. Last 3: 100, 100, 100 → 100.
    expect(trend(weeksAt([0, 0, 100, 0, 100, 100, 100]), { kind: "squad" })?.points).toBe(67);
  });

  it("caps k at 4 with 12 weeks and can go down", () => {
    const result = trend(weeksAt([100, 100, 100, 100, 0, 0, 0, 0, 0, 0, 0, 0]), { kind: "squad" });
    expect(result).toEqual({ points: -100, from: monday(0), to: monday(11) });
  });

  it("doesn't count weeks nobody locked in", () => {
    expect(trend(weeksAt([0, null, 0, 100, 100]), { kind: "squad" })?.points).toBe(100);
  });
});

describe("recurringGoals", () => {
  const timeline = buildTimeline(
    [
      stored(0, [goal(A, "Gym", 4, 4), goal(B, "gym", 1, 3)]),
      stored(1, [goal(A, " GYM ", 4, 4), goal(B, "Gym", 3, 3)]),
      stored(2, [goal(A, "gym", 2, 4), goal(A, "Meal prep", 1)]),
      stored(3, [goal(A, "Gym", 4, 4), goal(A, "meal  prep", 1), goal(B, "GYM", 0, 3)]),
      stored(4, [goal(A, "Gym", 1, 4), goal(A, "Meal Prep", 1), goal(B, "Gym", 3, 3)]),
      stored(5, [goal(A, "Meal prep", 0)]),
    ],
    during(5),
    TORONTO,
  );

  it("groups by owner and title, ignoring capitals and spaces", () => {
    const rows = recurringGoals(timeline, { kind: "squad" });
    expect(rows.map((r) => [r.ownerId, r.title])).toEqual([
      [A, "Meal prep"], // 3 of 3 closed weeks; wording from the latest week
      [A, "Gym"], // 3 of 5
      [B, "Gym"], // 2 of 4
    ]);
  });

  it("only counts closed weeks towards the follow-through figure", () => {
    const meal = recurringGoals(timeline, { kind: "squad" })[0];
    expect([meal.weeksDone, meal.weeksSet]).toEqual([3, 3]);
    expect(meal.cells.map((c) => c.state)).toEqual(["unset", "unset", "done", "done", "done", "none"]);
    expect(meal.cells.at(-1)?.live).toBe(true);
  });

  it("marks partly done cells with their progress", () => {
    const gym = recurringGoals(timeline, { kind: "member", memberId: A }).find((r) => r.title === "Gym")!;
    expect(gym.cells[2]).toMatchObject({ state: "partly", progress: 0.5, done: 2, target: 4 });
  });

  it("needs 4 weeks to show up", () => {
    const short = buildTimeline([stored(0, [goal(A, "Gym", 1)]), stored(1, [goal(A, "Gym", 1)])], during(2), TORONTO);
    expect(recurringGoals(short, { kind: "squad" })).toEqual([]);
  });
});

describe("lockInStreak", () => {
  it("counts back while everyone active had goals", () => {
    const timeline = buildTimeline(
      [
        stored(0, [goal(A, "Gym", 1)]),
        stored(1, [goal(A, "Gym", 1), goal(B, "Gym", 0)]),
        stored(2, [goal(A, "Gym", 1), goal(B, "Gym", 0)]),
      ],
      during(3),
      TORONTO,
    );
    // Week 3 (live) has no goals yet: it doesn't break the streak.
    expect(lockInStreak(timeline, members)).toBe(2);
    expect(lockInStreak(timeline, members, { kind: "member", memberId: A })).toBe(3);
  });

  it("only expects people who were in the squad that week", () => {
    const late = [member(A, "Sam"), member(C, "Jo", `${monday(1)}T15:00:00Z`)];
    const timeline = buildTimeline(
      [stored(0, [goal(A, "Gym", 1)]), stored(1, [goal(A, "Gym", 1), goal(C, "Gym", 1)])],
      during(2),
      TORONTO,
    );
    expect(lockInStreak(timeline, late)).toBe(2);
  });
});

describe("byTheNumbers", () => {
  it("totals counted goals only, biggest first, then fills and ends with the streak", () => {
    const timeline = buildTimeline(
      [
        stored(0, [goal(A, "Gym", 3, 4, { unitLabel: "sessions" }), goal(A, "Call the bank", 1), goal(B, "Read for seminar", 2, 3, { unitLabel: "chapters" })]),
        stored(1, [goal(A, "gym", 4, 4, { unitLabel: "sessions" }), goal(B, "Read for seminar", 1, 3, { unitLabel: "chapters" })]),
      ],
      during(1),
      TORONTO,
    );
    const tiles = byTheNumbers(timeline, members, { kind: "squad" });
    expect(tiles).toEqual([
      { kind: "counted", value: 7, unit: "sessions", title: "gym", ownerId: A },
      { kind: "counted", value: 3, unit: "chapters", title: "Read for seminar", ownerId: B },
      { kind: "goals_finished", value: 2 },
      { kind: "streak", value: 2 },
    ]);
  });

  it("never turns one-time goals into quantities", () => {
    const timeline = buildTimeline([stored(0, [goal(A, "Call the bank", 1), goal(A, "Sort out my resume", 1)])], during(0), TORONTO);
    const tiles = byTheNumbers(timeline, members, { kind: "member", memberId: A });
    expect(tiles.map((t) => t.kind)).toEqual(["goals_finished", "weeks_locked_in", "goals_set", "streak"]);
    expect(tiles.map((t) => t.value)).toEqual([2, 1, 2, 1]);
  });

  it("says 'times' when a counted goal has no unit", () => {
    const timeline = buildTimeline([stored(0, [goal(A, "Gym", 2, 3)])], during(0), TORONTO);
    expect(byTheNumbers(timeline, members, { kind: "squad" })[0]).toMatchObject({ unit: "times", value: 2 });
  });
});

describe("recapFor", () => {
  const timeline = buildTimeline(
    [
      stored(0, [goal(A, "Gym", 4, 4), goal(B, "Meal prep", 1)]),
      stored(1, [goal(B, "Gym", 1, 3), goal(B, "Call the bank", 0), goal(A, "Read for seminar", 1)]),
    ],
    during(2),
    TORONTO,
  );

  it("is null for the live week or a week off the timeline", () => {
    expect(recapFor(timeline, monday(2), members, B)).toBeNull();
    expect(recapFor(timeline, "2020-01-06", members, B)).toBeNull();
  });

  it("puts you first and splits finished from open goals", () => {
    const recap = recapFor(timeline, monday(1), members, B)!;
    expect(recap.members.map((m) => [m.displayName, m.you])).toEqual([["Alex", true], ["Sam", false]]);
    expect(recap.members[0].finished).toEqual([]);
    expect(recap.members[0].open.map((g) => g.title)).toEqual(["Gym", "Call the bank"]);
    expect(recap.members[1].finished.map((g) => g.title)).toEqual(["Read for seminar"]);
    expect([recap.done, recap.total]).toEqual([1, 3]);
  });

  it("walks closed weeks and knows the latest and the best", () => {
    const first = recapFor(timeline, monday(0), members, A)!;
    expect(first).toMatchObject({ previous: null, next: monday(1), isLatest: false, isBest: true, pct: 100, delta: null });
    const second = recapFor(timeline, monday(1), members, A)!;
    expect(second).toMatchObject({ previous: monday(0), next: null, isLatest: true, isBest: false });
    expect(latestClosedWeek(timeline)).toBe(monday(1));
  });

  it("shows a member who didn't lock in as null, outside the squad figure", () => {
    const solo = buildTimeline([stored(0, [goal(A, "Gym", 1)])], during(1), TORONTO);
    const recap = recapFor(solo, monday(0), members, A)!;
    expect(recap.pct).toBe(100);
    expect(recap.members.find((m) => m.userId === B)).toMatchObject({ pct: null, total: 0 });
  });

  it("keeps someone who left if they had goals, and drops people not yet in the squad", () => {
    const roster = [
      member(A, "Sam"),
      member(B, "Alex", "2026-01-01T12:00:00Z", `${monday(3)}T12:00:00Z`),
      member(C, "Jo", `${monday(4)}T12:00:00Z`),
    ];
    const recap = recapFor(timeline, monday(0), roster, A)!;
    expect(recap.members.map((m) => m.displayName)).toEqual(["Sam", "Alex"]);
  });
});

describe("wording", () => {
  it("formats points with a real minus sign", () => {
    expect(formatPoints(5)).toBe("+5 pts");
    expect(formatPoints(-3)).toBe("−3 pts");
    expect(formatDelta(0)).toBe("Same as the week before");
    expect(formatDelta(null)).toBeNull();
  });

  it("picks a supportive headline", () => {
    expect(recapHeadline(95)).toBe("Huge week together.");
    expect(recapHeadline(75)).toBe("Solid week together.");
    expect(recapHeadline(60)).toBe("Good progress this week.");
    expect(recapHeadline(20)).toBe("Some weeks are like that.");
    expect(recapHeadline(null)).toBe("Nobody locked in this week.");
  });
});
