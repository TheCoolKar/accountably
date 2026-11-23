import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/app/bits";
import { Dashboard } from "@/components/app/dashboard";

export const metadata: Metadata = { title: "Your squad · Accountably" };

export default function SquadPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
