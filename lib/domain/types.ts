/** A calendar date with no time or zone, formatted YYYY-MM-DD. */
export type DateString = string;

export type GoalType = "one_time" | "counted";

export interface Goal {
  id: string;
  squadId: string;
  ownerId: string;
  weekStart: DateString;
  title: string;
  description: string | null;
  goalType: GoalType;
  targetCount: number;
  completedCount: number;
  unitLabel: string | null;
  lockedInAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MemberRole = "owner" | "member";

export interface Member {
  userId: string;
  displayName: string;
  role: MemberRole;
  joinedAt: string;
  /** Set when the person has left; they only appear on weeks where they had goals. */
  leftAt: string | null;
}

export interface Squad {
  id: string;
  name: string;
  /** IANA time zone. Week boundaries use this, never the device zone. */
  timezone: string;
  createdBy: string;
}

export type ActivityType =
  | "goal_created"
  | "goal_edited"
  | "goal_deleted"
  | "progress_updated"
  | "goal_completed"
  | "goal_reopened"
  | "locked_in";

export interface ActivityMetadata {
  title?: string;
  completed_count?: number;
  /** The count before this change. Absent on events recorded before 2026-11-16. */
  previous_count?: number;
  target_count?: number;
  goal_count?: number;
}

export interface ActivityEvent {
  id: string;
  actorId: string;
  goalId: string | null;
  type: ActivityType;
  metadata: ActivityMetadata;
  createdAt: string;
}

/** A supportive tap on a squadmate's unfinished goal. Only the two people involved can see it. */
export interface Nudge {
  id: string;
  goalId: string;
  senderId: string;
  recipientId: string;
  createdAt: string;
}

export interface WeekSnapshot {
  squad: Squad;
  weekStart: DateString;
  /** Zone this week's boundaries were fixed in (squad zone when the week was created). */
  timezone: string;
  members: Member[];
  goals: Goal[];
  activity: ActivityEvent[];
  /** Recent nudges I sent or received. */
  nudges: Nudge[];
}
