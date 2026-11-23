"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSquadWeek } from "@/hooks/use-squad-week";
import { getStore, messageFor } from "@/lib/data";
import { startFresh } from "@/lib/navigate";
import { disablePush } from "@/lib/push";
import {
  canJoinSquad,
  DISPLAY_NAME_MAX,
  MAX_SQUAD_MEMBERS,
  SQUAD_NAME_MAX,
} from "@/lib/domain/squad";
import { Card, PageError, PageSkeleton } from "./bits";
import { forgetInvite, InviteSheet } from "./invite-sheet";
import { NotificationsCard } from "./notifications-card";

function timeZones(current: string): string[] {
  const zones =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes(current) ? zones : [current, ...zones];
}

/** A text field with its own Save button, shown only once the value changes. */
function SavedField({
  id,
  label,
  initial,
  maxLength,
  onSave,
}: {
  id: string;
  label: string;
  initial: string;
  maxLength: number;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const changed = value.trim() !== initial && value.trim().length > 0;
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!changed) return;
        setBusy(true);
        await onSave(value.trim());
        setBusy(false);
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          className="h-12"
          value={value}
          maxLength={maxLength}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
        />
        {changed && (
          <Button type="submit" size="touch" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
    </form>
  );
}

export function Settings() {
  const params = useSearchParams();
  const { state, reload, run } = useSquadWeek("current", params.get("id"));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [busy, setBusy] = useState(false);

  if (state.status === "loading") return <PageSkeleton />;
  if (state.status === "error") return <PageError message={state.message} onRetry={reload} />;

  const { session, snapshot } = state;
  const { squad } = snapshot;
  const store = getStore();
  const members = snapshot.members.filter((member) => !member.leftAt);
  const isOwner = members.some(
    (member) => member.userId === session.userId && member.role === "owner",
  );

  async function leave() {
    setBusy(true);
    try {
      await store.leaveSquad(squad.id);
      forgetInvite(squad.id);
      startFresh("/squad");
    } catch (error) {
      toast.error(messageFor(error));
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      // Stop this device getting notifications meant for the account signing out.
      await disablePush(store).catch(() => {});
      await store.signOut();
      startFresh("/");
    } catch (error) {
      toast.error(messageFor(error));
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      <header className="flex items-center gap-1 pt-1">
        <Button asChild variant="ghost" size="icon-lg" className="-ml-2 size-11 rounded-full">
          <Link href={`/squad?id=${squad.id}`} aria-label="Back to squad">
            <ArrowLeftIcon className="size-5" />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-heading text-2xl font-bold tracking-tight">
          Squad settings
        </h1>
      </header>

      <Card>
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-base font-bold">Members</h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {members.length} of {MAX_SQUAD_MEMBERS}
          </span>
        </div>
        <ul className="mt-2 flex flex-col">
          {members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between gap-3 border-t py-3 first:border-t-0"
            >
              <span className="min-w-0 truncate font-medium">
                {member.displayName}
                {member.userId === session.userId && (
                  <span className="ml-2 font-normal text-muted-foreground">you</span>
                )}
              </span>
              {member.role === "owner" && (
                <span className="shrink-0 text-sm text-muted-foreground">Owner</span>
              )}
            </li>
          ))}
        </ul>
        {canJoinSquad(members.length) ? (
          <Button size="touch" className="mt-2 w-full" onClick={() => setInviteOpen(true)}>
            Invite a friend
          </Button>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Your squad is full. Squads stay small on purpose.
          </p>
        )}
        {isOwner && (
          <Button
            variant="ghost"
            size="touch"
            className="mt-1 w-full"
            onClick={async () => {
              const ok = await run((live) => live.revokeInvites(squad.id));
              if (ok) {
                forgetInvite(squad.id);
                toast.success("Old invites no longer work");
              }
            }}
          >
            Cancel all outstanding invites
          </Button>
        )}
      </Card>

      <NotificationsCard />

      <Card className="flex flex-col gap-4">
        <h2 className="font-heading text-base font-bold">You</h2>
        <SavedField
          key={session.displayName}
          id="display-name"
          label="Your name"
          initial={session.displayName}
          maxLength={DISPLAY_NAME_MAX}
          onSave={(value) => run((live) => live.updateDisplayName(value))}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-heading text-base font-bold">Squad</h2>
        {isOwner ? (
          <>
            <SavedField
              key={squad.name}
              id="squad-name"
              label="Squad name"
              initial={squad.name}
              maxLength={SQUAD_NAME_MAX}
              onSave={(value) => run((live) => live.updateSquad(squad.id, { name: value }))}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="squad-timezone">Time zone</Label>
              <select
                id="squad-timezone"
                className="h-12 w-full rounded-lg border border-input bg-transparent px-2.5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={squad.timezone}
                onChange={(event) =>
                  run((live) => live.updateSquad(squad.id, { timezone: event.target.value }))
                }
              >
                {timeZones(squad.timezone).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">
                Weeks run Monday to Sunday in this time zone for everyone. A change applies from
                the next new week.
              </p>
            </div>
          </>
        ) : (
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="min-w-0 truncate font-medium">{squad.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Time zone</dt>
              <dd className="font-medium">{squad.timezone.replaceAll("_", " ")}</dd>
            </div>
            <p className="text-muted-foreground">Only the owner can change these.</p>
          </dl>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        {confirmingLeave ? (
          <>
            <p className="text-sm">
              Leave {squad.name}? You&apos;ll lose access straight away. Your past goals stay in
              the squad&apos;s history.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="touch"
                disabled={busy}
                onClick={() => setConfirmingLeave(false)}
              >
                Stay
              </Button>
              <Button variant="destructive" size="touch" disabled={busy} onClick={leave}>
                Leave
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="ghost"
            size="touch"
            className="text-destructive"
            onClick={() => setConfirmingLeave(true)}
          >
            Leave squad
          </Button>
        )}
        <Button variant="ghost" size="touch" disabled={busy} onClick={signOut}>
          Sign out
        </Button>
        {session.email && (
          <p className="text-center text-sm text-muted-foreground">Signed in as {session.email}</p>
        )}
      </Card>

      <InviteSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        squadId={squad.id}
        squadName={squad.name}
      />
    </main>
  );
}
