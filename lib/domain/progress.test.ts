import { describe, expect, it } from "vitest";
import {
  countCompleted,
  goalProgress,
  isGoalComplete,
  boostProgress,
  memberProgress,
  squadProgress,
  toPercent,
} from "./progress";

const goal = (completedCount: number, targetCount: number) => ({
  completedCount,
  targetCount,
});

describe("goalProgress", () => {
  it("is 0 or 1 for one-time goals", () => {
    expect(goalProgress(goal(0, 1))).toBe(0);
    expect(goalProgress(goal(1, 1))).toBe(1);
  });

  it("is partial for counted goals", () => {
    expect(goalProgress(goal(2, 3))).toBeCloseTo(2 / 3);
  });

  it("clamps bad data to 0–1", () => {
    expect(goalProgress(goal(5, 3))).toBe(1);
    expect(goalProgress(goal(-1, 3))).toBe(0);
    expect(goalProgress(goal(1, 0))).toBe(0);
  });

  it("is complete only when the count reaches the target", () => {
    expect(isGoalComplete(goal(2, 3))).toBe(false);
    expect(isGoalComplete(goal(3, 3))).toBe(true);
  });
});

describe("memberProgress", () => {
  it("is null with no goals: not locked in", () => {
    expect(memberProgress([])).toBeNull();
  });

  it("weights each goal equally, whatever its target", () => {
    // One-time done (100%) and gym 1 of 4 (25%) → 62.5%.
    // Plain share 62.5%, boosted: 1 - (1 - 0.625)² ≈ 85.9%.
    expect(memberProgress([goal(1, 1), goal(1, 4)])).toBeCloseTo(0.859375);
  });

  it("is exactly 100% only when everything is finished", () => {
    expect(memberProgress([goal(1, 1), goal(3, 3)])).toBe(1);
    expect(memberProgress([goal(1, 1), goal(2, 3)])).toBeLessThan(1);
  });

  it("is 0, not null, when goals exist but nothing is done", () => {
    expect(memberProgress([goal(0, 1), goal(0, 3)])).toBe(0);
  });
});

describe("boostProgress", () => {
  const done = (n: number, of: number) =>
    toPercent(memberProgress([...Array(n).fill(goal(1, 1)), ...Array(of - n).fill(goal(0, 1))])!);

  it("makes the first goals count for more", () => {
    expect([1, 2, 3, 4].map((n) => done(n, 4))).toEqual([44, 75, 94, 100]);
    expect([1, 2, 3].map((n) => done(n, 3))).toEqual([56, 89, 100]);
    expect([1, 2, 3, 4, 5].map((n) => done(n, 5))).toEqual([36, 64, 84, 96, 100]);
  });

  it("keeps the ends honest", () => {
    expect(boostProgress(0)).toBe(0);
    expect(boostProgress(1)).toBe(1);
  });

  it("never goes down when more is done, and never falls below the plain share", () => {
    let previous = 0;
    for (let share = 0; share <= 1.0001; share += 0.05) {
      const boosted = boostProgress(share);
      expect(boosted).toBeGreaterThanOrEqual(previous);
      expect(boosted).toBeGreaterThanOrEqual(Math.min(1, share) - 1e-9);
      previous = boosted;
    }
  });
});

describe("squadProgress", () => {
  it("is null when nobody has goals", () => {
    expect(squadProgress([])).toBeNull();
    expect(squadProgress([null, null])).toBeNull();
  });

  it("weights each member equally, not each goal", () => {
    expect(squadProgress([1, 0.5])).toBeCloseTo(0.75);
  });

  it("leaves out members who are not locked in", () => {
    expect(squadProgress([0.5, null])).toBeCloseTo(0.5);
    expect(squadProgress([1, null, null])).toBe(1);
  });

  it("counts a locked-in member at 0", () => {
    expect(squadProgress([1, 0])).toBeCloseTo(0.5);
  });
});

describe("a real week (Nov 16–22, 2026)", () => {
  // The dashboard showed 68% / 91% / 79% for this week. That is the boosted
  // curve working as decided on 2026-11-16 (the plain means are 43% / 70% /
  // 57%). History and the recap use the same functions, so they must agree.
  const first = [
    goal(3, 4), goal(4, 6), goal(1, 6), goal(1, 1), goal(2, 2),
    goal(0, 2), goal(0, 1), goal(6, 20), goal(0, 1),
  ];
  const second = [
    goal(1, 1), goal(3, 5), goal(0, 3), goal(0, 1),
    goal(1, 1), goal(1, 1), goal(1, 1), goal(2, 2),
  ];

  it("gives the boosted figures the dashboard shows", () => {
    const a = memberProgress(first)!;
    const b = memberProgress(second)!;
    expect(toPercent(a)).toBe(68);
    expect(toPercent(b)).toBe(91);
    expect(toPercent(squadProgress([a, b])!)).toBe(79);
  });

  it("keeps the counts literal", () => {
    expect(countCompleted(first)).toEqual({ done: 2, total: 9 });
    expect(countCompleted(second)).toEqual({ done: 5, total: 8 });
  });
});

describe("toPercent", () => {
  it("rounds to a whole number", () => {
    expect(toPercent(2 / 3)).toBe(67);
    expect(toPercent(0.5)).toBe(50);
  });

  it("never shows 100 while something is unfinished", () => {
    expect(toPercent(0.996)).toBe(99);
    expect(toPercent(1)).toBe(100);
  });

  it("never shows 0 once there is progress", () => {
    expect(toPercent(0.004)).toBe(1);
    expect(toPercent(0)).toBe(0);
  });
});

describe("countCompleted", () => {
  it("counts finished goals out of all goals", () => {
    expect(countCompleted([goal(1, 1), goal(2, 3), goal(0, 1), goal(4, 4)])).toEqual({
      done: 2,
      total: 4,
    });
  });
});
