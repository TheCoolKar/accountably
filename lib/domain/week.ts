import type { DateString } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(date: DateString): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): DateString {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date it is at `instant` for someone in `timeZone`. */
export function localDateInZone(instant: Date, timeZone: string): DateString {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: DateString, days: number): DateString {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: DateString): number {
  const day = new Date(toUtcMs(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** The Monday of the week containing `date`. */
export function weekStartOf(date: DateString): DateString {
  return addDays(date, 1 - isoWeekday(date));
}

/** The Sunday that ends the week starting on `weekStart`. */
export function weekEndOf(weekStart: DateString): DateString {
  return addDays(weekStart, 6);
}

export function currentWeekStart(now: Date, timeZone: string): DateString {
  return weekStartOf(localDateInZone(now, timeZone));
}

export function upcomingWeekStart(now: Date, timeZone: string): DateString {
  return addDays(currentWeekStart(now, timeZone), 7);
}

/** A week closes the moment its Sunday ends in the squad's zone. */
export function isWeekClosed(
  weekStart: DateString,
  now: Date,
  timeZone: string,
): boolean {
  return localDateInZone(now, timeZone) > weekEndOf(weekStart);
}

/**
 * How far ahead goals can be set: this week plus this many more.
 * The database enforces the same number in ensure_week.
 */
export const PLANNING_WEEKS_AHEAD = 2;

/** Goals can be set for the current week and the next two. */
export function isWeekPlannable(
  weekStart: DateString,
  now: Date,
  timeZone: string,
): boolean {
  if (isoWeekday(weekStart) !== 1) return false;
  const current = currentWeekStart(now, timeZone);
  return weekStart >= current && weekStart <= addDays(current, 7 * PLANNING_WEEKS_AHEAD);
}

export function isSundayInZone(now: Date, timeZone: string): boolean {
  return isoWeekday(localDateInZone(now, timeZone)) === 7;
}

/** "Nov 9". */
export function formatShortDate(date: DateString, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(toUtcMs(date)));
}

/** "Nov". */
export function formatMonth(date: DateString, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
    new Date(toUtcMs(date)),
  );
}

/** "Nov 9 – 15" or "Nov 30 – Dec 6". */
export function formatWeekRange(weekStart: DateString, locale = "en-US"): string {
  const start = new Date(toUtcMs(weekStart));
  const end = new Date(toUtcMs(weekEndOf(weekStart)));
  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const startMonth = month.format(start);
  const endMonth = month.format(end);
  const endLabel =
    startMonth === endMonth
      ? `${end.getUTCDate()}`
      : `${endMonth} ${end.getUTCDate()}`;
  return `${startMonth} ${start.getUTCDate()} – ${endLabel}`;
}
