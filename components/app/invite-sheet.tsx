"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { getStore, messageFor, type Invite } from "@/lib/data";
import { formatInviteCode, MAX_SQUAD_MEMBERS } from "@/lib/domain/squad";

const cacheKey = (squadId: string) => `accountably:invite:${squadId}`;

/** Reuses this session's invite while it is still valid, so opening the sheet twice doesn't mint two codes. */
function cachedInvite(squadId: string): Invite | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(squadId));
    if (!raw) return null;
    const invite = JSON.parse(raw) as Invite;
    return new Date(invite.expiresAt).getTime() > Date.now() + 60_000 ? invite : null;
  } catch {
    return null;
  }
}

export function forgetInvite(squadId: string): void {
  try {
    sessionStorage.removeItem(cacheKey(squadId));
  } catch {
    // Nothing cached.
  }
}

type InviteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; invite: Invite; link: string; canShare: boolean };

function InviteBody({ squadId, squadName }: { squadId: string; squadName: string }) {
  const [state, setState] = useState<InviteState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const store = getStore();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const invite = cachedInvite(squadId) ?? (await store.createInvite(squadId));
        try {
          sessionStorage.setItem(cacheKey(squadId), JSON.stringify(invite));
        } catch {
          // Without storage we just make a new code next time.
        }
        if (cancelled) return;
        setState({
          status: "ready",
          invite,
          link: `${window.location.origin}/join?code=${invite.code}`,
          canShare: typeof navigator.share === "function",
        });
      } catch (error) {
        if (!cancelled) setState({ status: "error", message: messageFor(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [squadId, store, attempt]);

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-3 px-4 pb-6" aria-busy="true">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-3 px-4 pb-6">
        <p className="text-muted-foreground">Couldn&apos;t make an invite. {state.message}</p>
        <Button
          size="touch"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const { invite, link, canShare } = state;
  const expires = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(invite.expiresAt));

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error(`Couldn't copy. Press and hold the ${what.toLowerCase()} to copy it.`);
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "Accountably",
        text: `Join ${squadName} on Accountably. Code: ${formatInviteCode(invite.code)}`,
        url: link,
      });
    } catch {
      // Closing the share sheet isn't an error worth reporting.
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      <button
        type="button"
        onClick={() => copy(invite.code, "Code")}
        className="rounded-xl border bg-muted/60 px-4 py-4 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="block text-sm text-muted-foreground">Invite code</span>
        <span className="font-heading text-3xl font-bold tracking-wider select-all">
          {formatInviteCode(invite.code)}
        </span>
      </button>

      {canShare && (
        <Button size="touch" onClick={share}>
          Share invite
        </Button>
      )}
      <Button
        size="touch"
        variant={canShare ? "outline" : "default"}
        onClick={() => copy(link, "Link")}
      >
        Copy link
      </Button>

      <p className="text-sm text-muted-foreground">
        Works until {expires}. Squads hold up to {MAX_SQUAD_MEMBERS} people.
      </p>
    </div>
  );
}

export function InviteSheet({
  open,
  onOpenChange,
  squadId,
  squadName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  squadId: string;
  squadName: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-md">
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-heading text-xl">Invite a friend</DrawerTitle>
          <DrawerDescription>
            Send the link, or have them type the code after they sign up.
          </DrawerDescription>
        </DrawerHeader>
        {open && <InviteBody squadId={squadId} squadName={squadName} />}
      </DrawerContent>
    </Drawer>
  );
}
