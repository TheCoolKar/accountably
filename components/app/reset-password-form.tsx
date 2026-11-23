"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStore, messageFor, StoreError } from "@/lib/data";
import { PASSWORD_MIN } from "@/lib/domain/auth";
import { startFresh } from "@/lib/navigate";

export function ResetPasswordForm() {
  const [status, setStatus] = useState<"checking" | "ready" | "error" | "saved">("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getStore().checkPasswordResetSession().then(
      () => {
        if (active) setStatus("ready");
      },
      (caught) => {
        if (!active) return;
        setError(messageFor(caught));
        setStatus("error");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || status !== "ready") return;
    setError(null);
    if (password.length < PASSWORD_MIN) {
      setError(`Pick a password with at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError("Those passwords don't match. Try again.");
      return;
    }
    setBusy(true);
    try {
      await getStore().updatePassword(password);
      setPassword("");
      setConfirmation("");
      setStatus("saved");
    } catch (caught) {
      setError(messageFor(caught));
      if (caught instanceof StoreError && caught.code === "invalid_reset_link") {
        setPassword("");
        setConfirmation("");
        setStatus("error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 pt-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {status === "saved"
            ? "Password updated"
            : status === "error"
              ? "Let's get you a new link"
              : "Set a new password"}
        </h1>
        <p className="mt-1 text-muted-foreground" role="status">
          {status === "checking"
            ? "Checking your reset link…"
            : status === "saved"
              ? "You're all set. Use your new password next time you sign in."
              : status === "ready"
                ? "Choose a password you haven't used before."
                : "Request another reset link to try again."}
        </p>
      </div>

      {status === "ready" && (
        <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={busy}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              name="password"
              className="h-12"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              aria-describedby="password-help"
              minLength={PASSWORD_MIN}
              disabled={busy}
              required
            />
            <p id="password-help" className="text-sm text-muted-foreground">
              At least {PASSWORD_MIN} characters.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              name="password-confirmation"
              className="h-12"
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
              disabled={busy}
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="touch" disabled={busy}>
            {busy ? "Saving password…" : "Save new password"}
          </Button>
        </form>
      )}

      {status === "error" && (
        <>
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button asChild size="touch">
            <Link href="/auth/forgot-password">Request another link</Link>
          </Button>
        </>
      )}

      {status === "saved" ? (
        <Button type="button" size="touch" onClick={() => startFresh("/squad")}>
          Continue to your squad
        </Button>
      ) : (
        <Link
          href="/auth?mode=signin"
          className="py-2 text-center text-sm font-semibold underline underline-offset-4"
        >
          Back to sign in
        </Link>
      )}
    </main>
  );
}
