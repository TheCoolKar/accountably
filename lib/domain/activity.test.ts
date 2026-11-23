import { describe, expect, it } from "vitest";
import { isProgressWin } from "./activity";

describe("isProgressWin", () => {
  it("celebrates a finished goal", () => {
    expect(isProgressWin({ type: "goal_completed", metadata: {} })).toBe(true);
  });

  it("celebrates a count moving forward", () => {
    expect(
      isProgressWin({
        type: "progress_updated",
        metadata: { previous_count: 1, completed_count: 2, target_count: 3 },
      }),
    ).toBe(true);
  });

  it("does not celebrate a count taken back down", () => {
    expect(
      isProgressWin({
        type: "progress_updated",
        metadata: { previous_count: 2, completed_count: 1, target_count: 3 },
      }),
    ).toBe(false);
  });

  it("treats older progress events without a previous count as forward", () => {
    expect(
      isProgressWin({ type: "progress_updated", metadata: { completed_count: 1 } }),
    ).toBe(true);
  });

  it.each(["goal_created", "goal_edited", "goal_deleted", "goal_reopened", "locked_in"] as const)(
    "does not celebrate %s",
    (type) => {
      expect(isProgressWin({ type, metadata: {} })).toBe(false);
    },
  );
});
