import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/app/bits";
import { Settings } from "@/components/app/settings";

export const metadata: Metadata = { title: "Squad settings · Accountably" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings />
    </Suspense>
  );
}
