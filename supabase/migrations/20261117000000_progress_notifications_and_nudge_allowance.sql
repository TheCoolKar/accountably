-- 1. Notify the squad on every step forward, not only on a fully finished goal.
--    Ticking off part of a counted goal ("2 of 3") used to be silent.
--    Finished goals and steps forward no longer share a tag, so each one
--    arrives as its own notification instead of quietly replacing the last.
-- 2. Nudge allowance: up to 3 nudges per sender → recipient in any 24 hours,
--    each on a different goal (was: 1 per 24 hours).

create or replace function public.activity_notify()
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
  if new.event_type not in ('goal_created', 'goal_completed', 'progress_updated') then
    return null;
  end if;
  -- A count taken back down is not news. Same rule as isProgressWin in
  -- lib/domain/activity.ts.
  if new.event_type = 'progress_updated'
    and (new.metadata ->> 'completed_count')::integer
        <= coalesce((new.metadata ->> 'previous_count')::integer, -1) then
    return null;
  end if;

  select p.display_name into v_actor from public.profiles p where p.id = new.actor_id;
  select s.name into v_squad from public.squads s where s.id = new.squad_id;

  if new.event_type = 'goal_completed' then
    v_body := v_actor || ' finished “' || v_goal || '”';
    v_tag := null;
  elsif new.event_type = 'progress_updated' then
    v_body := v_actor || ' is at ' || (new.metadata ->> 'completed_count')
      || ' of ' || (new.metadata ->> 'target_count') || ' on “' || v_goal || '”';
    v_tag := null;
  else
    v_body := v_actor || ' added a goal: “' || v_goal || '”';
    -- Someone adding several goals in a row updates one notification
    -- instead of stacking four.
    v_tag := 'added:' || new.actor_id::text || ':' || new.squad_id::text;
  end if;

  for v_member in
    select m.user_id from public.squad_members m
    where m.squad_id = new.squad_id and m.left_at is null and m.user_id <> new.actor_id
  loop
    perform private.enqueue(
      v_member.user_id, v_squad, v_body, '/squad?id=' || new.squad_id::text, v_tag
    );
  end loop;

  perform private.kick_dispatch();
  return null;
end;
$$;

create or replace function public.send_nudge(p_goal_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  -- Up to v_limit nudges per sender → recipient in v_window, each on a
  -- different goal. Matches NUDGE_LIMIT and NUDGE_WINDOW_HOURS in
  -- lib/domain/nudge.ts.
  v_limit constant integer := 3;
  v_window constant interval := interval '24 hours';
  v_goal public.goals;
  v_count integer;
  v_oldest timestamptz;
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

  if exists (
    select 1 from public.nudges n
    where n.sender_id = v_user and n.goal_id = v_goal.id and n.created_at > now() - v_window
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_nudged');
  end if;

  select count(*), min(n.created_at) into v_count, v_oldest
  from public.nudges n
  where n.sender_id = v_user
    and n.recipient_id = v_goal.owner_id
    and n.created_at > now() - v_window;
  if v_count >= v_limit then
    return jsonb_build_object('ok', false, 'error', 'cooldown', 'next_at', v_oldest + v_window);
  end if;

  insert into public.nudges (squad_id, goal_id, sender_id, recipient_id)
  values (v_goal.squad_id, v_goal.id, v_user, v_goal.owner_id);

  select p.display_name into v_sender from public.profiles p where p.id = v_user;
  select s.name into v_squad from public.squads s where s.id = v_goal.squad_id;
  perform private.enqueue(
    v_goal.owner_id,
    v_squad,
    v_sender || ' is cheering you on: “' || v_goal.title || '”',
    '/squad?id=' || v_goal.squad_id::text,
    -- One notification per nudged goal, so three nudges show as three.
    'nudge:' || v_goal.id::text
  );
  perform private.kick_dispatch();

  return jsonb_build_object('ok', true);
end;
$$;
