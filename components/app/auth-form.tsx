"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStore, isSupabaseConfigured, messageFor } from "@/lib/data";
import { startFresh } from "@/lib/navigate";
import { DISPLAY_NAME_MAX } from "@/lib/domain/squad";
import { PASSWORD_MIN } from "@/lib/domain/auth";

/** Only follow redirects that stay inside the app. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/squad";
}

export function AuthForm() {
  const params = useSearchParams();
  const mode = params.get("mode") === "signin" ? "signin" : "signup";
  const next = safeNext(params.get("next"));

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);

  const otherMode = mode === "signup" ? "signin" : "signup";
  const otherHref = `/auth?mode=${otherMode}&next=${encodeURIComponent(next)}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (mode === "signup" && displayName.trim().length === 0) {
      setError("Add the name your friends know you by.");
      return;
    }
    if (mode === "signup" && password.length < PASSWORD_MIN) {
      setError(`Pick a password with at least ${PASSWORD_MIN} characters.`);
      return;
    }

    setBusy(true);
    try {
      const store = getStore();
      if (mode === "signup") {
        const result = await store.signUp({ email: email.trim(), password, displayName });
        if (result.needsEmailConfirmation) {
          setConfirmEmail(true);
          return;
        }
      } else {
        await store.signIn({ email: email.trim(), password });
      }
      setPassword("");
      startFresh(next);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  if (confirmEmail) {
    return (
      <main className="flex flex-1 flex-col gap-4 pt-6">
          <h1 className="font-heading text-3xl font-bold tracking-tight">Check your email</h1>
        <p className="text-muted-foreground">
          We sent a link to <span className="font-semibold text-foreground">{email}</span>. Open
          it to confirm your account, then come back and sign in.
        </p>
        <Button asChild size="touch" className="mt-2">
          <Link href={`/auth?mode=signin&next=${encodeURIComponent(next)}`}>Go to sign in</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 pt-6">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {mode === "signup"
            ? "Then you'll start a squad or join one."
            : "Sign in to see how your squad is doing."}
        </p>
      </div>

      {!isSupabaseConfigured && (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          Accounts aren&apos;t connected on this copy of the app yet.
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {mode === "signup" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="display-name">Your name</Label>
            <Input
              id="display-name"
              className="h-12"
              value={displayName}
              maxLength={DISPLAY_NAME_MAX}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="nickname"
              placeholder="What your friends call you"
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            className="h-12"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            className="h-12"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
          />
          {mode === "signup" && (
            <p className="text-sm text-muted-foreground">At least {PASSWORD_MIN} characters.</p>
          )}
          {mode === "signin" && (
            <Link
              href="/auth/forgot-password"
              className="self-end py-2 text-sm font-semibold underline underline-offset-4"
            >
              Forgot password?
            </Link>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="touch" disabled={busy || !isSupabaseConfigured}>
          {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
        <Link
          href={otherHref}
          className="font-semibold text-foreground underline underline-offset-4"
        >
          {mode === "signup" ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </main>
  );
}
