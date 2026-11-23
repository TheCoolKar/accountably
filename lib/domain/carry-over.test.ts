import { describe, expect, it } from "vitest";
import { carryOverCandidates } from "./carry-over";
import type { Goal } from "./types";

let next = 0;
const goal = (overrides: Partial<Goal>): Goal => ({
  id: `goal-${++next}`,
  squadId: "squad",
  ownerId: "sam",
  weekStart: "2026-11-09",
  title: "Gym",
  description: null,
  goalType: "one_time",
  targetCount: 1,
  completedCount: 0,
  unitLabel: null,
  lockedInAt: null,
  createdAt: "2026-11-09T00:00:00Z",
  updatedAt: "2026-11-09T00:00:00Z",
  ...overrides,
});

describe("carryOverCandidates", () => {
  it("offers unfinished goals and leaves finished ones behind", () => {
    const previous = [
      goal({ title: "Gym" }),
      goal({ title: "Call the bank", completedCount: 1 }),
    ];
    expect(carryOverCandidates(previous, [], new Set()).map((c) => c.input.title)).toEqual([
      "Gym",
    ]);
  });

  it("copies the goal exactly and starts the count again", () => {
    const source = goal({
      title: "Read for seminar",
      description: "chapters 3 and 4",
      goalType: "counted",
      targetCount: 3,
      completedCount: 2,
      unitLabel: "chapters",
    });
    expect(carryOverCandidates([source], [], new Set())).toEqual([
      {
        sourceId: source.id,
        input: {
          title: "Read for seminar",
          description: "chapters 3 and 4",
          goalType: "counted",
          targetCount: 3,
          unitLabel: "chapters",
        },
      },
    ]);
  });

  it("skips goals the owner dismissed", () => {
    const source = goal({});
    expect(carryOverCandidates([source], [], new Set([source.id]))).toEqual([]);
  });

  it("skips goals already in the week being planned, whatever the capitalisation", () => {
    const previous = [goal({ title: "Gym" }), goal({ title: "Meal prep" })];
    const current = [goal({ title: " gym ", weekStart: "2026-11-16" })];
    expect(carryOverCandidates(previous, current, new Set()).map((c) => c.input.title)).toEqual([
      "Meal prep",
    ]);
  });

  it("offers a repeated title once", () => {
    const previous = [goal({ title: "Gym" }), goal({ title: "gym" })];
    expect(carryOverCandidates(previous, [], new Set())).toHaveLength(1);
  });

  it("offers nothing when there was no week before", () => {
    expect(carryOverCandidates([], [], new Set())).toEqual([]);
  });
});
