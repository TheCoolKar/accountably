import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/app/bits";
import { History } from "@/components/app/history";

export const metadata: Metadata = { title: "History · Accountably" };

export default function HistoryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <History />
    </Suspense>
  );
}
