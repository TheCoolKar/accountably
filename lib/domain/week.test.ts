import { describe, expect, it } from "vitest";
import {
  addDays,
  currentWeekStart,
  formatWeekRange,
  isSundayInZone,
  isValidTimeZone,
  isWeekClosed,
  isWeekPlannable,
  isoWeekday,
  localDateInZone,
  upcomingWeekStart,
  weekEndOf,
  weekStartOf,
} from "./week";

const TORONTO = "America/Toronto";
const AUCKLAND = "Pacific/Auckland";
const LONDON = "Europe/London";

describe("weekStartOf", () => {
  it("returns the same day for a Monday", () => {
    expect(weekStartOf("2026-11-09")).toBe("2026-11-09");
  });

  it("returns the previous Monday for a Sunday", () => {
    expect(weekStartOf("2026-11-15")).toBe("2026-11-09");
  });

  it("crosses month and year boundaries", () => {
    expect(weekStartOf("2026-12-03")).toBe("2026-11-30");
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
  });

  it("ends the week on the Sunday", () => {
    expect(weekEndOf("2026-11-09")).toBe("2026-11-15");
    expect(isoWeekday(weekEndOf("2026-11-09"))).toBe(7);
  });
});

describe("localDateInZone", () => {
  it("gives different dates for members in different zones at the same instant", () => {
    // Monday 03:30 UTC: still Sunday evening in Toronto, Monday afternoon in Auckland.
    const instant = new Date("2026-11-16T03:30:00Z");
    expect(localDateInZone(instant, TORONTO)).toBe("2026-11-15");
    expect(localDateInZone(instant, AUCKLAND)).toBe("2026-11-16");
  });
});

describe("currentWeekStart", () => {
  it("uses the squad zone, not UTC", () => {
    const instant = new Date("2026-11-16T03:30:00Z");
    expect(currentWeekStart(instant, TORONTO)).toBe("2026-11-09");
    expect(currentWeekStart(instant, AUCKLAND)).toBe("2026-11-16");
  });

  it("gives the following Monday for the upcoming week", () => {
    const instant = new Date("2026-11-12T15:00:00Z");
    expect(upcomingWeekStart(instant, TORONTO)).toBe("2026-11-16");
  });
});

describe("isWeekClosed", () => {
  const week = "2026-11-09";

  it("stays open until the last moment of Sunday in squad time", () => {
    // 23:59 Sunday in Toronto (UTC-5) is 04:59 UTC Monday.
    expect(isWeekClosed(week, new Date("2026-11-16T04:59:00Z"), TORONTO)).toBe(false);
  });

  it("closes at midnight Monday in squad time", () => {
    expect(isWeekClosed(week, new Date("2026-11-16T05:00:00Z"), TORONTO)).toBe(true);
  });

  it("is not closed during or before the week", () => {
    expect(isWeekClosed(week, new Date("2026-11-11T12:00:00Z"), TORONTO)).toBe(false);
    expect(isWeekClosed(week, new Date("2026-11-01T12:00:00Z"), TORONTO)).toBe(false);
  });

  it("closes at the right instant in the week clocks go back (25-hour Sunday)", () => {
    // Toronto leaves daylight time on Sunday 2026-11-01. Monday starts at 05:00 UTC.
    const dstWeek = "2026-10-26";
    expect(isWeekClosed(dstWeek, new Date("2026-11-02T04:59:00Z"), TORONTO)).toBe(false);
    expect(isWeekClosed(dstWeek, new Date("2026-11-02T05:00:00Z"), TORONTO)).toBe(true);
  });

  it("closes at the right instant in the week clocks go forward (23-hour Sunday)", () => {
    // Toronto enters daylight time on Sunday 2026-03-08. Monday starts at 04:00 UTC.
    const dstWeek = "2026-03-02";
    expect(isWeekClosed(dstWeek, new Date("2026-03-09T03:59:00Z"), TORONTO)).toBe(false);
    expect(isWeekClosed(dstWeek, new Date("2026-03-09T04:00:00Z"), TORONTO)).toBe(true);
  });

  it("handles a zone that changes clocks on a different date", () => {
    // London leaves summer time on Sunday 2026-10-25. Monday starts at 00:00 UTC.
    const dstWeek = "2026-10-19";
    expect(isWeekClosed(dstWeek, new Date("2026-10-25T23:59:00Z"), LONDON)).toBe(false);
    expect(isWeekClosed(dstWeek, new Date("2026-10-26T00:00:00Z"), LONDON)).toBe(true);
  });

  it("is the same answer for every member, wherever their device is", () => {
    // The device zone never enters the calculation: only the instant and the squad zone do.
    const instant = new Date("2026-11-16T03:30:00Z");
    expect(isWeekClosed(week, instant, TORONTO)).toBe(false);
    expect(isWeekClosed(week, instant, AUCKLAND)).toBe(true);
  });
});

describe("isWeekPlannable", () => {
  const now = new Date("2026-11-12T15:00:00Z");

  it("allows this week, next week and the week after", () => {
    expect(isWeekPlannable("2026-11-09", now, TORONTO)).toBe(true);
    expect(isWeekPlannable("2026-11-16", now, TORONTO)).toBe(true);
    expect(isWeekPlannable("2026-11-23", now, TORONTO)).toBe(true);
  });

  it("rejects past weeks, far-future weeks and non-Mondays", () => {
    expect(isWeekPlannable("2026-11-02", now, TORONTO)).toBe(false);
    expect(isWeekPlannable("2026-11-30", now, TORONTO)).toBe(false);
    expect(isWeekPlannable("2026-11-10", now, TORONTO)).toBe(false);
  });
});

describe("helpers", () => {
  it("knows when it is Sunday in the squad zone", () => {
    expect(isSundayInZone(new Date("2026-11-16T03:30:00Z"), TORONTO)).toBe(true);
    expect(isSundayInZone(new Date("2026-11-16T03:30:00Z"), AUCKLAND)).toBe(false);
  });

  it("adds days across a clock change without drifting", () => {
    expect(addDays("2026-10-26", 7)).toBe("2026-11-02");
    expect(addDays("2026-03-02", 7)).toBe("2026-03-09");
    expect(addDays("2026-11-09", -7)).toBe("2026-11-02");
  });

  it("formats a week range", () => {
    expect(formatWeekRange("2026-11-09")).toBe("Nov 9 – 15");
    expect(formatWeekRange("2026-11-30")).toBe("Nov 30 – Dec 6");
  });

  it("validates IANA zones", () => {
    expect(isValidTimeZone(TORONTO)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
