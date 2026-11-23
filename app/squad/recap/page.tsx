import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/app/bits";
import { Recap } from "@/components/app/recap";

export const metadata: Metadata = { title: "Week recap · Accountably" };

export default function RecapPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Recap />
    </Suspense>
  );
}
