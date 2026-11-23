"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon, HistoryIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSquadWeek, type WeekChoice } from "@/hooks/use-squad-week";
import {
  SUGGESTED_GOALS_MAX,
  SUGGESTED_GOALS_MIN,
  type GoalInput,
} from "@/lib/domain/goal";
import {
  countCompleted,
  memberProgress,
  squadProgress,
  toPercent,
} from "@/lib/domain/progress";
import { nudgedGoalIds, nudgesLeft, recentNudgers } from "@/lib/domain/nudge";
import { isWaitingForFriends } from "@/lib/domain/squad";
import type { Goal, Member } from "@/lib/domain/types";
import { addDays, formatWeekRange, isSundayInZone, isWeekClosed } from "@/lib/domain/week";
import { carryOverCandidates, type CarryOver } from "@/lib/domain/carry-over";
import { ActivityFeed } from "./activity-feed";
import { CarryOverList, useDismissedCarryOvers } from "./carry-over";
import { Card, PageError, PageSkeleton, ProgressBar, ProgressRing, Segmented } from "./bits";
import { GoalEditor } from "./goal-editor";
import { FriendGoalRow, MyGoalRow } from "./goal-row";
import { InviteSheet } from "./invite-sheet";
import { NotificationsCard } from "./notifications-card";

function MemberHeading({
  name,
  tag,
  goals,
}: {
  name: string;
  tag?: string;
  goals: Goal[];
}) {
  const progress = memberProgress(goals);
  const { done, total } = countCompleted(goals);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate font-heading text-lg font-bold">
          {name}
          {tag && (
            <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
              {tag}
            </span>
          )}
        </h2>
        {progress === null ? (
          <span className="shrink-0 text-sm text-muted-foreground">Not locked in</span>
        ) : (
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {done} of {total} done ·{" "}
            <span className="font-semibold text-foreground">{toPercent(progress)}%</span>
          </span>
        )}
      </div>
      {progress !== null && (
        <ProgressBar value={toPercent(progress)} label={`${name}: progress this week`} />
      )}
    </div>
  );
}

function FriendCard({
  member,
  goals,
  weekPhrase,
  nudgedGoalIds,
  canNudge,
  onNudge,
}: {
  /** "this week", "next week" or "the week after". */
  weekPhrase: string;
  member: Member;
  goals: Goal[];
  /** Their goals I've nudged in the last day. Each goal is nudged once. */
  nudgedGoalIds: ReadonlySet<string>;
  /** True while I have nudges left for this person. */
  canNudge: boolean;
  onNudge: (goal: Goal) => void;
}) {
  return (
    <Card>
      <MemberHeading
        name={member.displayName}
        tag={member.leftAt ? "left the squad" : undefined}
        goals={goals}
      />
      {goals.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {member.displayName} hasn&apos;t set goals for {weekPhrase} yet.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {goals.map((goal) => (
            <FriendGoalRow
              key={goal.id}
              goal={goal}
              ownerName={member.displayName}
              nudge={nudgedGoalIds.has(goal.id) ? "sent" : canNudge ? "available" : undefined}
              onNudge={() => onNudge(goal)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Dashboard() {
  // A tap on the Sunday notification opens next week directly.
  const params = useSearchParams();
  const [week, setWeek] = useState<WeekChoice>(
    params.get("week") === "next" ? "upcoming" : "current",
  );
  const { state, goals, connection, reload, adjustCount, run } = useSquadWeek(week, params.get("id"));
  const [editor, setEditor] = useState<{ open: boolean; goal: Goal | null }>({
    open: false,
    goal: null,
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lockingIn, setLockingIn] = useState(false);
  const { dismissed, dismiss } = useDismissedCarryOvers();

  if (state.status === "loading") return <PageSkeleton />;
  if (state.status === "error") return <PageError message={state.message} onRetry={reload} />;

  const { session, snapshot, now } = state;
  // While a different week is loading, keep describing the one on screen.
  const shownWeek = state.week;
  const { squad, weekStart } = snapshot;
  const closed = isWeekClosed(weekStart, now, snapshot.timezone);
  const weekLabel = formatWeekRange(weekStart);

  const goalsOf = (userId: string) => goals.filter((goal) => goal.ownerId === userId);
  const myGoals = goalsOf(session.userId);
  const activeMembers = snapshot.members.filter((member) => !member.leftAt);
  // People who left still appear on weeks where they had goals.
  const friends = snapshot.members.filter(
    (member) =>
      member.userId !== session.userId &&
      (!member.leftAt || goalsOf(member.userId).length > 0),
  );
  const nameOf = (userId: string) =>
    snapshot.members.find((member) => member.userId === userId)?.displayName ?? "Someone";
  const shown = [session.userId, ...friends.map((member) => member.userId)];
  const squadValue = squadProgress(shown.map((userId) => memberProgress(goalsOf(userId))));
  const totals = countCompleted(goals);
  const unlocked = myGoals.filter((goal) => !goal.lockedInAt).length;
  const lockedIn = myGoals.length > 0 && unlocked === 0;
  const waiting = isWaitingForFriends(activeMembers.length);
  const carryOvers = closed ? [] : carryOverCandidates(state.previousGoals, myGoals, dismissed);
  const showSundayPrompt =
    shownWeek === "current" &&
    state.nextWeekPlanned === false &&
    isSundayInZone(now, squad.timezone);

  async function addCarryOvers(items: CarryOver[]) {
    const ok = await run(async (store) => {
      for (const item of items) await store.createGoal(squad.id, weekStart, item.input);
    });
    if (ok) toast.success(items.length === 1 ? "Goal added" : `${items.length} goals added`);
  }

  async function saveGoal(input: GoalInput): Promise<boolean> {
    const editing = editor.goal;
    const ok = await run((store) =>
      editing ? store.updateGoal(editing.id, input) : store.createGoal(squad.id, weekStart, input),
    );
    if (ok) setEditor((previous) => ({ ...previous, open: false }));
    return ok;
  }

  async function deleteGoal(): Promise<boolean> {
    const editing = editor.goal;
    if (!editing) return false;
    const ok = await run((store) => store.deleteGoal(editing.id));
    if (ok) setEditor((previous) => ({ ...previous, open: false }));
    return ok;
  }

  async function nudge(goal: Goal, member: Member) {
    const ok = await run((store) => store.sendNudge(goal.id));
    if (ok) toast.success(`${member.displayName} will know you're cheering them on`);
  }

  async function lockIn() {
    setLockingIn(true);
    await run((store) => store.lockIn(squad.id, weekStart));
    setLockingIn(false);
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      {connection === "reconnecting" && (
        <div
          role="status"
          className="rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground"
        >
          Reconnecting… What you see may be out of date.
        </div>
      )}

      <header className="flex items-start gap-1 pt-1">
        <Button asChild variant="ghost" size="icon-lg" className="-ml-2 size-11 shrink-0 rounded-full">
          <Link href="/squads" aria-label="All your squads">
            <ArrowLeftIcon className="size-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-2xl font-bold tracking-tight">
            {squad.name}
          </h1>
          <p className="text-muted-foreground">
            {weekLabel}
            {closed && " · Week ended"}
          </p>
        </div>
        <Button asChild variant="ghost" size="icon-lg" className="size-11 shrink-0 rounded-full">
          <Link href={`/squad/history?id=${squad.id}`} aria-label="History">
            <HistoryIcon className="size-5" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="icon-lg" className="-mr-2 size-11 shrink-0 rounded-full">
          <Link href={`/squad/settings?id=${squad.id}`} aria-label="Squad settings">
            <SettingsIcon className="size-5" />
          </Link>
        </Button>
      </header>

      <Segmented
        label="Week"
        value={week}
        onChange={setWeek}
        options={[
          { value: "current", label: "This week" },
          { value: "upcoming", label: "Next week" },
          { value: "after", label: "Week after" },
        ]}
      />

      {showSundayPrompt && (
        <Card className="border-primary/30 bg-accent">
          <h2 className="font-heading text-base font-bold">Start planning next week now</h2>
          <p className="mt-1 text-sm text-accent-foreground">
            It&apos;s Sunday. Set your goals for {formatWeekRange(addDays(weekStart, 7))} so
            you start Monday locked in.
          </p>
          <Button size="touch" className="mt-3 w-full" onClick={() => setWeek("upcoming")}>
            Plan next week
          </Button>
        </Card>
      )}

      <Card className="flex items-center gap-4">
        <ProgressRing value={squadValue === null ? null : toPercent(squadValue)} />
        <div className="min-w-0">
          <h2 className="font-heading text-base font-bold">Squad progress</h2>
          {squadValue === null ? (
            <p className="text-sm text-muted-foreground">
              {shownWeek === "current"
                ? "No goals yet this week. Add yours to get the squad going."
                : `Nobody has set goals for ${
                    shownWeek === "upcoming" ? "next week" : "the week after"
                  } yet. Go first.`}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {totals.done} of {totals.total} goals done across the squad
            </p>
          )}
        </div>
      </Card>

      <NotificationsCard compact />

      {waiting && (
        <Card className="border-primary/30 bg-accent">
          <h2 className="font-heading text-base font-bold">Waiting for friends</h2>
          <p className="mt-1 text-sm text-accent-foreground">
            It only works when someone else can see what you committed to. Invite up to four
            friends.
          </p>
          <Button size="touch" className="mt-3 w-full" onClick={() => setInviteOpen(true)}>
            Invite a friend
          </Button>
        </Card>
      )}

      <Card className="border-primary/40">
        <MemberHeading name={session.displayName} tag="you" goals={myGoals} />

        {myGoals.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {closed
              ? "You didn't set goals this week."
              : `What are you locking in? ${SUGGESTED_GOALS_MIN} to ${SUGGESTED_GOALS_MAX} goals makes a good week.`}
          </p>
        ) : (
          <ul className="mt-2 flex flex-col">
            {myGoals.map((goal) => (
              <MyGoalRow
                key={goal.id}
                goal={goal}
                readOnly={closed}
                cheeredBy={recentNudgers(snapshot.nudges, goal.id, session.userId, now).map(nameOf)}
                onAdjust={(delta) => adjustCount(goal, delta)}
                onEdit={() => setEditor({ open: true, goal })}
              />
            ))}
          </ul>
        )}

        <CarryOverList
          heading={
            shownWeek === "current"
              ? "Unfinished from last week"
              : shownWeek === "upcoming"
                ? "Not finished this week yet"
                : "On your list for next week"
          }
          items={carryOvers}
          onDismiss={dismiss}
          onAdd={addCarryOvers}
        />

        {!closed && (
          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="outline"
              size="touch"
              className="w-full"
              onClick={() => setEditor({ open: true, goal: null })}
            >
              <PlusIcon className="size-4" />
              Add a goal
            </Button>
            {unlocked > 0 && (
              <Button size="touch" className="w-full" disabled={lockingIn} onClick={lockIn}>
                {lockingIn
                  ? "Locking in…"
                  : myGoals.length === unlocked
                    ? "Lock in goals"
                    : `Lock in ${unlocked} new ${unlocked === 1 ? "goal" : "goals"}`}
              </Button>
            )}
            {lockedIn && (
              <p className="text-center text-sm text-muted-foreground">
                Locked in. You can still edit, and your squad will see the change.
              </p>
            )}
          </div>
        )}
      </Card>

      {friends.map((member) => (
        <FriendCard
          key={member.userId}
          member={member}
          goals={goalsOf(member.userId)}
          weekPhrase={
            shownWeek === "current"
              ? "this week"
              : shownWeek === "upcoming"
                ? "next week"
                : "the week after"
          }
          nudgedGoalIds={nudgedGoalIds(snapshot.nudges, session.userId, member.userId, now)}
          canNudge={
            !closed &&
            !member.leftAt &&
            nudgesLeft(snapshot.nudges, session.userId, member.userId, now) > 0
          }
          onNudge={(goal) => nudge(goal, member)}
        />
      ))}

      <ActivityFeed
        events={snapshot.activity}
        members={snapshot.members}
        myId={session.userId}
        now={now}
      />

      <GoalEditor
        open={editor.open}
        onOpenChange={(open) => setEditor((previous) => ({ ...previous, open }))}
        goal={editor.goal}
        weekLabel={weekLabel}
        onSave={saveGoal}
        onDelete={deleteGoal}
      />
      <InviteSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        squadId={squad.id}
        squadName={squad.name}
      />
    </main>
  );
}
