"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, ChevronRightIcon, LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSquadHistory } from "@/hooks/use-squad-history";
import {
  buildTimeline,
  byTheNumbers,
  closedStats,
  formatDelta,
  formatPoints,
  goalsFinished,
  lockInStreak,
  recurringGoals,
  trend,
  weekSeries,
  weeksLockedIn,
  type HistoryWeek,
  type NumberTile,
  type RecurringCell,
  type RecurringGoal,
  type Scope,
  type WeekPoint,
} from "@/lib/domain/history";
import type { DateString, Member } from "@/lib/domain/types";
import { formatMonth, formatShortDate, formatWeekRange } from "@/lib/domain/week";
import { cn } from "@/lib/utils";
import { Card, MiniRing, PageError, PageSkeleton, ReconnectingPill, Segmented } from "./bits";

type View = "squad" | "me";

/** Bar height for 100%, in px. */
const CHART_HEIGHT = 116;
/** Past this many weeks the chart scrolls sideways instead of squeezing. */
const CHART_MAX_FIT = 12;
/** Weeks of cells shown per row in "Goals that stuck". */
const CELLS_SHOWN = 12;
const RECURRING_ROWS: Record<View, number> = { squad: 7, me: 5 };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function historyHref(squadId: string, view: View = "squad") {
  return `/squad/history?id=${squadId}${view === "me" ? "&view=me" : ""}`;
}

export function recapHref(squadId: string, weekStart: DateString, view: View = "squad") {
  return `/squad/recap?id=${squadId}&week=${weekStart}${view === "me" ? "&view=me" : ""}`;
}

function SectionHeader({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="font-heading text-[17px] font-bold">{title}</h2>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted p-3">
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-[22px] font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{note}</div>
    </div>
  );
}

function Hero({
  view,
  timeline,
  members,
  scope,
}: {
  view: View;
  timeline: HistoryWeek[];
  members: Member[];
  scope: Scope;
}) {
  const finished = goalsFinished(timeline, scope);
  const locked = weeksLockedIn(timeline, scope);
  const stats = closedStats(timeline, scope);
  const direction = trend(timeline, scope);
  const streak = lockInStreak(timeline, members, scope);
  return (
    <Card className="p-5">
      <div className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">
        {view === "me" ? "You, so far" : "Together, so far"}
      </div>
      <div className="mt-2.5 flex items-baseline gap-2.5">
        <span className="font-heading text-6xl leading-none font-extrabold tracking-tight tabular-nums">
          {finished}
        </span>
        <span className="text-[17px] font-semibold text-foreground/80">
          {plural(finished, "goal finished", "goals finished")}
        </span>
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        {locked} {plural(locked, "week", "weeks")} locked in since{" "}
        {formatShortDate(timeline[0].weekStart)} · this week included
      </p>
      {stats && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatTile label="Avg week" value={`${stats.avg}%`} note="closed weeks" />
          <StatTile label="Best week" value={`${stats.best.pct}%`} note={formatShortDate(stats.best.weekStart)} />
          {direction ? (
            <StatTile
              label="Trend"
              value={formatPoints(direction.points)}
              note={`${formatMonth(direction.from)} → ${formatMonth(direction.to)}`}
            />
          ) : (
            <StatTile
              label="Lock-in streak"
              value={String(streak)}
              note={plural(streak, "week in a row", "weeks in a row")}
            />
          )}
        </div>
      )}
    </Card>
  );
}

function barLabel(point: WeekPoint): string {
  const range = formatWeekRange(point.weekStart);
  const when = point.live ? ", this week, in progress" : "";
  return `${range}${when}, ${point.pct === null ? "not locked in" : `${point.pct} percent`}`;
}

function WeekChart({
  squadId,
  view,
  series,
  avg,
  selected,
  onSelect,
}: {
  squadId: string;
  view: View;
  series: WeekPoint[];
  avg: number | null;
  selected: DateString;
  onSelect: (weekStart: DateString) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const scrolls = series.length > CHART_MAX_FIT;
  // Open on the newest weeks when the row is wider than the screen.
  useEffect(() => {
    const element = scroller.current;
    if (scrolls && element) element.scrollLeft = element.scrollWidth;
  }, [scrolls, series.length]);

  const columns = {
    gridTemplateColumns: scrolls
      ? `repeat(${series.length}, 22px)`
      : // Capped so a squad's first few weeks don't render as huge slabs.
        `repeat(${series.length}, minmax(0, 40px))`,
  };
  const point = series.find((item) => item.weekStart === selected) ?? series[series.length - 1];
  const delta = point.live ? "In progress · closes Sunday night" : formatDelta(point.delta);
  const onlyLive = series.length === 1 && series[0].live;

  return (
    <Card className="p-5">
      <SectionHeader title="Week by week" note={onlyLive ? undefined : "Tap a week"} />
      <div ref={scroller} className={cn("mt-5", scrolls && "-mx-1 overflow-x-auto px-1 pb-1")}>
        <div className={cn(scrolls && "w-max")}>
          <div className="relative" style={{ height: CHART_HEIGHT + 26 }}>
            {avg !== null && (
              <div
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-input"
                style={{ bottom: Math.round((avg / 100) * CHART_HEIGHT) }}
              >
                <span className="absolute -top-[17px] left-0 bg-card pr-1 text-[10px] font-bold text-foreground/80">
                  avg {avg}%
                </span>
              </div>
            )}
            <div className="relative grid h-full items-end gap-1.5" style={columns}>
              {series.map((item) => {
                const on = item.weekStart === point.weekStart;
                const height =
                  item.pct === null ? 6 : Math.max(6, Math.round((item.pct / 100) * CHART_HEIGHT));
                return (
                  <button
                    key={item.weekStart}
                    type="button"
                    aria-label={barLabel(item)}
                    aria-pressed={on}
                    onClick={() => onSelect(item.weekStart)}
                    className="flex h-full min-w-0 flex-col items-center justify-end gap-1.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span
                      className={cn(
                        "text-[11px] font-bold tabular-nums",
                        on ? "visible" : "invisible",
                      )}
                    >
                      {item.pct ?? "–"}
                    </span>
                    <span
                      className={cn(
                        "block w-full rounded-t-md rounded-b-sm transition-[height] duration-350 ease-out motion-reduce:transition-none",
                        item.pct === null
                          ? "border border-dashed border-input"
                          : item.live
                            ? on
                              ? "bar-live-selected"
                              : "bar-live"
                            : on
                              ? "bg-primary"
                              : "bg-primary/30",
                      )}
                      style={{ height }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-2 grid gap-1.5 text-center" style={columns} aria-hidden="true">
            {series.map((item) => (
              <span
                key={item.weekStart}
                className={cn(
                  "text-[10px] tabular-nums",
                  item.weekStart === point.weekStart
                    ? "font-bold text-foreground"
                    : "font-medium text-muted-foreground",
                )}
              >
                {Number(item.weekStart.slice(8))}
              </span>
            ))}
          </div>
          <div className="mt-0.5 grid gap-1.5" style={columns} aria-hidden="true">
            {series.map((item, index) => (
              <span key={item.weekStart} className="text-[10px] font-bold whitespace-nowrap text-muted-foreground">
                {index === 0 || item.weekStart.slice(5, 7) !== series[index - 1].weekStart.slice(5, 7)
                  ? formatMonth(item.weekStart)
                  : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {onlyLive && (
        <p className="mt-3 text-center text-sm text-muted-foreground">
          Your first recap lands Monday.
        </p>
      )}

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-muted p-3.5" aria-live="polite">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <span>{formatWeekRange(point.weekStart)}</span>
            {point.live && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold tracking-[0.08em] text-accent-foreground">
                LIVE
              </span>
            )}
          </div>
          <div className="mt-1 text-lg font-bold tabular-nums">
            {point.pct === null
              ? "Not locked in"
              : `${point.pct}% · ${point.done} of ${point.total} ${plural(point.total, "goal", "goals")}`}
          </div>
          {delta && (
            <div
              className={cn(
                "mt-1 text-xs font-semibold",
                !point.live && (point.delta ?? 0) > 0 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {delta}
            </div>
          )}
        </div>
        {point.closed && (
          <Button asChild className="h-11 shrink-0 rounded-xl px-4 font-bold">
            <Link href={recapHref(squadId, point.weekStart, view)}>Recap</Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

function cellClass(cell: RecurringCell): string {
  switch (cell.state) {
    case "done":
      return "bg-primary";
    case "partly":
      return "";
    case "none":
      return "bg-muted";
    case "unset":
      return "border border-input";
  }
}

function RecurringRows({
  rows,
  view,
  nameOf,
}: {
  rows: RecurringGoal[];
  view: View;
  nameOf: (userId: string) => string;
}) {
  return (
    <Card className="p-5">
      <SectionHeader title="Goals that stuck" note={`set ${4}+ weeks`} />
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Set the same goal a few weeks running and it shows up here.
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3.5">
            {rows.map((row) => {
              const cells = row.cells.slice(-CELLS_SHOWN);
              return (
                <li key={`${row.ownerId}:${row.title}`} className="flex items-center gap-2.5">
                  <div className="w-[110px] min-w-0 shrink-0">
                    <div className="truncate text-[13px] font-semibold">{row.title}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {view === "me"
                        ? `${row.weeksDone} of ${row.weeksSet} ${plural(row.weeksSet, "week", "weeks")} done`
                        : `${nameOf(row.ownerId)} · ${row.weeksDone}/${row.weeksSet} wks`}
                    </div>
                  </div>
                  <div
                    className="grid min-w-0 flex-1 gap-[3px]"
                    style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
                  >
                    {cells.map((cell) => {
                      const tip = `${formatWeekRange(cell.weekStart)}: ${
                        cell.state === "unset" ? "not set" : `${cell.done} of ${cell.target}`
                      }`;
                      return (
                        <span
                          key={cell.weekStart}
                          role="img"
                          aria-label={tip}
                          title={tip}
                          className={cn(
                            "block h-[18px] rounded-[4px]",
                            cellClass(cell),
                            cell.live && "outline-1 outline-offset-1 outline-primary/60 outline-dashed",
                          )}
                          style={
                            cell.state === "partly"
                              ? {
                                  background: `color-mix(in oklch, var(--primary) ${Math.round(
                                    22 + 40 * cell.progress,
                                  )}%, transparent)`,
                                }
                              : undefined
                          }
                        />
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[3px] bg-primary" />
              Done
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[3px] bg-primary/40" />
              Partly
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[3px] bg-muted" />
              Not yet
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[3px] border border-input" />
              Not set
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

function tileText(tile: NumberTile, view: View, nameOf: (userId: string) => string) {
  switch (tile.kind) {
    case "counted":
      return {
        label: `${tile.unit} · ${tile.title}`,
        sub: view === "squad" ? nameOf(tile.ownerId) : null,
      };
    case "goals_finished":
      return { label: plural(tile.value, "goal finished", "goals finished"), sub: null };
    case "weeks_locked_in":
      return {
        label:
          view === "me"
            ? plural(tile.value, "week you locked in", "weeks you locked in")
            : plural(tile.value, "week with goals set", "weeks with goals set"),
        sub: null,
      };
    case "goals_set":
      return { label: plural(tile.value, "goal set", "goals set"), sub: null };
    case "streak":
      return {
        label:
          view === "me"
            ? plural(tile.value, "week in a row you locked in", "weeks in a row you locked in")
            : plural(tile.value, "week in a row everyone locked in", "weeks in a row everyone locked in"),
        sub: null,
      };
  }
}

function Numbers({ tiles, view, nameOf }: { tiles: NumberTile[]; view: View; nameOf: (userId: string) => string }) {
  return (
    <Card className="p-5">
      <SectionHeader title="By the numbers" note="incl. this week" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        {tiles.map((tile, index) => {
          const text = tileText(tile, view, nameOf);
          return (
            <div key={index} className="min-h-[92px] min-w-0 rounded-2xl bg-muted p-3.5">
              <div className="font-heading text-[30px] leading-tight font-extrabold tabular-nums">
                {tile.value}
              </div>
              <div className="mt-1 text-xs leading-snug break-words text-foreground/80">{text.label}</div>
              {text.sub && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{text.sub}</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PastWeeks({
  squadId,
  view,
  series,
  bestWeek,
}: {
  squadId: string;
  view: View;
  series: WeekPoint[];
  bestWeek: DateString | null;
}) {
  const closed = series.filter((point) => point.closed).reverse();
  return (
    <Card className="px-3 pt-5 pb-3">
      <div className="px-2">
        <SectionHeader title="Past weeks" note={`${closed.length} closed`} />
      </div>
      <ul className="mt-2.5 flex flex-col">
        {closed.map((point) => (
          <li key={point.weekStart}>
            <Link
              href={recapHref(squadId, point.weekStart, view)}
              aria-label={`Open recap for ${formatWeekRange(point.weekStart)}, ${
                point.pct === null ? "not locked in" : `${point.pct} percent`
              }`}
              className="flex min-h-16 items-center gap-3.5 rounded-xl p-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <MiniRing value={point.pct} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{formatWeekRange(point.weekStart)}</span>
                <span className="text-xs text-muted-foreground">
                  {point.total === 0
                    ? "Not locked in"
                    : `${point.done} of ${point.total} ${plural(point.total, "goal", "goals")} done`}
                </span>
              </span>
              {point.weekStart === bestWeek && (
                <span className="shrink-0 rounded-full bg-accent px-2 py-1 text-[11px] font-bold text-accent-foreground">
                  Best week
                </span>
              )}
              <ChevronRightIcon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function History() {
  const params = useSearchParams();
  const router = useRouter();
  const squadId = params.get("id");
  const view: View = params.get("view") === "me" ? "me" : "squad";
  const { state, connection, reload } = useSquadHistory(squadId);
  const [picked, setPicked] = useState<DateString | null>(null);

  const timeline = useMemo(
    () =>
      state.status === "ready"
        ? buildTimeline(state.history.weeks, state.now, state.history.squad.timezone)
        : [],
    [state],
  );

  if (state.status === "loading" || !squadId) return <PageSkeleton />;
  if (state.status === "error") return <PageError message={state.message} onRetry={reload} />;

  const { session, history } = state;
  const scope: Scope = view === "me" ? { kind: "member", memberId: session.userId } : { kind: "squad" };
  const series = weekSeries(timeline, scope);
  const stats = closedStats(timeline, scope);
  const closedCount = timeline.filter((week) => week.closed).length;
  const latestClosed = [...series].reverse().find((point) => point.closed)?.weekStart;
  // Default: the most recent closed week, or this week if none has closed yet.
  const selected =
    picked && series.some((point) => point.weekStart === picked)
      ? picked
      : (latestClosed ?? series[series.length - 1].weekStart);
  const nameOf = (userId: string) =>
    history.members.find((member) => member.userId === userId)?.displayName ?? "Someone";

  return (
    <main className="flex flex-1 flex-col gap-4">
      {connection === "reconnecting" && <ReconnectingPill />}

      <header className="flex items-center gap-1 pt-1">
        <Button asChild variant="ghost" size="icon-lg" className="-ml-2 size-11 shrink-0 rounded-full">
          <Link href={`/squad?id=${history.squad.id}`} aria-label="Back to this week">
            <ArrowLeftIcon className="size-5" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="font-heading text-[26px] leading-tight font-extrabold tracking-tight">History</h1>
          <p className="truncate text-sm text-muted-foreground">
            {history.squad.name} · since {formatShortDate(timeline[0].weekStart)}
          </p>
        </div>
      </header>

      <Segmented
        label="Whose history"
        value={view}
        onChange={(next) => router.replace(historyHref(history.squad.id, next), { scroll: false })}
        options={[
          { value: "squad", label: "Squad" },
          { value: "me", label: "Just me" },
        ]}
      />

      <Hero view={view} timeline={timeline} members={history.members} scope={scope} />

      <WeekChart
        squadId={history.squad.id}
        view={view}
        series={series}
        avg={stats?.avg ?? null}
        selected={selected}
        onSelect={setPicked}
      />

      {closedCount === 0 ? (
        <Card className="p-5 text-center">
          <h2 className="font-heading text-[17px] font-bold">Your story starts this week</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            When Sunday ends, this week is saved here with its recap. Goals you set week after
            week show up too.
          </p>
        </Card>
      ) : (
        <>
          <RecurringRows
            rows={recurringGoals(timeline, scope).slice(0, RECURRING_ROWS[view])}
            view={view}
            nameOf={nameOf}
          />
          <Numbers tiles={byTheNumbers(timeline, history.members, scope)} view={view} nameOf={nameOf} />
          <PastWeeks
            squadId={history.squad.id}
            view={view}
            series={series}
            bestWeek={stats?.best.weekStart ?? null}
          />
        </>
      )}

      <p className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground">
        <LockIcon className="size-3.5" aria-hidden="true" />
        Closed weeks are saved and read-only. Nothing resets.
      </p>
    </main>
  );
}
