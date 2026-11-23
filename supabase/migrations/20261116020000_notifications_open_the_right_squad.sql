-- People can now be in more than one squad, so a notification has to open the
-- squad it is about. The three functions below are unchanged except that the
-- link they queue carries the squad id (`/squad?id=…`).

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
    '/squad?id=' || v_goal.squad_id::text,
    'nudge:' || v_user::text
  );
  perform private.kick_dispatch();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function private.enqueue_weekly_prompts()
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
        '/squad?week=next&id=' || v_squad.id::text,
        -- One prompt per squad, so someone in two squads sees both.
        'weekly-prompt:' || v_squad.id::text
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  perform private.kick_dispatch();
  return v_count;
end;
$$;
