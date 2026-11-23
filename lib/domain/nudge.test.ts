import { describe, expect, it } from "vitest";
import {
  NUDGE_LIMIT,
  nudgeAvailableAt,
  nudgedGoalIds,
  nudgesLeft,
  recentNudgers,
} from "./nudge";
import type { Nudge } from "./types";

const nudge = (overrides: Partial<Nudge>): Nudge => ({
  id: Math.random().toString(36),
  goalId: "goal-1",
  senderId: "sam",
  recipientId: "priya",
  createdAt: "2026-11-10T12:00:00Z",
  ...overrides,
});

const at = (iso: string) => new Date(iso);

describe("nudge allowance", () => {
  it("starts with the full allowance", () => {
    expect(nudgesLeft([], "sam", "priya", at("2026-11-10T12:00:00Z"))).toBe(NUDGE_LIMIT);
    expect(nudgeAvailableAt([], "sam", "priya", at("2026-11-10T12:00:00Z"))).toBeNull();
  });

  it("allows three nudges to the same person before the wait starts", () => {
    const now = at("2026-11-10T13:00:00Z");
    const one = [nudge({ goalId: "a" })];
    const two = [...one, nudge({ goalId: "b", createdAt: "2026-11-10T12:10:00Z" })];
    const three = [...two, nudge({ goalId: "c", createdAt: "2026-11-10T12:20:00Z" })];
    expect(nudgesLeft(one, "sam", "priya", now)).toBe(2);
    expect(nudgeAvailableAt(two, "sam", "priya", now)).toBeNull();
    expect(nudgesLeft(three, "sam", "priya", now)).toBe(0);
  });

  it("opens up again a day after the oldest of the three", () => {
    const three = [
      nudge({ goalId: "a", createdAt: "2026-11-10T12:00:00Z" }),
      nudge({ goalId: "b", createdAt: "2026-11-10T15:00:00Z" }),
      nudge({ goalId: "c", createdAt: "2026-11-10T18:00:00Z" }),
    ];
    expect(nudgeAvailableAt(three, "sam", "priya", at("2026-11-11T11:59:00Z"))).toEqual(
      at("2026-11-11T12:00:00Z"),
    );
    // The oldest has aged out: one slot is free again.
    expect(nudgeAvailableAt(three, "sam", "priya", at("2026-11-11T12:00:00Z"))).toBeNull();
    expect(nudgesLeft(three, "sam", "priya", at("2026-11-11T12:00:00Z"))).toBe(1);
  });

  it("is per pair and per direction", () => {
    const three = ["a", "b", "c"].map((goalId) => nudge({ goalId }));
    const now = at("2026-11-10T13:00:00Z");
    expect(nudgesLeft(three, "sam", "alex", now)).toBe(NUDGE_LIMIT);
    expect(nudgesLeft(three, "priya", "sam", now)).toBe(NUDGE_LIMIT);
  });
});

describe("nudgedGoalIds", () => {
  it("lists the goals nudged within the day, so each is nudged once", () => {
    const nudges = [
      nudge({ goalId: "a" }),
      nudge({ goalId: "b", createdAt: "2026-11-09T11:00:00Z" }),
    ];
    expect([...nudgedGoalIds(nudges, "sam", "priya", at("2026-11-10T13:00:00Z"))]).toEqual(["a"]);
  });
});

describe("recentNudgers", () => {
  const now = at("2026-11-10T18:00:00Z");

  it("lists each person once, most recent first", () => {
    const nudges = [
      nudge({ senderId: "sam", createdAt: "2026-11-10T09:00:00Z" }),
      nudge({ senderId: "alex", createdAt: "2026-11-10T15:00:00Z" }),
    ];
    expect(recentNudgers(nudges, "goal-1", "priya", now)).toEqual(["alex", "sam"]);
  });

  it("ignores other goals and nudges older than a day", () => {
    const nudges = [
      nudge({ goalId: "goal-2" }),
      nudge({ senderId: "alex", createdAt: "2026-11-09T17:00:00Z" }),
    ];
    expect(recentNudgers(nudges, "goal-1", "priya", now)).toEqual([]);
  });
});
