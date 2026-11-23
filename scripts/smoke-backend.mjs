// End-to-end check of the live backend with throwaway accounts.
//
//   node scripts/smoke-backend.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local.
// Set SUPABASE_SERVICE_ROLE_KEY in the environment (never in a file) so the
// throwaway accounts and their squad are deleted afterwards.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const run = Math.random().toString(36).slice(2, 8);
const results = [];
let failed = 0;

function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed += 1;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function account(label) {
  const client = createClient(URL_, KEY, { auth: { persistSession: false } });
  const email = `smoke-${label}-${run}@accountably-test.dev`;
  const password = `pw-${run}-${label}-Zx9!`;
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: label.toUpperCase() } },
  });
  if (error) throw new Error(`sign-up ${label}: ${error.message}`);
  return { client, id: data.user.id, hasSession: Boolean(data.session), email, password };
}

function mondayOf(timeZone, offsetWeeks = 0) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (weekday - 1) + offsetWeeks * 7);
  return date.toISOString().slice(0, 10);
}

const ids = [];
let squadId = null;

try {
  const a = await account("a");
  const b = await account("b");
  const c = await account("c"); // never joins: the outsider
  ids.push(a.id, b.id, c.id);
  check("sign-up signs in straight away (no email confirmation)", a.hasSession && b.hasSession);

  // Sign-in with the password, on a fresh client.
  const fresh = createClient(URL_, KEY, { auth: { persistSession: false } });
  const signIn = await fresh.auth.signInWithPassword({ email: a.email, password: a.password });
  check("sign-in with email + password", !signIn.error && Boolean(signIn.data.session));
  const wrong = await fresh.auth.signInWithPassword({ email: a.email, password: "nope-nope-nope" });
  check("wrong password is refused", wrong.error?.code === "invalid_credentials", wrong.error?.code);

  const profile = await a.client.from("profiles").select("display_name").eq("id", a.id).single();
  check("profile created from sign-up name", profile.data?.display_name === "A");

  // Squad + invite + join
  const TZ = "America/Toronto";
  const created = await a.client.rpc("create_squad", { p_name: `Smoke ${run}`, p_timezone: TZ });
  squadId = created.data;
  check("create squad", !created.error && Boolean(squadId), created.error?.message);

  const badZone = await a.client.rpc("create_squad", { p_name: "x", p_timezone: "Mars/Olympus" });
  check("unknown time zone is refused", Boolean(badZone.error));

  const invite = await a.client.rpc("create_invite", { p_squad_id: squadId });
  const code = invite.data?.code;
  check("create invite", !invite.error && /^[A-Z2-9]{10}$/.test(code ?? ""), invite.error?.message);

  const outsiderInvite = await c.client.rpc("create_invite", { p_squad_id: squadId });
  check("outsider cannot create an invite", Boolean(outsiderInvite.error));

  const badJoin = await b.client.rpc("join_squad", { p_code: "AAAAAAAAAA" });
  check("wrong code is refused", badJoin.data?.ok === false && badJoin.data?.error === "invalid_code");

  const join = await b.client.rpc("join_squad", {
    p_code: `${code.slice(0, 5).toLowerCase()}-${code.slice(5)}`,
  });
  check("join with the code (lower case, dashed)", join.data?.ok === true, JSON.stringify(join.data));
  const joinAgain = await b.client.rpc("join_squad", { p_code: code });
  check("joining twice is harmless", joinAgain.data?.ok === true);

  const members = await b.client
    .from("squad_members")
    .select("user_id, role, profiles(display_name)")
    .eq("squad_id", squadId);
  check(
    "both members visible with names",
    members.data?.length === 2 && members.data.every((row) => row.profiles?.display_name),
    members.error?.message,
  );

  // Realtime: B listens while A works.
  let realtimeEvents = 0;
  const channel = b.client
    .channel(`squad:${squadId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "activity_events", filter: `squad_id=eq.${squadId}` },
      () => (realtimeEvents += 1),
    );
  await new Promise((resolve) => channel.subscribe((status) => status === "SUBSCRIBED" && resolve()));
  // The stream takes a moment to start after the channel reports ready.
  await sleep(2000);

  // Goals
  const weekStart = mondayOf(TZ);
  const week = await a.client.rpc("ensure_week", { p_squad_id: squadId, p_week_start: weekStart });
  check("open this week", !week.error && Boolean(week.data), week.error?.message);
  const pastWeek = await a.client.rpc("ensure_week", {
    p_squad_id: squadId,
    p_week_start: mondayOf(TZ, -1),
  });
  check("a past week cannot be opened", Boolean(pastWeek.error));
  const nextWeek = await a.client.rpc("ensure_week", {
    p_squad_id: squadId,
    p_week_start: mondayOf(TZ, 1),
  });
  check("next week can be opened", !nextWeek.error);

  const goalRow = (ownerId, extra) => ({
    week_id: week.data,
    squad_id: squadId,
    owner_id: ownerId,
    title: "Gym",
    goal_type: "one_time",
    target_count: 1,
    ...extra,
  });
  const oneTime = await a.client.from("goals").insert(goalRow(a.id)).select("id").single();
  const counted = await a.client
    .from("goals")
    .insert(goalRow(a.id, { title: "Study", goal_type: "counted", target_count: 3, unit_label: "sessions" }))
    .select("id")
    .single();
  check("add one-time and counted goals", !oneTime.error && !counted.error, oneTime.error?.message ?? counted.error?.message);

  const forged = await b.client.from("goals").insert(goalRow(a.id, { title: "Forged" })).select("id");
  check("cannot add a goal in someone else's name", Boolean(forged.error));
  const outsiderGoal = await c.client.from("goals").insert(goalRow(c.id)).select("id");
  check("outsider cannot add a goal", Boolean(outsiderGoal.error));

  const seenByB = await b.client.from("goals").select("id").eq("week_id", week.data);
  check("squadmate sees the goals", seenByB.data?.length === 2);
  const seenByC = await c.client.from("goals").select("id").eq("squad_id", squadId);
  const squadSeenByC = await c.client.from("squads").select("id").eq("id", squadId);
  const activitySeenByC = await c.client.from("activity_events").select("id").eq("squad_id", squadId);
  check(
    "outsider sees nothing (goals, squad, activity)",
    seenByC.data?.length === 0 && squadSeenByC.data?.length === 0 && activitySeenByC.data?.length === 0,
  );

  const progress = await a.client.from("goals").update({ completed_count: 2 }).eq("id", counted.data.id).select("id");
  check("owner logs progress", progress.data?.length === 1, progress.error?.message);
  const tooMany = await a.client.from("goals").update({ completed_count: 4 }).eq("id", counted.data.id).select("id");
  check("count cannot pass the target", Boolean(tooMany.error));
  const hijack = await b.client.from("goals").update({ completed_count: 3 }).eq("id", counted.data.id).select("id");
  check("squadmate cannot change my progress", !hijack.error && hijack.data?.length === 0);
  const hijackDelete = await b.client.from("goals").delete().eq("id", oneTime.data.id).select("id");
  check("squadmate cannot delete my goal", hijackDelete.data?.length === 0);

  await a.client.from("goals").update({ completed_count: 1 }).eq("id", oneTime.data.id);
  await a.client.from("goals").update({ completed_count: 0 }).eq("id", oneTime.data.id);
  await a.client.from("goals").update({ title: "Gym x1" }).eq("id", oneTime.data.id);
  const locked = await a.client.rpc("lock_in_week", { p_squad_id: squadId, p_week_start: weekStart });
  check("lock in", locked.data === 2, `locked ${locked.data}`);
  const lockedAgain = await a.client.rpc("lock_in_week", { p_squad_id: squadId, p_week_start: weekStart });
  check("locking in again changes nothing", lockedAgain.data === 0);
  await a.client.from("goals").delete().eq("id", oneTime.data.id);

  const feed = await b.client
    .from("activity_events")
    .select("event_type")
    .eq("squad_id", squadId)
    .order("created_at", { ascending: true });
  const types = (feed.data ?? []).map((row) => row.event_type).join(",");
  check(
    "activity feed records every change in order",
    types.startsWith(
      "goal_created,goal_created,progress_updated,goal_completed,goal_reopened,goal_edited,locked_in,goal_deleted",
    ),
    types,
  );
  const forgedEvent = await a.client
    .from("activity_events")
    .insert({ squad_id: squadId, actor_id: a.id, event_type: "goal_completed" });
  check("clients cannot write activity directly", Boolean(forgedEvent.error));

  await sleep(2500);
  check("realtime delivered the changes to the squadmate", realtimeEvents >= 8, `${realtimeEvents} events`);
  await b.client.removeChannel(channel);

  // Nudges
  const bGoal = await b.client.from("goals").insert(goalRow(b.id, { title: "Read" })).select("id").single();
  const nudge = await a.client.rpc("send_nudge", { p_goal_id: bGoal.data.id });
  check("nudge a squadmate's unfinished goal", nudge.data?.ok === true, JSON.stringify(nudge.data ?? nudge.error));
  const nudgeAgain = await a.client.rpc("send_nudge", { p_goal_id: bGoal.data.id });
  check("the same goal can't be nudged twice in a day", nudgeAgain.data?.error === "already_nudged", JSON.stringify(nudgeAgain.data));
  const moreGoals = await b.client
    .from("goals")
    .insert(["Second", "Third", "Fourth"].map((title) => goalRow(b.id, { title })))
    .select("id");
  const [second, third, fourth] = moreGoals.data.map((row) => row.id);
  const nudge2 = await a.client.rpc("send_nudge", { p_goal_id: second });
  const nudge3 = await a.client.rpc("send_nudge", { p_goal_id: third });
  check("three different goals can be nudged in a day", nudge2.data?.ok === true && nudge3.data?.ok === true, JSON.stringify([nudge2.data, nudge3.data]));
  const nudge4 = await a.client.rpc("send_nudge", { p_goal_id: fourth });
  check("a fourth nudge to the same person waits", nudge4.data?.error === "cooldown" && Boolean(nudge4.data?.next_at), JSON.stringify(nudge4.data));
  const selfNudge = await a.client.rpc("send_nudge", { p_goal_id: counted.data.id });
  check("cannot nudge your own goal", selfNudge.data?.error === "own_goal");
  const outsiderNudge = await c.client.rpc("send_nudge", { p_goal_id: bGoal.data.id });
  check("outsider cannot nudge", Boolean(outsiderNudge.error));
  await a.client.from("goals").update({ completed_count: 3 }).eq("id", counted.data.id);
  const doneNudge = await b.client.rpc("send_nudge", { p_goal_id: counted.data.id });
  check("a finished goal cannot be nudged", doneNudge.data?.error === "already_done", JSON.stringify(doneNudge.data));
  const nudgesForB = await b.client.from("nudges").select("id");
  const nudgesForC = await c.client.from("nudges").select("id");
  check("only the two people involved see a nudge", nudgesForB.data?.length === 3 && nudgesForC.data?.length === 0);

  // Push pipeline. B signs up a device whose address no push service knows,
  // so a real delivery attempt comes back "gone" and the device is forgotten.
  // That exercises trigger → outbox → edge function → Web Push → clean-up.
  const { createECDH, randomBytes } = await import("node:crypto");
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const fakeEndpoint = `https://updates.push.services.mozilla.com/wpush/v2/smoke-${run}-${randomBytes(24).toString("base64url")}`;
  const saved = await b.client.rpc("save_push_subscription", {
    p_endpoint: fakeEndpoint,
    p_p256dh: ecdh.getPublicKey().toString("base64url"),
    p_auth: randomBytes(16).toString("base64url"),
    p_user_agent: "smoke-test",
  });
  check("turn notifications on for a device", !saved.error, saved.error?.message);
  const spy = await a.client.from("push_subscriptions").select("id");
  check("nobody else can read a device's keys", spy.data?.length === 0);
  const outboxDirect = await a.client.from("notification_outbox").select("id");
  check("clients cannot read the outbox", Boolean(outboxDirect.error) || outboxDirect.data?.length === 0);
  const claim = await a.client.rpc("claim_notifications", { p_secret: "guess", p_limit: 1 });
  check("clients cannot claim notifications", Boolean(claim.error));
  const noSecret = await fetch(`${URL_}/functions/v1/push-dispatch`, { method: "POST" });
  const badSecret = await fetch(`${URL_}/functions/v1/push-dispatch`, {
    method: "POST",
    headers: { "x-dispatch-secret": "guess" },
  });
  check("the dispatch function refuses strangers", noSecret.status === 401 && badSecret.status === 401, `${noSecret.status}/${badSecret.status}`);

  // A finishes a goal → B should be notified.
  const trigger = await a.client.from("goals").insert(goalRow(a.id, { title: "Push test" })).select("id").single();
  await a.client.from("goals").update({ completed_count: 1 }).eq("id", trigger.data.id);
  let deviceForgotten = false;
  for (let i = 0; i < 15 && !deviceForgotten; i++) {
    await sleep(1000);
    const left = await b.client.from("push_subscriptions").select("id");
    deviceForgotten = left.data?.length === 0;
  }
  check("a finished goal reaches the push service, and a dead device is forgotten", deviceForgotten);

  // Which events notify the squad. Needs the service key to read the outbox.
  if (SERVICE) {
    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const device = (label) => ({
      p_endpoint: `https://updates.push.services.mozilla.com/wpush/v2/smoke-${run}-${label}-${randomBytes(18).toString("base64url")}`,
      p_p256dh: ecdh.getPublicKey().toString("base64url"),
      p_auth: randomBytes(16).toString("base64url"),
      p_user_agent: "smoke-test",
    });
    // The dead device is forgotten after each send, so sign one up afresh each time.
    const notifiedBy = async (label, action) => {
      await b.client.rpc("save_push_subscription", device(label));
      const before = await admin.from("notification_outbox").select("id").eq("user_id", b.id).order("id", { ascending: false }).limit(1);
      const lastId = before.data?.[0]?.id ?? 0;
      await action();
      await sleep(400);
      const after = await admin.from("notification_outbox").select("body, url, tag").eq("user_id", b.id).gt("id", lastId).order("id");
      return after.data ?? [];
    };
    const expectOne = (name, rows, pattern, tagged) =>
      check(
        name,
        rows.length === 1 &&
          pattern.test(rows[0].body) &&
          rows[0].url === `/squad?id=${squadId}` &&
          Boolean(rows[0].tag) === tagged,
        JSON.stringify(rows),
      );

    let steps;
    expectOne(
      "notifies: goal added",
      await notifiedBy("add", async () => {
        steps = await a.client.from("goals").insert(goalRow(a.id, { title: "Steps", goal_type: "counted", target_count: 3 })).select("id").single();
      }),
      /^A added a goal: “Steps”$/,
      true,
    );
    const setSteps = (count) => () => a.client.from("goals").update({ completed_count: count }).eq("id", steps.data.id);
    expectOne("notifies: a step forward on a counted goal", await notifiedBy("step1", setSteps(1)), /^A is at 1 of 3 on “Steps”$/, false);
    expectOne("notifies: every further step", await notifiedBy("step2", setSteps(2)), /^A is at 2 of 3 on “Steps”$/, false);
    const back = await notifiedBy("back", setSteps(1));
    check("stays quiet: a count taken back down", back.length === 0, JSON.stringify(back));
    await setSteps(2)();
    expectOne("notifies: goal finished", await notifiedBy("done", setSteps(3)), /^A finished “Steps”$/, false);
    const reopened = await notifiedBy("reopen", setSteps(2));
    check("stays quiet: a finished goal reopened", reopened.length === 0, JSON.stringify(reopened));
    expectOne("notifies: finished again after reopening", await notifiedBy("redone", setSteps(3)), /^A finished “Steps”$/, false);
    const edited = await notifiedBy("edit", () => a.client.from("goals").update({ title: "Steps!" }).eq("id", steps.data.id));
    check("stays quiet: an edit", edited.length === 0, JSON.stringify(edited));
    const removed = await notifiedBy("remove", () => a.client.from("goals").delete().eq("id", steps.data.id));
    check("stays quiet: a removal", removed.length === 0, JSON.stringify(removed));
    const own = await admin.from("notification_outbox").select("id").eq("user_id", a.id);
    check("never notifies the person who did it", (own.data ?? []).length === 0);
  }

  // Progress follows you across squads: the same goal (title, type, target)
  // in the same week of another of your squads gets the same count.
  const s2 = await a.client.rpc("create_squad", { p_name: `Smoke ${run} two`, p_timezone: "Europe/London" });
  const w2 = await a.client.rpc("ensure_week", { p_squad_id: s2.data, p_week_start: weekStart });
  const inS2 = (extra) => ({
    week_id: w2.data, squad_id: s2.data, owner_id: a.id, goal_type: "counted", target_count: 3, ...extra,
  });
  const here = await a.client.from("goals").insert(goalRow(a.id, { title: "Sync", goal_type: "counted", target_count: 3 })).select("id").single();
  const there = await a.client.from("goals").insert(inS2({ title: " sync " })).select("id").single();
  const otherTarget = await a.client.from("goals").insert(inS2({ title: "Sync", target_count: 5 })).select("id").single();
  const mates = await b.client.from("goals").insert(goalRow(b.id, { title: "Sync", goal_type: "counted", target_count: 3 })).select("id").single();
  const countOf = async (client, id) => (await client.from("goals").select("completed_count").eq("id", id).single()).data?.completed_count;
  await a.client.from("goals").update({ completed_count: 2 }).eq("id", here.data.id);
  check("a step is copied to the same goal in my other squad", (await countOf(a.client, there.data.id)) === 2);
  check("a goal with a different target is left alone", (await countOf(a.client, otherTarget.data.id)) === 0);
  check("a squadmate's goal with the same title is left alone", (await countOf(b.client, mates.data.id)) === 0);
  await a.client.from("goals").update({ completed_count: 3 }).eq("id", there.data.id);
  check("it works in both directions", (await countOf(a.client, here.data.id)) === 3);
  const s2Feed = await a.client.from("activity_events").select("event_type").eq("goal_id", there.data.id);
  check("the other squad sees it in its feed", (s2Feed.data ?? []).some((row) => row.event_type === "progress_updated"));

  // Owner-only and leaving
  const renameByB = await b.client.from("squads").update({ name: "Hijacked" }).eq("id", squadId).select("id");
  check("member cannot rename the squad", renameByB.data?.length === 0);
  const renameByA = await a.client.from("squads").update({ name: `Smoke ${run}!` }).eq("id", squadId).select("id");
  check("owner renames the squad", renameByA.data?.length === 1, renameByA.error?.message);
  const revokeByB = await b.client.rpc("revoke_invites", { p_squad_id: squadId });
  check("member cannot cancel invites", Boolean(revokeByB.error));
  await a.client.rpc("revoke_invites", { p_squad_id: squadId });
  const afterRevoke = await c.client.rpc("join_squad", { p_code: code });
  check("cancelled invite stops working", afterRevoke.data?.ok === false);

  const leave = await a.client.rpc("leave_squad", { p_squad_id: squadId });
  const afterLeave = await a.client.from("goals").select("id").eq("squad_id", squadId);
  check("leaving removes access immediately", !leave.error && afterLeave.data?.length === 0, leave.error?.message);
  const newOwner = await b.client.from("squad_members").select("role").eq("squad_id", squadId).eq("user_id", b.id).single();
  check("ownership passes on when the owner leaves", newOwner.data?.role === "owner");

} catch (error) {
  check("script ran to the end", false, error.message);
} finally {
  if (SERVICE) {
    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const problems = [];
    const note = (what, error) => error && problems.push(`${what}: ${error.message}`);
    const squads = await admin.from("squads").select("id").in("created_by", ids);
    note("list squads", squads.error);
    for (const row of squads.data ?? []) {
      note("delete squad", (await admin.from("squads").delete().eq("id", row.id)).error);
    }
    for (const id of ids) note("delete account", (await admin.auth.admin.deleteUser(id)).error);
    check("cleanup: throwaway accounts and squads deleted", problems.length === 0, problems.join("; "));
  } else {
    results.push("cleanup SKIPPED: set SUPABASE_SERVICE_ROLE_KEY to delete the throwaway accounts");
  }
  console.log(results.join("\n"));
  console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}
