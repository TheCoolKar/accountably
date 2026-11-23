// Delivers waiting notifications with Web Push.
//
// Called by the database (pg_net) whenever rows are added to
// notification_outbox. It decides nothing itself: recipients and wording come
// from the outbox. Its jobs are to claim rows exactly once, send them, and
// forget devices that have unsubscribed.
//
// Secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

interface Claimed {
  id: number;
  title: string;
  body: string;
  url: string;
  tag: string | null;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const BATCH = 100;
const MAX_BATCHES = 10;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  const secret = request.headers.get("x-dispatch-secret");
  if (!secret) return json({ error: "missing secret" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  let sent = 0;
  let failed = 0;
  const gone = new Set<string>();

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await supabase.rpc("claim_notifications", {
      p_secret: secret,
      p_limit: BATCH,
    });
    if (error) {
      // 42501: the secret didn't match.
      return json({ error: error.message }, error.code === "42501" ? 401 : 500);
    }
    const rows = (data ?? []) as Claimed[];
    if (rows.length === 0) break;

    await Promise.all(
      rows.map(async (row) => {
        if (gone.has(row.subscription_id)) return;
        try {
          await webpush.sendNotification(
            { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
            JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.tag }),
            // If the phone is off, the push service holds it for up to a day.
            { TTL: 60 * 60 * 24, urgency: "normal" },
          );
          sent += 1;
        } catch (caught) {
          const status = (caught as { statusCode?: number }).statusCode;
          // 404/410: the browser has dropped this subscription for good.
          if (status === 404 || status === 410) gone.add(row.subscription_id);
          else {
            failed += 1;
            console.error(`push failed (${status ?? "no status"}) for ${new URL(row.endpoint).host}`);
          }
        }
      }),
    );
  }

  if (gone.size > 0) {
    const { error } = await supabase.from("push_subscriptions").delete().in("id", [...gone]);
    if (error) console.error(`could not remove dead subscriptions: ${error.message}`);
  }

  return json({ sent, failed, removed: gone.size });
});
