"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSquadHistory } from "@/hooks/use-squad-history";
import {
  buildTimeline,
  formatDelta,
  latestClosedWeek,
  recapFor,
  recapHeadline,
  type RecapMember,
} from "@/lib/domain/history";
import type { DateString, Goal } from "@/lib/domain/types";
import { formatWeekRange } from "@/lib/domain/week";
import { cn } from "@/lib/utils";
import {
  Card,
  PageError,
  PageSkeleton,
  ProgressBar,
  ProgressRing,
  ReconnectingPill,
} from "./bits";
import { historyHref, recapHref } from "./history";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function goalMeta(goal: Goal): string {
  if (goal.goalType !== "counted") return goal.completedCount >= goal.targetCount ? "" : "Not done";
  const unit = goal.unitLabel ? ` ${goal.unitLabel}` : "";
  return `${goal.completedCount} of ${goal.targetCount}${unit}`;
}

function GoalLine({ goal, finished }: { goal: Goal; finished: boolean }) {
  return (
    <li className="flex min-h-9 items-center gap-3">
      {finished ? (
        <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-[13px]" strokeWidth={3} aria-hidden="true" />
        </span>
      ) : (
        <span className="size-[22px] shrink-0 rounded-full border-2 border-input" aria-hidden="true" />
      )}
      <span className={cn("min-w-0 flex-1 text-sm break-words", finished && "text-foreground/80")}>
        <span className="sr-only">{finished ? "Finished: " : "Open: "}</span>
        {goal.title}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{goalMeta(goal)}</span>
    </li>
  );
}

function MemberCard({ member }: { member: RecapMember }) {
  return (
    <Card className="px-5 pt-[18px] pb-5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-lg font-bold">{member.displayName}</span>
          {member.you && <span className="text-[13px] text-muted-foreground">you</span>}
        </div>
        <span className="shrink-0 text-[13px] text-foreground/80 tabular-nums">
          {member.pct === null
            ? "Not locked in"
            : `${member.done} of ${member.total} done · ${member.pct}%`}
        </span>
      </div>
      {member.pct !== null && (
        <>
          <div className="mt-3">
            <ProgressBar value={member.pct} label={`${member.displayName}: progress that week`} />
          </div>
          {member.finished.length > 0 && (
            <>
              <h3 className="mt-[18px] text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
                Finished
              </h3>
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {member.finished.map((goal) => (
                  <GoalLine key={goal.id} goal={goal} finished />
                ))}
              </ul>
            </>
          )}
          {member.open.length > 0 ? (
            <>
              <h3 className="mt-3.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
                Still open at week&apos;s end
              </h3>
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {member.open.map((goal) => (
                  <GoalLine key={goal.id} goal={goal} finished={false} />
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3.5 text-[13px] font-semibold text-primary">
              Every goal finished this week.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function WeekStep({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const className = "size-11 shrink-0 rounded-xl";
  if (!href) {
    return (
      <Button variant="outline" size="icon-lg" className={className} disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="icon-lg" className={className}>
      <Link href={href} aria-label={label} replace>
        {children}
      </Link>
    </Button>
  );
}

export function Recap() {
  const params = useSearchParams();
  const squadId = params.get("id");
  const view = params.get("view") === "me" ? "me" : "squad";
  const { state, connection, reload } = useSquadHistory(squadId);

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
  const backHref = historyHref(history.squad.id, view);
  const requested: DateString | null = params.get("week") ?? latestClosedWeek(timeline);
  const recap = requested ? recapFor(timeline, requested, history.members, session.userId) : null;

  const backLink = (
    <Button asChild variant="ghost" className="-ml-1.5 h-11 self-start rounded-xl pr-2.5 pl-1 text-[15px] font-semibold">
      <Link href={backHref}>
        <ArrowLeftIcon className="size-5" aria-hidden="true" />
        History
      </Link>
    </Button>
  );

  if (!recap) {
    return (
      <main className="flex flex-1 flex-col gap-4">
        {backLink}
        <Card className="p-5 text-center">
          <h1 className="font-heading text-xl font-bold">No recap for that week yet</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A recap appears once a week has ended. The week in progress is on your dashboard.
          </p>
          <Button asChild size="touch" className="mt-4 w-full">
            <Link href={`/squad?id=${history.squad.id}`}>Go to this week</Link>
          </Button>
        </Card>
      </main>
    );
  }

  const delta = formatDelta(recap.delta) ?? "Your first week as a squad";

  return (
    <main className="flex flex-1 flex-col gap-4">
      {connection === "reconnecting" && <ReconnectingPill />}
      {backLink}

      <div className="flex items-center justify-between gap-2">
        <WeekStep
          href={recap.previous ? recapHref(history.squad.id, recap.previous, view) : null}
          label="Previous week"
        >
          <ChevronLeftIcon className="size-5" />
        </WeekStep>
        <div className="min-w-0 text-center">
          <h1 className="font-heading text-[22px] font-extrabold tracking-tight">
            {formatWeekRange(recap.weekStart)}
          </h1>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <LockIcon className="size-[13px]" aria-hidden="true" />
            Week closed · read-only
          </p>
        </div>
        <WeekStep
          href={recap.next ? recapHref(history.squad.id, recap.next, view) : null}
          label="Next week"
        >
          <ChevronRightIcon className="size-5" />
        </WeekStep>
      </div>

      <Card className="flex items-center gap-[18px] p-5">
        <ProgressRing value={recap.pct} />
        <div className="min-w-0">
          {recap.isBest && (
            <div className="mb-2 inline-block rounded-full bg-accent px-2 py-1 text-[11px] font-bold text-accent-foreground">
              Best week so far
            </div>
          )}
          <h2 className="text-lg leading-tight font-bold">{recapHeadline(recap.pct)}</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Squad finished {recap.done} of {recap.total} {plural(recap.total, "goal", "goals")}
          </p>
          {recap.pct !== null && (
            <p
              className={cn(
                "mt-1.5 text-xs font-semibold",
                (recap.delta ?? 0) > 0 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {delta}
            </p>
          )}
        </div>
      </Card>

      {recap.members.map((member) => (
        <MemberCard key={member.userId} member={member} />
      ))}

      <div className="mt-1 flex flex-col gap-2.5">
        {recap.isLatest && (
          <Button asChild size="touch" className="w-full">
            <Link href={`/squad?id=${history.squad.id}`}>Plan next week</Link>
          </Button>
        )}
        <Button asChild variant="outline" size="touch" className="w-full">
          <Link href={backHref}>Back to history</Link>
        </Button>
      </div>
    </main>
  );
}
