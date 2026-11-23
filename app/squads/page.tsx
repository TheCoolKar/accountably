import type { Metadata } from "next";
import { SquadsList } from "@/components/app/squads-list";

export const metadata: Metadata = { title: "Your squads · Accountably" };

export default function SquadsPage() {
  return <SquadsList />;
}
