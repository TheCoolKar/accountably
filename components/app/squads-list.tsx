"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStore, messageFor, StoreError, type SquadSummary } from "@/lib/data";
import { MAX_SQUAD_MEMBERS } from "@/lib/domain/squad";
import { PageError, PageSkeleton } from "./bits";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; squads: SquadSummary[] };

function membersLine(squad: SquadSummary): string {
  const others = squad.otherMembers;
  if (others.length === 0) return "Just you so far";
  if (others.length === 1) return `You and ${others[0]}`;
  return `You, ${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`;
}

/**
 * All the squads you're in, and the way to start or join another. Reached
 * with the back arrow on a squad. It is also home for anyone in two or more
 * squads; with one squad, home opens that squad directly.
 */
export function SquadsList() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = getStore();
        const session = await store.getSession();
        if (cancelled) return;
        if (!session) {
          router.replace("/auth?mode=signin&next=%2Fsquads");
          return;
        }
        const squads = await store.getMySquads();
        if (cancelled) return;
        if (squads.length === 0) {
          router.replace("/join");
          return;
        }
        setState({ status: "ready", squads });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof StoreError && error.code === "not_signed_in") {
          router.replace("/auth?mode=signin&next=%2Fsquads");
          return;
        }
        setState({ status: "error", message: messageFor(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, attempt]);

  if (state.status === "loading") return <PageSkeleton />;
  if (state.status === "error") {
    return (
      <PageError
        message={state.message}
        onRetry={() => {
          setState({ status: "loading" });
          setAttempt((value) => value + 1);
        }}
      />
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      <h1 className="pt-1 font-heading text-2xl font-bold tracking-tight">Your squads</h1>

      <ul className="flex flex-col gap-3">
        {state.squads.map((squad) => (
          <li key={squad.id}>
            <Link
              href={`/squad?id=${squad.id}`}
              className="flex min-h-18 items-center gap-3 rounded-2xl border bg-card p-4 outline-none transition-colors active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-heading text-lg font-bold">
                  {squad.name}
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {membersLine(squad)}
                </span>
              </span>
              <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-col gap-2">
        <Button asChild size="touch" variant="outline">
          <Link href="/join?new=1">Start another squad</Link>
        </Button>
        <Button asChild size="touch" variant="outline">
          <Link href="/join">Join a squad with a code</Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Each squad is private, with up to {MAX_SQUAD_MEMBERS} people.
        </p>
      </div>
    </main>
  );
}
