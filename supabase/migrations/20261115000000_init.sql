-- Accountably: initial schema, row-level security, and server-side rules.
--
-- Security model
--   * Every table has RLS on. Reads require active membership of the squad.
--   * Goals are written directly by their owner (RLS + triggers enforce the rules).
--   * Squads, memberships, invites and weeks are only written through the
--     security-definer functions at the bottom of this file.
--   * Activity events are only written by triggers, never by clients.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(btrim(display_name)) between 1 and 40),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 50),
  timezone text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.squad_members (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

-- One active membership per squad + user. Leaving and rejoining adds a new row.
create unique index squad_members_one_active
  on public.squad_members (squad_id, user_id)
  where left_at is null;
create index squad_members_user on public.squad_members (user_id) where left_at is null;

create table public.squad_invites (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  -- sha256 of the code. The code itself is shown once and never stored.
  code_hash text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index squad_invites_squad on public.squad_invites (squad_id);

-- Failed join attempts, for rate limiting.
create table public.invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index invite_attempts_user on public.invite_attempts (user_id, attempted_at);

create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  -- The Monday, as a calendar date in `timezone`.
  week_start_date date not null
    check (extract(isodow from week_start_date) = 1),
  -- The squad's zone when the week was created. A later change to the squad's
  -- zone only affects weeks created afterwards.
  timezone text not null,
  created_at timestamptz not null default now(),
  unique (squad_id, week_start_date)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks (id) on delete cascade,
  squad_id uuid not null references public.squads (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 500),
  goal_type text not null check (goal_type in ('one_time', 'counted')),
  target_count integer not null default 1 check (target_count between 1 and 999),
  completed_count integer not null default 0,
  unit_label text check (unit_label is null or char_length(unit_label) <= 20),
  locked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_count_in_range
    check (completed_count >= 0 and completed_count <= target_count),
  constraint goals_one_time_target
    check (goal_type <> 'one_time' or target_count = 1)
);
create index goals_week on public.goals (week_id);
create index goals_owner on public.goals (owner_id);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  event_type text not null check (event_type in (
    'goal_created', 'goal_edited', 'goal_deleted', 'progress_updated',
    'goal_completed', 'goal_reopened', 'locked_in'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_events_squad on public.activity_events (squad_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions used by policies
-- (security definer so policies can look at memberships without recursing)
-- ---------------------------------------------------------------------------

create function public.is_active_member(p_squad_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.squad_members m
    where m.squad_id = p_squad_id
      and m.user_id = (select auth.uid())
      and m.left_at is null
  );
$$;

create function public.is_squad_owner(p_squad_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.squad_members m
    where m.squad_id = p_squad_id
      and m.user_id = (select auth.uid())
      and m.left_at is null
      and m.role = 'owner'
  );
$$;

-- True when the profile belongs to someone who is, or was, in a squad the
-- caller is currently in. Past members stay nameable so history reads properly.
create function public.shares_squad_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.squad_members mine
    join public.squad_members theirs on theirs.squad_id = mine.squad_id
    where mine.user_id = (select auth.uid())
      and mine.left_at is null
      and theirs.user_id = p_user_id
  );
$$;

-- A week is open until its Sunday ends in the week's zone. This date check is
-- the rule; nothing else decides whether a week can be written to.
create function public.week_is_open(p_week_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.weeks w
    where w.id = p_week_id
      and (now() at time zone w.timezone)::date <= w.week_start_date + 6
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.squad_invites enable row level security;
alter table public.invite_attempts enable row level security;
alter table public.weeks enable row level security;
alter table public.goals enable row level security;
alter table public.activity_events enable row level security;

-- Start from nothing, then grant exactly what the app uses.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select on public.squads to authenticated;
grant update (name, timezone) on public.squads to authenticated;
grant select on public.squad_members to authenticated;
grant select on public.weeks to authenticated;
grant select on public.goals to authenticated;
grant insert (week_id, squad_id, owner_id, title, description, goal_type, target_count, unit_label)
  on public.goals to authenticated;
grant update (title, description, goal_type, target_count, completed_count, unit_label)
  on public.goals to authenticated;
grant delete on public.goals to authenticated;
grant select on public.activity_events to authenticated;
-- squad_invites and invite_attempts: no grants and no policies. Functions only.

create policy "profiles: read own and squadmates"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_squad_with(id));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "squads: members read"
  on public.squads for select to authenticated
  using (public.is_active_member(id));

create policy "squads: owner updates"
  on public.squads for update to authenticated
  using (public.is_squad_owner(id))
  with check (public.is_squad_owner(id));

create policy "squad_members: members read"
  on public.squad_members for select to authenticated
  using (public.is_active_member(squad_id));

create policy "weeks: members read"
  on public.weeks for select to authenticated
  using (public.is_active_member(squad_id));

create policy "goals: members read"
  on public.goals for select to authenticated
  using (public.is_active_member(squad_id));

create policy "goals: owner adds to an open week"
  on public.goals for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_active_member(squad_id)
    and public.week_is_open(week_id)
  );

create policy "goals: owner edits in an open week"
  on public.goals for update to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_member(squad_id)
    and public.week_is_open(week_id)
  )
  with check (
    owner_id = (select auth.uid())
    and public.is_active_member(squad_id)
    and public.week_is_open(week_id)
  );

create policy "goals: owner deletes from an open week"
  on public.goals for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and public.is_active_member(squad_id)
    and public.week_is_open(week_id)
  );

create policy "activity: members read"
  on public.activity_events for select to authenticated
  using (public.is_active_member(squad_id));

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- A profile for every new account, named from the sign-up form.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Friend'), 40)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.squads_validate()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  new.name := btrim(new.name);
  return new;
end;
$$;

create trigger squads_validate
  before insert or update on public.squads
  for each row execute function public.squads_validate();

create function public.goals_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_week_squad uuid;
begin
  if tg_op = 'INSERT' then
    select w.squad_id into v_week_squad from public.weeks w where w.id = new.week_id;
    if v_week_squad is null or v_week_squad <> new.squad_id then
      raise exception 'Goal week does not belong to this squad' using errcode = '23514';
    end if;
    new.completed_count := 0;
    new.locked_in_at := null;
  end if;

  new.title := btrim(new.title);
  new.description := nullif(btrim(new.description), '');
  new.unit_label := nullif(btrim(new.unit_label), '');
  if new.goal_type = 'one_time' then
    new.unit_label := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger goals_before_write
  before insert or update on public.goals
  for each row execute function public.goals_before_write();

-- Every change to a goal becomes an event the squad can see.
-- Mirrors activityForGoalChange in lib/domain/goal.ts.
create function public.goals_record_activity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_type text;
  v_goal public.goals;
begin
  -- Cascading deletes and maintenance run without a signed-in user.
  if v_actor is null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_goal := new;
    v_type := 'goal_created';
  elsif tg_op = 'DELETE' then
    v_goal := old;
    v_type := 'goal_deleted';
  else
    v_goal := new;
    if (old.title, old.description, old.goal_type, old.target_count, old.unit_label)
       is distinct from
       (new.title, new.description, new.goal_type, new.target_count, new.unit_label) then
      v_type := 'goal_edited';
    elsif old.completed_count = new.completed_count then
      return null;
    elsif old.completed_count < old.target_count
      and new.completed_count >= new.target_count then
      v_type := 'goal_completed';
    elsif old.completed_count >= old.target_count
      and new.completed_count < new.target_count then
      v_type := 'goal_reopened';
    else
      v_type := 'progress_updated';
    end if;
  end if;

  insert into public.activity_events (squad_id, actor_id, goal_id, event_type, metadata)
  values (
    v_goal.squad_id,
    v_actor,
    case when tg_op = 'DELETE' then null else v_goal.id end,
    v_type,
    jsonb_build_object(
      'title', v_goal.title,
      'completed_count', v_goal.completed_count,
      'target_count', v_goal.target_count
    )
  );
  return null;
end;
$$;

create trigger goals_record_activity
  after insert or update or delete on public.goals
  for each row execute function public.goals_record_activity();

-- ---------------------------------------------------------------------------
-- Functions the app calls (RPC)
-- ---------------------------------------------------------------------------

create function public.hash_invite_code(p_code text)
returns text
language sql immutable set search_path = ''
as $$
  select encode(sha256(convert_to(upper(regexp_replace(p_code, '[\s-]', '', 'g')), 'UTF8')), 'hex');
$$;

create function public.create_squad(p_name text, p_timezone text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_squad uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  insert into public.squads (name, timezone, created_by)
  values (p_name, p_timezone, v_user)
  returning id into v_squad;

  insert into public.squad_members (squad_id, user_id, role)
  values (v_squad, v_user, 'owner');

  return v_squad;
end;
$$;

-- Any member can make an invite to share. The code is returned once.
create function public.create_invite(p_squad_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  -- 32 characters, so each random byte maps evenly. Same as INVITE_ALPHABET.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
  v_expires timestamptz := now() + interval '7 days';
begin
  if v_user is null or not public.is_active_member(p_squad_id) then
    raise exception 'Not a member of this squad' using errcode = '42501';
  end if;

  v_bytes := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  -- Skip bytes 6 and 8 of each UUID: they carry fixed version/variant bits.
  for i in 0..31 loop
    continue when i % 16 in (6, 8);
    exit when char_length(v_code) >= 10;
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
  end loop;

  -- Keep the table small: drop this squad's dead invites.
  delete from public.squad_invites
  where squad_id = p_squad_id
    and (expires_at < now() or revoked_at is not null);

  insert into public.squad_invites (squad_id, code_hash, created_by, expires_at)
  values (p_squad_id, public.hash_invite_code(v_code), v_user, v_expires);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end;
$$;

-- Owner only: every outstanding invite for the squad stops working.
create function public.revoke_invites(p_squad_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_squad_owner(p_squad_id) then
    raise exception 'Only the squad owner can revoke invites' using errcode = '42501';
  end if;

  update public.squad_invites
  set revoked_at = now()
  where squad_id = p_squad_id and revoked_at is null;
end;
$$;

-- Returns {ok, squad_id} or {ok: false, error}. Failures are returned rather
-- than raised so the failed attempt is still recorded for rate limiting.
create function public.join_squad(p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_max_members constant integer := 5;
  v_max_failures constant integer := 8;
  v_squad uuid;
  v_count integer;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select count(*) into v_count
  from public.invite_attempts a
  where a.user_id = v_user and a.attempted_at > now() - interval '15 minutes';
  if v_count >= v_max_failures then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select i.squad_id into v_squad
  from public.squad_invites i
  where i.code_hash = public.hash_invite_code(p_code)
    and i.revoked_at is null
    and i.expires_at > now();

  if v_squad is null then
    insert into public.invite_attempts (user_id) values (v_user);
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  -- Serialise joins per squad so two people can't both take the last place.
  perform 1 from public.squads s where s.id = v_squad for update;

  if exists (
    select 1 from public.squad_members m
    where m.squad_id = v_squad and m.user_id = v_user and m.left_at is null
  ) then
    return jsonb_build_object('ok', true, 'squad_id', v_squad);
  end if;

  select count(*) into v_count
  from public.squad_members m
  where m.squad_id = v_squad and m.left_at is null;
  if v_count >= v_max_members then
    return jsonb_build_object('ok', false, 'error', 'squad_full');
  end if;

  insert into public.squad_members (squad_id, user_id, role)
  values (v_squad, v_user, 'member');

  return jsonb_build_object('ok', true, 'squad_id', v_squad);
end;
$$;

-- Leaving removes access immediately. If the owner leaves, the longest-standing
-- member becomes the owner.
create function public.leave_squad(p_squad_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
begin
  perform 1 from public.squads s where s.id = p_squad_id for update;

  update public.squad_members
  set left_at = now()
  where squad_id = p_squad_id and user_id = v_user and left_at is null
  returning role into v_role;

  if v_role is null then
    raise exception 'Not a member of this squad' using errcode = '42501';
  end if;

  if v_role = 'owner' then
    update public.squad_members
    set role = 'owner'
    where id = (
      select m.id from public.squad_members m
      where m.squad_id = p_squad_id and m.left_at is null
      order by m.joined_at asc
      limit 1
    );
  end if;
end;
$$;

-- Finds or creates the week row. Only the current and the upcoming week (in
-- squad time) can be created; past weeks can never be opened after the fact.
create function public.ensure_week(p_squad_id uuid, p_week_start date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_timezone text;
  v_today date;
  v_current_monday date;
  v_week uuid;
begin
  if not public.is_active_member(p_squad_id) then
    raise exception 'Not a member of this squad' using errcode = '42501';
  end if;

  select w.id into v_week
  from public.weeks w
  where w.squad_id = p_squad_id and w.week_start_date = p_week_start;
  if v_week is not null then
    return v_week;
  end if;

  select s.timezone into v_timezone from public.squads s where s.id = p_squad_id;
  v_today := (now() at time zone v_timezone)::date;
  v_current_monday := v_today - (extract(isodow from v_today)::integer - 1);

  if p_week_start not in (v_current_monday, v_current_monday + 7) then
    raise exception 'Goals can only be set for this week or next week'
      using errcode = '22023';
  end if;

  insert into public.weeks (squad_id, week_start_date, timezone)
  values (p_squad_id, p_week_start, v_timezone)
  on conflict (squad_id, week_start_date) do nothing;

  select w.id into v_week
  from public.weeks w
  where w.squad_id = p_squad_id and w.week_start_date = p_week_start;
  return v_week;
end;
$$;

-- Confirms the caller's goals for a week. Returns how many were newly locked in.
create function public.lock_in_week(p_squad_id uuid, p_week_start date)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_week uuid;
  v_locked integer;
begin
  if not public.is_active_member(p_squad_id) then
    raise exception 'Not a member of this squad' using errcode = '42501';
  end if;

  select w.id into v_week
  from public.weeks w
  where w.squad_id = p_squad_id and w.week_start_date = p_week_start;

  if v_week is null or not public.week_is_open(v_week) then
    raise exception 'This week is closed' using errcode = '22023';
  end if;

  update public.goals
  set locked_in_at = now()
  where week_id = v_week and owner_id = v_user and locked_in_at is null;
  get diagnostics v_locked = row_count;

  if v_locked > 0 then
    insert into public.activity_events (squad_id, actor_id, event_type, metadata)
    values (p_squad_id, v_user, 'locked_in', jsonb_build_object('goal_count', v_locked));
  end if;

  return v_locked;
end;
$$;

-- Functions are callable by signed-in users only.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_active_member(uuid),
  public.is_squad_owner(uuid),
  public.shares_squad_with(uuid),
  public.week_is_open(uuid),
  public.create_squad(text, text),
  public.create_invite(uuid),
  public.revoke_invites(uuid),
  public.join_squad(text),
  public.leave_squad(uuid),
  public.ensure_week(uuid, date),
  public.lock_in_week(uuid, date)
to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Every goal change writes an activity event, so listening to activity_events
-- covers goals too. Realtime applies the same RLS policies as normal reads.

alter publication supabase_realtime add table
  public.activity_events,
  public.squad_members,
  public.squads;
