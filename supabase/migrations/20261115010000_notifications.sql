-- Push notifications, nudges, and the Sunday lock-in prompt.
--
-- How a notification travels:
--   1. Something happens in the database (a goal is added or finished, a nudge
--      is sent, or the hourly clock finds a squad whose Sunday evening it is).
--   2. A row per recipient goes into notification_outbox. Who is told, and the
--      wording, are decided here in SQL.
--   3. pg_net pings the `push-dispatch` edge function, which claims the unsent
--      rows and delivers them with Web Push.
-- Clients never write to the outbox and never call the edge function.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.config (
  key text primary key,
  value text not null
);

insert into private.config (key, value) values
  -- Change this row if the project moves.
  ('dispatch_url', 'https://uyiawlmqzrgerhcfyjdi.supabase.co/functions/v1/push-dispatch'),
  -- Shared between the database and the edge function; generated here so it is
  -- never written down anywhere else.
  ('dispatch_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per browser or home-screen app that has notifications turned on.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/squad',
  -- Notifications with the same tag replace each other on the device.
  tag text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index notification_outbox_unclaimed on public.notification_outbox (id)
  where claimed_at is null;

-- A supportive tap on a squadmate's unfinished goal.
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index nudges_pair on public.nudges (sender_id, recipient_id, created_at desc);
create index nudges_goal on public.nudges (goal_id);

-- Which squads have already had their Sunday prompt for a given week.
create table public.weekly_prompts (
  squad_id uuid not null references public.squads (id) on delete cascade,
  week_start_date date not null,
  sent_at timestamptz not null default now(),
  primary key (squad_id, week_start_date)
);

alter table public.push_subscriptions enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.nudges enable row level security;
alter table public.weekly_prompts enable row level security;

revoke all on public.push_subscriptions, public.notification_outbox, public.nudges,
  public.weekly_prompts from anon, authenticated;

-- A device's keys are only ever shown to their owner; writes go through the
-- functions below. The outbox and weekly_prompts have no client access at all.
grant select on public.push_subscriptions to authenticated;
create policy "push_subscriptions: read own"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- A nudge is between two people: only they can see it.
grant select on public.nudges to authenticated;
create policy "nudges: sender and recipient read"
  on public.nudges for select to authenticated
  using (
    public.is_active_member(squad_id)
    and (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Outbox helpers (private: not reachable through the API)
-- ---------------------------------------------------------------------------

create function private.enqueue(
  p_user_id uuid, p_title text, p_body text, p_url text, p_tag text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- Nothing to deliver to if the person has no device signed up.
  if exists (select 1 from public.push_subscriptions s where s.user_id = p_user_id) then
    insert into public.notification_outbox (user_id, title, body, url, tag)
    values (p_user_id, left(p_title, 80), left(p_body, 200), p_url, p_tag);
  end if;
end;
$$;

-- Asks the edge function to deliver whatever is waiting. Never allowed to fail
-- the write that caused it: a missed ping is picked up by the next one.
create function private.kick_dispatch()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.notification_outbox where claimed_at is null) then
    return;
  end if;
  select value into v_url from private.config where key = 'dispatch_url';
  select value into v_secret from private.config where key = 'dispatch_secret';
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', v_secret
    )
  );
exception when others then
  raise warning 'push dispatch ping failed: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Squad activity → notifications
-- ---------------------------------------------------------------------------

create function public.activity_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor text;
  v_squad text;
  v_goal text := coalesce(new.metadata ->> 'title', 'a goal');
  v_body text;
  v_tag text;
  v_member record;
begin
  if new.event_type not in ('goal_created', 'goal_completed') then
    return null;
  end if;

  select p.display_name into v_actor from public.profiles p where p.id = new.actor_id;
  select s.name into v_squad from public.squads s where s.id = new.squad_id;

  if new.event_type = 'goal_completed' then
    v_body := v_actor || ' finished “' || v_goal || '”';
    v_tag := 'done:' || coalesce(new.goal_id::text, new.id::text);
  else
    v_body := v_actor || ' added a goal: “' || v_goal || '”';
    -- Someone adding several goals in a row updates one notification
    -- instead of stacking four.
    v_tag := 'added:' || new.actor_id::text;
  end if;

  for v_member in
    select m.user_id from public.squad_members m
    where m.squad_id = new.squad_id and m.left_at is null and m.user_id <> new.actor_id
  loop
    perform private.enqueue(v_member.user_id, v_squad, v_body, '/squad', v_tag);
  end loop;

  perform private.kick_dispatch();
  return null;
end;
$$;

create trigger activity_notify
  after insert on public.activity_events
  for each row execute function public.activity_notify();

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Turns notifications on for this device. If the device was signed up under
-- another account (shared phone), it moves to the current one.
create function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 2000 then
    raise exception 'Invalid push endpoint' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_user, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent;

  -- Keep at most 10 devices per person.
  delete from public.push_subscriptions s
  where s.user_id = v_user
    and s.id not in (
      select id from public.push_subscriptions
      where user_id = v_user order by created_at desc limit 10
    );
end;
$$;

create function public.delete_push_subscription(p_endpoint text)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

-- Sends a nudge on a squadmate's unfinished goal.
-- Returns {ok: true} or {ok: false, error, next_at?}.
create function public.send_nudge(p_goal_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  -- One nudge per sender → recipient in this window. Matches
  -- NUDGE_COOLDOWN_HOURS in lib/domain/nudge.ts.
  v_cooldown constant interval := interval '24 hours';
  v_goal public.goals;
  v_last timestamptz;
  v_sender text;
  v_squad text;
begin
  select g.* into v_goal from public.goals g where g.id = p_goal_id;

  if v_goal.id is null or not public.is_active_member(v_goal.squad_id) then
    raise exception 'Not a member of this squad' using errcode = '42501';
  end if;
  if v_goal.owner_id = v_user then
    return jsonb_build_object('ok', false, 'error', 'own_goal');
  end if;
  if not exists (
    select 1 from public.squad_members m
    where m.squad_id = v_goal.squad_id and m.user_id = v_goal.owner_id and m.left_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_in_squad');
  end if;
  if not public.week_is_open(v_goal.week_id) then
    return jsonb_build_object('ok', false, 'error', 'week_closed');
  end if;
  if v_goal.completed_count >= v_goal.target_count then
    return jsonb_build_object('ok', false, 'error', 'already_done');
  end if;

  select max(n.created_at) into v_last
  from public.nudges n
  where n.sender_id = v_user and n.recipient_id = v_goal.owner_id;
  if v_last is not null and v_last > now() - v_cooldown then
    return jsonb_build_object('ok', false, 'error', 'cooldown', 'next_at', v_last + v_cooldown);
  end if;

  insert into public.nudges (squad_id, goal_id, sender_id, recipient_id)
  values (v_goal.squad_id, v_goal.id, v_user, v_goal.owner_id);

  select p.display_name into v_sender from public.profiles p where p.id = v_user;
  select s.name into v_squad from public.squads s where s.id = v_goal.squad_id;
  perform private.enqueue(
    v_goal.owner_id,
    v_squad,
    v_sender || ' is cheering you on: “' || v_goal.title || '”',
    '/squad',
    'nudge:' || v_user::text
  );
  perform private.kick_dispatch();

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The clock
-- ---------------------------------------------------------------------------
-- Weeks roll over by date alone (see week_is_open), so nothing has to "close"
-- a week. The clock's only job is the Sunday-evening prompt: once per squad per
-- week, from 18:00 Sunday in the squad's zone, to members who haven't yet set
-- goals for the week that starts the next day.

create function private.enqueue_weekly_prompts()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_prompt_hour constant integer := 18;
  v_squad record;
  v_member record;
  v_local timestamp;
  v_next_monday date;
  v_count integer := 0;
begin
  for v_squad in select s.id, s.name, s.timezone from public.squads s loop
    v_local := now() at time zone v_squad.timezone;
    continue when extract(isodow from v_local) <> 7
      or extract(hour from v_local) < v_prompt_hour;

    v_next_monday := v_local::date + 1;

    insert into public.weekly_prompts (squad_id, week_start_date)
    values (v_squad.id, v_next_monday)
    on conflict do nothing;
    continue when not found;

    for v_member in
      select m.user_id from public.squad_members m
      where m.squad_id = v_squad.id
        and m.left_at is null
        and not exists (
          select 1 from public.goals g
          join public.weeks w on w.id = g.week_id
          where g.owner_id = m.user_id
            and w.squad_id = v_squad.id
            and w.week_start_date = v_next_monday
        )
    loop
      perform private.enqueue(
        v_member.user_id,
        v_squad.name,
        'New week starts tomorrow. What are you locking in for '
          || to_char(v_next_monday, 'FMMon FMDD') || ' – '
          || to_char(v_next_monday + 6, 'FMMon FMDD') || '?',
        '/squad?week=next',
        'weekly-prompt'
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  perform private.kick_dispatch();
  return v_count;
end;
$$;

create function private.housekeeping()
returns void
language sql security definer set search_path = ''
as $$
  delete from public.notification_outbox where created_at < now() - interval '7 days';
  delete from public.invite_attempts where attempted_at < now() - interval '1 day';
  delete from public.weekly_prompts where sent_at < now() - interval '60 days';
$$;

-- Hourly, so every time zone gets its prompt within the hour after 18:00.
select cron.schedule(
  'accountably-weekly-prompts', '0 * * * *',
  $$select private.enqueue_weekly_prompts()$$
);
select cron.schedule(
  'accountably-housekeeping', '17 4 * * *',
  $$select private.housekeeping()$$
);

-- ---------------------------------------------------------------------------
-- For the edge function only (service role)
-- ---------------------------------------------------------------------------

-- Hands out unsent notifications exactly once, paired with the devices to
-- deliver them to. The secret proves the caller was pinged by this database.
create function public.claim_notifications(p_secret text, p_limit integer default 100)
returns table (
  id bigint, title text, body text, url text, tag text,
  subscription_id uuid, endpoint text, p256dh text, auth text
)
language plpgsql security definer set search_path = ''
as $$
begin
  if p_secret is distinct from (select c.value from private.config c where c.key = 'dispatch_secret') then
    raise exception 'Bad dispatch secret' using errcode = '42501';
  end if;

  return query
  with claimed as (
    update public.notification_outbox o
    set claimed_at = now()
    where o.id in (
      select u.id from public.notification_outbox u
      where u.claimed_at is null
      order by u.id
      limit p_limit
      for update skip locked
    )
    returning o.id, o.user_id, o.title, o.body, o.url, o.tag
  )
  select c.id, c.title, c.body, c.url, c.tag, s.id, s.endpoint, s.p256dh, s.auth
  from claimed c
  join public.push_subscriptions s on s.user_id = c.user_id;
end;
$$;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public.claim_notifications(text, integer) from authenticated;
revoke execute on function public.activity_notify() from authenticated;
grant execute on function public.claim_notifications(text, integer) to service_role;
grant execute on function
  public.save_push_subscription(text, text, text, text),
  public.delete_push_subscription(text),
  public.send_nudge(uuid)
to authenticated;

-- So the person nudged sees it appear without refreshing.
alter publication supabase_realtime add table public.nudges;
