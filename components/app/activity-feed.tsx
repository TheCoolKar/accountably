import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isProgressWin } from "@/lib/domain/activity";
import type { ActivityEvent, Member } from "@/lib/domain/types";
import { Card } from "./bits";

function describe(event: ActivityEvent, who: string, isMe: boolean): string {
  const title = event.metadata.title ? `“${event.metadata.title}”` : "a goal";
  switch (event.type) {
    case "goal_created":
      return `${who} added ${title}`;
    case "goal_edited":
      return `${who} changed ${title}`;
    case "goal_deleted":
      return `${who} removed ${title}`;
    case "goal_completed":
      return `${who} finished ${title}`;
    case "goal_reopened":
      return `${who} reopened ${title}`;
    case "progress_updated":
      return `${who} ${isMe ? "are" : "is"} at ${event.metadata.completed_count ?? 0} of ${
        event.metadata.target_count ?? 0
      } on ${title}`;
    case "locked_in": {
      const count = event.metadata.goal_count ?? 0;
      return `${who} locked in ${count} ${count === 1 ? "goal" : "goals"}`;
    }
  }
}

function timeAgo(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function ActivityFeed({
  events,
  members,
  myId,
  now,
}: {
  events: ActivityEvent[];
  members: Member[];
  myId: string;
  now: Date;
}) {
  const nameOf = (userId: string) =>
    userId === myId
      ? "You"
      : (members.find((member) => member.userId === userId)?.displayName ?? "Someone");

  return (
    <Card>
      <h2 className="font-heading text-base font-bold">Recent activity</h2>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing yet. Goals and progress show up here as they happen.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {events.map((event) => {
            // Finished goals and steps forward stand out in green.
            const win = isProgressWin(event);
            return (
              <li
                key={event.id}
                className="flex items-baseline justify-between gap-3 border-t py-2.5 text-sm first:border-t-0"
              >
                <span
                  className={cn(
                    "flex min-w-0 items-baseline gap-2",
                    win && "font-medium text-success",
                  )}
                >
                  {win && (
                    <span className="flex size-4 shrink-0 translate-y-0.5 items-center justify-center rounded-full bg-success text-card">
                      <CheckIcon className="size-3" strokeWidth={3.5} aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0 wrap-break-word">
                    {describe(event, nameOf(event.actorId), event.actorId === myId)}
                  </span>
                </span>
                <time
                  dateTime={event.createdAt}
                  className="shrink-0 text-xs text-muted-foreground tabular-nums"
                >
                  {timeAgo(event.createdAt, now)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
