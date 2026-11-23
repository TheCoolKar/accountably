"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStore, isSupabaseConfigured, messageFor } from "@/lib/data";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await getStore().requestPasswordReset(email);
      setSent(true);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 pt-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {sent ? "Check your email" : "Forgot your password?"}
        </h1>
        <p className="mt-1 text-muted-foreground" role={sent ? "status" : undefined}>
          {sent ? (
            <>
              If there&apos;s an account for{" "}
              <span className="break-all font-semibold text-foreground">{email.trim()}</span>,
              you&apos;ll get a link to reset your password. Check your spam folder too.
            </>
          ) : (
            "Enter your account email and we'll send you a reset link."
          )}
        </p>
      </div>

      {sent ? (
        <Button type="button" variant="outline" size="touch" onClick={() => setSent(false)}>
          Try another email
        </Button>
      ) : (
        <>
          {!isSupabaseConfigured && (
            <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
              Accounts aren&apos;t connected on this copy of the app yet.
            </p>
          )}
          <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={busy}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                name="email"
                className="h-12"
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                disabled={busy}
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" size="touch" disabled={busy || !isSupabaseConfigured}>
              {busy ? "Sending link…" : "Send reset link"}
            </Button>
          </form>
        </>
      )}

      <Link
        href="/auth?mode=signin"
        className="py-2 text-center text-sm font-semibold underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </main>
  );
}
