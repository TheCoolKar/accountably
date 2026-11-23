import { describe, expect, it } from "vitest";
import { isLinkedGoal } from "./goal-sync";
import type { Goal } from "./types";

let next = 0;
const goal = (overrides: Partial<Goal>): Goal => ({
  id: `goal-${++next}`,
  squadId: "squad-a",
  ownerId: "me",
  weekStart: "2026-11-23",
  title: "Gym",
  description: null,
  goalType: "counted",
  targetCount: 3,
  completedCount: 0,
  unitLabel: "sessions",
  lockedInAt: null,
  createdAt: "2026-11-23T00:00:00Z",
  updatedAt: "2026-11-23T00:00:00Z",
  ...overrides,
});

describe("isLinkedGoal", () => {
  const source = goal({});

  it("links my same goal for the same week in another squad, whatever the capitalisation", () => {
    expect(isLinkedGoal(source, goal({ squadId: "squad-b", title: "  gym " }))).toBe(true);
  });

  it("ignores the count, unit and notes", () => {
    expect(
      isLinkedGoal(source, goal({ squadId: "squad-b", completedCount: 2, unitLabel: null, description: "legs" })),
    ).toBe(true);
  });

  it("never links within the same squad, or to itself", () => {
    expect(isLinkedGoal(source, goal({}))).toBe(false);
    expect(isLinkedGoal(source, source)).toBe(false);
  });

  it("never links someone else's goal", () => {
    expect(isLinkedGoal(source, goal({ squadId: "squad-b", ownerId: "squadmate" }))).toBe(false);
  });

  it("needs the same week, title, type and target", () => {
    const other = { squadId: "squad-b" };
    expect(isLinkedGoal(source, goal({ ...other, weekStart: "2026-11-30" }))).toBe(false);
    expect(isLinkedGoal(source, goal({ ...other, title: "Gym twice" }))).toBe(false);
    expect(isLinkedGoal(source, goal({ ...other, targetCount: 4 }))).toBe(false);
    expect(isLinkedGoal(source, goal({ ...other, goalType: "one_time", targetCount: 1 }))).toBe(false);
  });
});
