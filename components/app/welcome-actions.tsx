"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getStore, isSupabaseConfigured } from "@/lib/data";

export function WelcomeActions() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    getStore()
      .getSession()
      .then((session) => {
        if (!cancelled && session) setSignedIn(true);
      })
      .catch(() => {
        // Not being able to check just leaves the sign-up buttons showing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (signedIn) {
    return (
      <Button asChild size="touch">
        <Link href="/squad">Open your squad</Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button asChild size="touch">
        <Link href="/auth?mode=signup&next=%2Fjoin%3Fnew%3D1">Create Squad</Link>
      </Button>
      <Button asChild size="touch" variant="outline">
        <Link href="/auth?mode=signup&next=%2Fjoin">Join Squad</Link>
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/auth?mode=signin"
          className="font-semibold text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
