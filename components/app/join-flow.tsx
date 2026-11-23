"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStore, messageFor, type Session } from "@/lib/data";
import { startFresh } from "@/lib/navigate";
import {
  isInviteCodeShape,
  MAX_SQUAD_MEMBERS,
  normaliseInviteCode,
  SQUAD_NAME_MAX,
} from "@/lib/domain/squad";
import { PageError, PageSkeleton, Segmented } from "./bits";

type Tab = "join" | "create";

type Gate =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; session: Session; hasSquads: boolean };

export function JoinFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const codeParam = params.get("code") ?? "";
  const [tab, setTab] = useState<Tab>(
    params.get("new") === "1" && !codeParam ? "create" : "join",
  );
  const [gate, setGate] = useState<Gate>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState(codeParam);
  const [squadName, setSquadName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = getStore();
        const session = await store.getSession();
        if (cancelled) return;
        if (!session) {
          const here = `/join${window.location.search}`;
          router.replace(`/auth?mode=signup&next=${encodeURIComponent(here)}`);
          return;
        }
        const squads = await store.getMySquads();
        if (cancelled) return;
        setGate({ status: "ready", session, hasSquads: squads.length > 0 });
      } catch (caught) {
        if (!cancelled) setGate({ status: "error", message: messageFor(caught) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, attempt]);

  if (gate.status === "loading") return <PageSkeleton />;
  if (gate.status === "error") {
    return (
      <PageError
        message={gate.message}
        onRetry={() => {
          setGate({ status: "loading" });
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  async function join(event: React.FormEvent) {
    event.preventDefault();
    const normalised = normaliseInviteCode(code);
    if (!isInviteCodeShape(normalised)) {
      setError("That doesn't look like an invite code. It's 10 letters and numbers.");
      return;
    }
    await submit(() => getStore().joinSquad(normalised));
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (squadName.trim().length === 0) {
      setError("Give your squad a name.");
      return;
    }
    // Weeks run Monday to Sunday in this zone. It can be changed in settings.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    await submit(() => getStore().createSquad({ name: squadName, timezone }));
  }

  async function submit(action: () => Promise<{ id: string }>) {
    setError(null);
    setBusy(true);
    try {
      const squad = await action();
      startFresh(`/squad?id=${squad.id}`);
    } catch (caught) {
      setError(messageFor(caught));
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 pt-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Hi {gate.session.displayName}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {gate.hasSquads
            ? "Join another squad, or start a new one and invite friends."
            : "Join your friends' squad, or start one and invite them."}
        </p>
      </div>

      <Segmented
        label="Join or create"
        value={tab}
        onChange={(value) => {
          setTab(value);
          setError(null);
        }}
        options={[
          { value: "join", label: "Join a squad" },
          { value: "create", label: "Start a squad" },
        ]}
      />

      {tab === "join" ? (
        <form onSubmit={join} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-code">Invite code</Label>
            <Input
              id="invite-code"
              className="h-14 text-center font-heading text-2xl font-bold tracking-widest uppercase"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={14}
              placeholder="ABCDE-FGH23"
              aria-invalid={Boolean(error)}
            />
            <p className="text-sm text-muted-foreground">
              Your friend can find it under Invite in their squad.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="touch" disabled={busy}>
            {busy ? "Joining…" : "Join Squad"}
          </Button>
        </form>
      ) : (
        <form onSubmit={create} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="squad-name">Squad name</Label>
            <Input
              id="squad-name"
              className="h-12"
              value={squadName}
              maxLength={SQUAD_NAME_MAX}
              onChange={(event) => setSquadName(event.target.value)}
              autoComplete="off"
              placeholder="Sunday Lock-In Crew"
              aria-invalid={Boolean(error)}
            />
            <p className="text-sm text-muted-foreground">
              Private and invite-only, for 2 to {MAX_SQUAD_MEMBERS} friends.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="touch" disabled={busy}>
            {busy ? "Creating…" : "Create Squad"}
          </Button>
        </form>
      )}

      {gate.hasSquads && (
        <Link
          href="/squads"
          className="py-2 text-center text-sm font-semibold underline underline-offset-4"
        >
          Back to your squads
        </Link>
      )}
    </main>
  );
}
