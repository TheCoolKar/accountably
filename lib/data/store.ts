import type { GoalInput } from "@/lib/domain/goal";
import type { StoredWeek } from "@/lib/domain/history";
import type { DateString, Goal, Member, Squad, WeekSnapshot } from "@/lib/domain/types";

export interface Session {
  userId: string;
  displayName: string;
  email: string | null;
}

/** A squad as shown in the list of my squads. */
export interface SquadSummary extends Squad {
  /** Display names of the other current members. */
  otherMembers: string[];
}

/** Raw material for the History and recap screens; lib/domain/history.ts does the maths. */
export interface SquadHistory {
  squad: Squad;
  /** Current and former members, oldest membership first. */
  members: Member[];
  /** Stored weeks in any order, including weeks planned ahead. */
  weeks: StoredWeek[];
}

export interface Invite {
  code: string;
  expiresAt: string;
}

/** What a browser hands back when notifications are turned on for a device. */
export interface PushDevice {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}

export type ConnectionStatus = "connected" | "reconnecting";

export type StoreErrorCode =
  | "not_configured"
  | "not_signed_in"
  | "invalid_credentials"
  | "email_taken"
  | "weak_password"
  | "invalid_reset_link"
  | "invalid_code"
  | "squad_full"
  | "rate_limited"
  | "week_closed"
  | "cooldown"
  | "not_allowed"
  | "network"
  | "unknown";

/** An error whose message is already written for the person using the app. */
export class StoreError extends Error {
  constructor(
    readonly code: StoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export function messageFor(error: unknown): string {
  if (error instanceof StoreError) return error.message;
  return "Something went wrong. Try again.";
}

/**
 * Everything the screens need from the backend. Screens depend on this
 * interface, not on Supabase directly.
 */
export interface Store {
  getSession(): Promise<Session | null>;
  signUp(input: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<{ needsEmailConfirmation: boolean }>;
  signIn(input: { email: string; password: string }): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  /** Waits for the email link to be processed; rejects missing or expired sessions. */
  checkPasswordResetSession(): Promise<void>;
  updatePassword(password: string): Promise<void>;
  signOut(): Promise<void>;
  updateDisplayName(displayName: string): Promise<void>;

  /** Every squad I'm currently in, oldest membership first. */
  getMySquads(): Promise<SquadSummary[]>;
  createSquad(input: { name: string; timezone: string }): Promise<Squad>;
  joinSquad(code: string): Promise<Squad>;
  leaveSquad(squadId: string): Promise<void>;
  updateSquad(
    squadId: string,
    patch: { name?: string; timezone?: string },
  ): Promise<void>;
  createInvite(squadId: string): Promise<Invite>;
  revokeInvites(squadId: string): Promise<void>;

  getWeek(squadId: string, weekStart: DateString): Promise<WeekSnapshot>;
  /** Every stored week of a squad with its goals, plus everyone who has been in it. Read-only. */
  getHistory(squadId: string): Promise<SquadHistory>;
  /** Calls `onChange` whenever squad data changes. Returns an unsubscribe function. */
  subscribe(
    squadId: string,
    onChange: () => void,
    onStatus?: (status: ConnectionStatus) => void,
  ): () => void;

  createGoal(squadId: string, weekStart: DateString, input: GoalInput): Promise<Goal>;
  updateGoal(goalId: string, input: GoalInput): Promise<void>;
  deleteGoal(goalId: string): Promise<void>;
  /** Sets the absolute count, so a repeated or retried call can't double-count. */
  setProgress(goalId: string, completedCount: number): Promise<void>;
  lockIn(squadId: string, weekStart: DateString): Promise<void>;

  /** Encourages a squadmate on one of their unfinished goals. Rate-limited per person. */
  sendNudge(goalId: string): Promise<void>;
  savePushDevice(device: PushDevice): Promise<void>;
  removePushDevice(endpoint: string): Promise<void>;
}
