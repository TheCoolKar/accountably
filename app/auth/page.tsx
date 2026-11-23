import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/app/auth-form";
import { PageSkeleton } from "@/components/app/bits";

export const metadata: Metadata = { title: "Sign in · Accountably" };

export default function AuthPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AuthForm />
    </Suspense>
  );
}
