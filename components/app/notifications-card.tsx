"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getStore, messageFor } from "@/lib/data";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";
import { Card } from "./bits";

const DISMISS_KEY = "accountably:notifications-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Turn notifications on or off for this device.
 * `compact` is the dashboard version: it only appears while notifications are
 * off and can be dismissed. The full version lives in settings.
 */
export function NotificationsCard({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState | "checking">("checking");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushState()
      .then((next) => {
        if (cancelled) return;
        setState(next);
        setDismissed(wasDismissed());
      })
      .catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const next = await enablePush(getStore());
      setState(next);
      if (next === "on") toast.success("Notifications are on for this device");
    } catch (error) {
      toast.error(`Couldn't turn notifications on. ${messageFor(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await disablePush(getStore());
      setState("off");
    } catch (error) {
      toast.error(`Couldn't turn notifications off. ${messageFor(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // It will just show again next time.
    }
  }

  if (state === "checking") return null;
  if (compact && (dismissed || state === "on" || state === "unsupported" || state === "blocked")) {
    return null;
  }

  const what =
    "Hear when a squadmate adds a goal or makes progress on one, when someone cheers you on, and on Sunday evening when it's time to lock in.";

  return (
    <Card>
      <h2 className="font-heading text-base font-bold">Notifications</h2>

      {state === "on" ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">On for this device. {what}</p>
          <Button variant="outline" size="touch" className="mt-3 w-full" disabled={busy} onClick={turnOff}>
            Turn off on this device
          </Button>
        </>
      ) : state === "needs-install" ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            On iPhone, notifications work once Accountably is on your home screen:
          </p>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>
              In Safari, tap the <span className="font-semibold">Share</span> button.
            </li>
            <li>
              Choose <span className="font-semibold">Add to Home Screen</span>.
            </li>
            <li>Open Accountably from your home screen, sign in, and turn notifications on here.</li>
          </ol>
        </>
      ) : state === "blocked" ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Notifications are blocked for Accountably on this device. Allow them in your
          browser or phone settings, then come back here.
        </p>
      ) : state === "unsupported" ? (
        <p className="mt-1 text-sm text-muted-foreground">
          This browser can&apos;t show notifications from websites.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">{what}</p>
          <Button size="touch" className="mt-3 w-full" disabled={busy} onClick={turnOn}>
            {busy ? "One moment…" : "Turn on notifications"}
          </Button>
        </>
      )}

      {compact && (
        <Button variant="ghost" size="touch" className="mt-1 w-full" onClick={dismiss}>
          Not now
        </Button>
      )}
    </Card>
  );
}
