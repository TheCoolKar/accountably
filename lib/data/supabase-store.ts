import {
  createClient,
  type AuthError,
  type PostgrestError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { clampCount, type GoalInput } from "@/lib/domain/goal";
import { PASSWORD_MIN } from "@/lib/domain/auth";
import { normaliseInviteCode } from "@/lib/domain/squad";
import type {
  ActivityEvent,
  ActivityMetadata,
  ActivityType,
  DateString,
  Goal,
  GoalType,
  Member,
  MemberRole,
  Squad,
} from "@/lib/domain/types";
import { StoreError, type Session, type Store } from "./store";

const ACTIVITY_LIMIT = 15;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

let client: SupabaseClient | null = null;

/** Browser client using the public key only. RLS does the authorising. */
function db(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new StoreError(
      "not_configured",
      "Accounts aren't set up on this copy of the app yet.",
    );
  }
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}

// Row shapes as selected below. Hand-written until types are generated from
// the linked project (`supabase gen types`).
interface SquadRow {
  id: string;
  name: string;
  timezone: string;
  created_by: string;
}
interface MemberRow {
  user_id: string;
  role: MemberRole;
  joined_at: string;
  left_at: string | null;
  profiles: { display_name: string } | null;
}
interface GoalRow {
  id: string;
  squad_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  goal_type: GoalType;
  target_count: number;
  completed_count: number;
  unit_label: string | null;
  locked_in_at: string | null;
  created_at: string;
  updated_at: string;
}
interface ActivityRow {
  id: string;
  actor_id: string;
  goal_id: string | null;
  event_type: ActivityType;
  metadata: ActivityMetadata | null;
  created_at: string;
}

interface NudgeRow {
  id: string;
  goal_id: string;
  sender_id: string;
  recipient_id: string;
  created_at: string;
}

const GOAL_COLUMNS =
  "id, squad_id, owner_id, title, description, goal_type, target_count, completed_count, unit_label, locked_in_at, created_at, updated_at";

function toSquad(row: SquadRow): Squad {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    createdBy: row.created_by,
  };
}

function toGoal(row: GoalRow, weekStart: DateString): Goal {
  return {
    id: row.id,
    squadId: row.squad_id,
    ownerId: row.owner_id,
    weekStart,
    title: row.title,
    description: row.description,
    goalType: row.goal_type,
    targetCount: row.target_count,
    completedCount: row.completed_count,
    unitLabel: row.unit_label,
    lockedInAt: row.locked_in_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const HISTORY_PAGE = 1000;

function toMembers(data: unknown): Member[] {
  // The embed is typed as an array by the untyped client; it is one row.
  return (data as MemberRow[]).map((row) => ({
    userId: row.user_id,
    displayName: row.profiles?.display_name ?? "Friend",
    role: row.role,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
  }));
}

function isNetworkFailure(message: string): boolean {
  return /failed to fetch|network|load failed|fetch failed/i.test(message);
}

function fromPostgrest(error: PostgrestError): StoreError {
  if (isNetworkFailure(error.message)) {
    return new StoreError("network", "You seem to be offline. Nothing was saved.");
  }
  // 42501: RLS or privilege refusal. With goal writes that means the goal
  // isn't yours or its week has ended.
  if (error.code === "42501") {
    return new StoreError(
      "not_allowed",
      "That can't be changed. The week may have ended, or it isn't yours to edit.",
    );
  }
  if (error.code === "22023") {
    return new StoreError("week_closed", error.message);
  }
  return new StoreError("unknown", "Something went wrong. Nothing was saved.");
}

function fromAuth(error: AuthError, fallback = "Couldn't sign you in. Try again."): StoreError {
  if (isNetworkFailure(error.message)) {
    return new StoreError("network", "You seem to be offline. Try again in a moment.");
  }
  switch (error.code) {
    case "invalid_credentials":
      return new StoreError("invalid_credentials", "That email and password don't match.");
    case "user_already_exists":
    case "email_exists":
      return new StoreError(
        "email_taken",
        "There's already an account with that email. Try signing in.",
      );
    case "weak_password":
      return new StoreError(
        "weak_password",
        `Pick a stronger password with at least ${PASSWORD_MIN} characters.`,
      );
    case "same_password":
      return new StoreError("weak_password", "Choose a different password from your current one.");
    case "email_not_confirmed":
      return new StoreError(
        "invalid_credentials",
        "Confirm your email first. Check your inbox for the link.",
      );
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return new StoreError("rate_limited", "Too many tries. Wait a minute and try again.");
    default:
      return new StoreError("unknown", fallback);
  }
}

function invalidResetLink(): StoreError {
  return new StoreError(
    "invalid_reset_link",
    "That reset link has expired or isn't valid. Request a new one below.",
  );
}

function fromPasswordReset(error: AuthError, fallback: string): StoreError {
  if (error.name === "AuthSessionMissingError") return invalidResetLink();
  switch (error.code) {
    case "otp_expired":
    case "bad_jwt":
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return invalidResetLink();
    default:
      return fromAuth(error, fallback);
  }
}

async function requireUserId(): Promise<string> {
  const { data } = await db().auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new StoreError("not_signed_in", "Sign in to continue.");
  return userId;
}

async function fetchSquad(squadId: string): Promise<Squad> {
  const { data, error } = await db()
    .from("squads")
    .select("id, name, timezone, created_by")
    .eq("id", squadId)
    .maybeSingle();
  if (error) throw fromPostgrest(error);
  if (!data) {
    throw new StoreError("not_allowed", "You're not in this squad any more.");
  }
  return toSquad(data as SquadRow);
}

/** Rows changed by a write, so a write refused by RLS never looks saved. */
function assertChanged(rows: unknown[] | null): void {
  if (!rows || rows.length === 0) {
    throw new StoreError(
      "not_allowed",
      "That can't be changed. The week may have ended, or it isn't yours to edit.",
    );
  }
}

export const supabaseStore: Store = {
  async getSession(): Promise<Session | null> {
    const { data } = await db().auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const { data: profile, error } = await db()
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw fromPostgrest(error);
    return {
      userId: user.id,
      displayName: (profile as { display_name: string } | null)?.display_name ?? "Friend",
      email: user.email ?? null,
    };
  },

  async signUp({ email, password, displayName }) {
    const { data, error } = await db().auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (error) throw fromAuth(error);
    return { needsEmailConfirmation: data.session === null };
  },

  async signIn({ email, password }) {
    const { error } = await db().auth.signInWithPassword({ email, password });
    if (error) throw fromAuth(error);
  },

  async requestPasswordReset(email) {
    const redirectTo = new URL("/auth/reset-password", window.location.origin).href;
    const { error } = await db().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw fromAuth(error, "Couldn't send a reset link. Try again.");
  },

  async checkPasswordResetSession() {
    const auth = db().auth;
    // Initialization processes the recovery tokens and removes them from the URL.
    // Check its error first: a failed link must not fall back to an older session.
    const { error: linkError } = await auth.initialize();
    if (linkError) {
      if (isNetworkFailure(linkError.message)) throw fromAuth(linkError);
      throw invalidResetLink();
    }
    const { data, error } = await auth.getSession();
    if (error) throw fromPasswordReset(error, "Couldn't check your reset link. Try again.");
    if (!data.session) throw invalidResetLink();
  },

  async updatePassword(password) {
    if (password.length < PASSWORD_MIN) {
      throw new StoreError(
        "weak_password",
        `Pick a password with at least ${PASSWORD_MIN} characters.`,
      );
    }
    const { error } = await db().auth.updateUser({ password });
    if (error) throw fromPasswordReset(error, "Couldn't update your password. Try again.");
  },

  async signOut() {
    const { error } = await db().auth.signOut();
    if (error) throw fromAuth(error);
  },

  async updateDisplayName(displayName) {
    const userId = await requireUserId();
    const { data, error } = await db()
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", userId)
      .select("id");
    if (error) throw fromPostgrest(error);
    assertChanged(data);
  },

  async getMySquads() {
    const supabase = db();
    const userId = await requireUserId();
    const mine = await supabase
      .from("squad_members")
      .select("squad_id")
      .eq("user_id", userId)
      .is("left_at", null)
      .order("joined_at", { ascending: true });
    if (mine.error) throw fromPostgrest(mine.error);
    const ids = (mine.data as { squad_id: string }[]).map((row) => row.squad_id);
    if (ids.length === 0) return [];

    const [squads, members] = await Promise.all([
      supabase.from("squads").select("id, name, timezone, created_by").in("id", ids),
      supabase
        .from("squad_members")
        .select("squad_id, user_id, profiles(display_name)")
        .in("squad_id", ids)
        .is("left_at", null)
        .order("joined_at", { ascending: true }),
    ]);
    if (squads.error) throw fromPostgrest(squads.error);
    if (members.error) throw fromPostgrest(members.error);

    // The embed is typed as an array by the untyped client; it is one row.
    const memberRows = members.data as unknown as {
      squad_id: string;
      user_id: string;
      profiles: { display_name: string } | null;
    }[];
    const byId = new Map((squads.data as SquadRow[]).map((row) => [row.id, row]));
    // Keep the order of my memberships, and skip anything RLS no longer shows.
    return ids.flatMap((id) => {
      const row = byId.get(id);
      if (!row) return [];
      return [
        {
          ...toSquad(row),
          otherMembers: memberRows
            .filter((member) => member.squad_id === id && member.user_id !== userId)
            .map((member) => member.profiles?.display_name ?? "Friend"),
        },
      ];
    });
  },

  async createSquad({ name, timezone }) {
    const { data, error } = await db().rpc("create_squad", {
      p_name: name.trim(),
      p_timezone: timezone,
    });
    if (error) throw fromPostgrest(error);
    return fetchSquad(data as string);
  },

  async joinSquad(code) {
    const { data, error } = await db().rpc("join_squad", {
      p_code: normaliseInviteCode(code),
    });
    if (error) throw fromPostgrest(error);
    const result = data as { ok: boolean; squad_id?: string; error?: string };
    if (!result.ok || !result.squad_id) {
      switch (result.error) {
        case "squad_full":
          throw new StoreError("squad_full", "That squad already has 5 people.");
        case "rate_limited":
          throw new StoreError(
            "rate_limited",
            "Too many tries. Wait 15 minutes, then check the code with your friend.",
          );
        default:
          throw new StoreError(
            "invalid_code",
            "That code didn't work. It may have expired. Ask your friend for a new one.",
          );
      }
    }
    return fetchSquad(result.squad_id);
  },

  async leaveSquad(squadId) {
    const { error } = await db().rpc("leave_squad", { p_squad_id: squadId });
    if (error) throw fromPostgrest(error);
  },

  async updateSquad(squadId, patch) {
    const { data, error } = await db()
      .from("squads")
      .update(patch)
      .eq("id", squadId)
      .select("id");
    if (error) throw fromPostgrest(error);
    if (!data || data.length === 0) {
      throw new StoreError("not_allowed", "Only the squad owner can change that.");
    }
  },

  async createInvite(squadId) {
    const { data, error } = await db().rpc("create_invite", { p_squad_id: squadId });
    if (error) throw fromPostgrest(error);
    const invite = data as { code: string; expires_at: string };
    return { code: invite.code, expiresAt: invite.expires_at };
  },

  async revokeInvites(squadId) {
    const { error } = await db().rpc("revoke_invites", { p_squad_id: squadId });
    if (error) throw fromPostgrest(error);
  },

  async getWeek(squadId, weekStart) {
    const supabase = db();
    // Two days back covers the 24-hour nudge window with room to spare.
    const nudgesSince = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const [squad, membersResult, weekResult, activityResult, nudgesResult] = await Promise.all([
      fetchSquad(squadId),
      supabase
        .from("squad_members")
        .select("user_id, role, joined_at, left_at, profiles(display_name)")
        .eq("squad_id", squadId)
        .order("joined_at", { ascending: true }),
      supabase
        .from("weeks")
        .select("id, timezone")
        .eq("squad_id", squadId)
        .eq("week_start_date", weekStart)
        .maybeSingle(),
      supabase
        .from("activity_events")
        .select("id, actor_id, goal_id, event_type, metadata, created_at")
        .eq("squad_id", squadId)
        .order("created_at", { ascending: false })
        .limit(ACTIVITY_LIMIT),
      // RLS returns only nudges I sent or received.
      supabase
        .from("nudges")
        .select("id, goal_id, sender_id, recipient_id, created_at")
        .eq("squad_id", squadId)
        .gt("created_at", nudgesSince),
    ]);
    if (nudgesResult.error) throw fromPostgrest(nudgesResult.error);
    if (membersResult.error) throw fromPostgrest(membersResult.error);
    if (weekResult.error) throw fromPostgrest(weekResult.error);
    if (activityResult.error) throw fromPostgrest(activityResult.error);

    const week = weekResult.data as { id: string; timezone: string } | null;
    let goals: Goal[] = [];
    if (week) {
      const { data, error } = await supabase
        .from("goals")
        .select(GOAL_COLUMNS)
        .eq("week_id", week.id)
        .order("created_at", { ascending: true });
      if (error) throw fromPostgrest(error);
      goals = (data as GoalRow[]).map((row) => toGoal(row, weekStart));
    }

    const members = toMembers(membersResult.data);

    const activity: ActivityEvent[] = (activityResult.data as ActivityRow[]).map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      goalId: row.goal_id,
      type: row.event_type,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
    }));

    return {
      squad,
      weekStart,
      timezone: week?.timezone ?? squad.timezone,
      members,
      goals,
      activity,
      nudges: (nudgesResult.data as NudgeRow[]).map((row) => ({
        id: row.id,
        goalId: row.goal_id,
        senderId: row.sender_id,
        recipientId: row.recipient_id,
        createdAt: row.created_at,
      })),
    };
  },

  async getHistory(squadId) {
    const supabase = db();
    const [squad, membersResult, weeksResult] = await Promise.all([
      fetchSquad(squadId),
      supabase
        .from("squad_members")
        .select("user_id, role, joined_at, left_at, profiles(display_name)")
        .eq("squad_id", squadId)
        .order("joined_at", { ascending: true }),
      supabase
        .from("weeks")
        .select("id, week_start_date, timezone")
        .eq("squad_id", squadId)
        .order("week_start_date", { ascending: true }),
    ]);
    if (membersResult.error) throw fromPostgrest(membersResult.error);
    if (weeksResult.error) throw fromPostgrest(weeksResult.error);

    // Goals come in pages: the API returns at most 1000 rows per request.
    const goalRows: (GoalRow & { week_id: string })[] = [];
    for (let from = 0; ; from += HISTORY_PAGE) {
      const { data, error } = await supabase
        .from("goals")
        .select(`week_id, ${GOAL_COLUMNS}`)
        .eq("squad_id", squadId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + HISTORY_PAGE - 1);
      if (error) throw fromPostgrest(error);
      const page = data as (GoalRow & { week_id: string })[];
      goalRows.push(...page);
      if (page.length < HISTORY_PAGE) break;
    }

    const weekRows = weeksResult.data as { id: string; week_start_date: string; timezone: string }[];
    const weeks = weekRows.map((week) => ({
      weekStart: week.week_start_date,
      timezone: week.timezone,
      goals: goalRows
        .filter((row) => row.week_id === week.id)
        .map((row) => toGoal(row, week.week_start_date)),
    }));
    return { squad, members: toMembers(membersResult.data), weeks };
  },

  subscribe(squadId, onChange, onStatus) {
    const supabase = db();
    const filter = `squad_id=eq.${squadId}`;
    const channel = supabase
      .channel(`squad:${squadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_events", filter },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "squad_members", filter },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "squads", filter: `id=eq.${squadId}` },
        onChange,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "nudges", filter },
        onChange,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          onStatus?.("connected");
          // Catch up on anything missed while the connection was down.
          onChange();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          onStatus?.("reconnecting");
        }
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  },

  async createGoal(squadId, weekStart, input: GoalInput) {
    const supabase = db();
    const userId = await requireUserId();
    const week = await supabase.rpc("ensure_week", {
      p_squad_id: squadId,
      p_week_start: weekStart,
    });
    if (week.error) throw fromPostgrest(week.error);

    const { data, error } = await supabase
      .from("goals")
      .insert({
        week_id: week.data as string,
        squad_id: squadId,
        owner_id: userId,
        title: input.title,
        description: input.description,
        goal_type: input.goalType,
        target_count: input.targetCount,
        unit_label: input.unitLabel,
      })
      .select(GOAL_COLUMNS)
      .single();
    if (error) throw fromPostgrest(error);
    return toGoal(data as GoalRow, weekStart);
  },

  async updateGoal(goalId, input) {
    const supabase = db();
    const current = await supabase
      .from("goals")
      .select("completed_count")
      .eq("id", goalId)
      .maybeSingle();
    if (current.error) throw fromPostgrest(current.error);
    if (!current.data) assertChanged(null);

    const { data, error } = await supabase
      .from("goals")
      .update({
        title: input.title,
        description: input.description,
        goal_type: input.goalType,
        target_count: input.targetCount,
        unit_label: input.unitLabel,
        // Lowering the target can't leave the count above it.
        completed_count: clampCount(
          (current.data as { completed_count: number }).completed_count,
          input.targetCount,
        ),
      })
      .eq("id", goalId)
      .select("id");
    if (error) throw fromPostgrest(error);
    assertChanged(data);
  },

  async deleteGoal(goalId) {
    const { data, error } = await db().from("goals").delete().eq("id", goalId).select("id");
    if (error) throw fromPostgrest(error);
    assertChanged(data);
  },

  async setProgress(goalId, completedCount) {
    const { data, error } = await db()
      .from("goals")
      .update({ completed_count: completedCount })
      .eq("id", goalId)
      .select("id");
    // 23514: the count fell outside 0..target (the target changed meanwhile).
    if (error?.code === "23514") {
      throw new StoreError("not_allowed", "That goal just changed. Take another look.");
    }
    if (error) throw fromPostgrest(error);
    assertChanged(data);
  },

  async lockIn(squadId, weekStart) {
    const { error } = await db().rpc("lock_in_week", {
      p_squad_id: squadId,
      p_week_start: weekStart,
    });
    if (error) throw fromPostgrest(error);
  },

  async sendNudge(goalId) {
    const { data, error } = await db().rpc("send_nudge", { p_goal_id: goalId });
    if (error) throw fromPostgrest(error);
    const result = data as { ok: boolean; error?: string };
    if (result.ok) return;
    switch (result.error) {
      case "cooldown":
        throw new StoreError(
          "cooldown",
          "You've nudged them three times today. More tomorrow.",
        );
      case "already_nudged":
        throw new StoreError("cooldown", "You've already nudged that goal today.");
      case "already_done":
        throw new StoreError("not_allowed", "They've already finished that one.");
      case "week_closed":
        throw new StoreError("week_closed", "That week has ended.");
      default:
        throw new StoreError("not_allowed", "That goal can't be nudged.");
    }
  },

  async savePushDevice(device) {
    const { error } = await db().rpc("save_push_subscription", {
      p_endpoint: device.endpoint,
      p_p256dh: device.p256dh,
      p_auth: device.auth,
      p_user_agent: device.userAgent,
    });
    if (error) throw fromPostgrest(error);
  },

  async removePushDevice(endpoint) {
    const { error } = await db().rpc("delete_push_subscription", { p_endpoint: endpoint });
    if (error) throw fromPostgrest(error);
  },
};
