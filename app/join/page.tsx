import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/app/bits";
import { JoinFlow } from "@/components/app/join-flow";

export const metadata: Metadata = { title: "Join a squad · Accountably" };

export default function JoinPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JoinFlow />
    </Suspense>
  );
}
