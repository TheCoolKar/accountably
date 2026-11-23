import { describe, expect, it } from "vitest";
import {
  activityForGoalChange,
  clampCount,
  validateGoalDraft,
  type GoalDraft,
} from "./goal";
import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  canJoinSquad,
  formatInviteCode,
  generateInviteCode,
  isInviteCodeShape,
  isWaitingForFriends,
  normaliseInviteCode,
} from "./squad";

const draft = (overrides: Partial<GoalDraft> = {}): GoalDraft => ({
  title: "Gym",
  description: "",
  goalType: "one_time",
  targetCount: "",
  unitLabel: "",
  ...overrides,
});

describe("validateGoalDraft", () => {
  it("keeps a vague title exactly as written", () => {
    const result = validateGoalDraft(draft({ title: "  Sort out my resume " }));
    expect(result).toEqual({
      ok: true,
      value: {
        title: "Sort out my resume",
        description: null,
        goalType: "one_time",
        targetCount: 1,
        unitLabel: null,
      },
    });
  });

  it("requires a title", () => {
    const result = validateGoalDraft(draft({ title: "   " }));
    expect(result.ok).toBe(false);
  });

  it("forces one-time goals to a target of 1 and drops the unit", () => {
    const result = validateGoalDraft(draft({ targetCount: "7", unitLabel: "sessions" }));
    expect(result.ok && result.value.targetCount).toBe(1);
    expect(result.ok && result.value.unitLabel).toBeNull();
  });

  it("accepts a counted goal with a whole-number target", () => {
    const result = validateGoalDraft(
      draft({ goalType: "counted", targetCount: "3", unitLabel: "sessions" }),
    );
    expect(result.ok && result.value).toMatchObject({
      goalType: "counted",
      targetCount: 3,
      unitLabel: "sessions",
    });
  });

  it.each(["", "0", "-2", "2.5", "abc"])(
    "rejects %j as a counted target instead of guessing one",
    (targetCount) => {
      const result = validateGoalDraft(draft({ goalType: "counted", targetCount }));
      expect(result.ok).toBe(false);
    },
  );
});

describe("clampCount", () => {
  it("keeps counts inside 0..target", () => {
    expect(clampCount(-1, 3)).toBe(0);
    expect(clampCount(2, 3)).toBe(2);
    expect(clampCount(4, 3)).toBe(3);
  });
});

describe("activityForGoalChange", () => {
  const base = {
    title: "Gym",
    description: null,
    goalType: "counted" as const,
    targetCount: 3,
    completedCount: 1,
    unitLabel: null,
  };

  it("reports nothing when nothing changed", () => {
    expect(activityForGoalChange(base, { ...base })).toBeNull();
  });

  it("reports progress, completion and reopening", () => {
    expect(activityForGoalChange(base, { ...base, completedCount: 2 })).toBe(
      "progress_updated",
    );
    expect(activityForGoalChange(base, { ...base, completedCount: 3 })).toBe(
      "goal_completed",
    );
    expect(
      activityForGoalChange({ ...base, completedCount: 3 }, { ...base, completedCount: 2 }),
    ).toBe("goal_reopened");
  });

  it("reports an edit when the commitment itself changes", () => {
    expect(activityForGoalChange(base, { ...base, title: "Gym x3" })).toBe("goal_edited");
    expect(activityForGoalChange(base, { ...base, targetCount: 2 })).toBe("goal_edited");
  });
});

describe("squad rules", () => {
  it("caps a squad at five", () => {
    expect(canJoinSquad(4)).toBe(true);
    expect(canJoinSquad(5)).toBe(false);
  });

  it("treats a squad of one as waiting for friends", () => {
    expect(isWaitingForFriends(1)).toBe(true);
    expect(isWaitingForFriends(2)).toBe(false);
  });
});

describe("invite codes", () => {
  it("uses 32 distinct characters so every byte maps evenly", () => {
    expect(new Set(INVITE_ALPHABET).size).toBe(32);
  });

  it("generates codes of the right shape", () => {
    const code = generateInviteCode((length) =>
      Uint8Array.from({ length }, (_, i) => i * 37),
    );
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    expect(isInviteCodeShape(code)).toBe(true);
  });

  it("normalises what people type", () => {
    expect(normaliseInviteCode(" abcde-fgh23 ")).toBe("ABCDEFGH23");
    expect(formatInviteCode("ABCDEFGH23")).toBe("ABCDE-FGH23");
  });

  it("rejects codes of the wrong shape before asking the server", () => {
    expect(isInviteCodeShape("ABC")).toBe(false);
    expect(isInviteCodeShape("ABCDEFGH10")).toBe(false);
  });
});
