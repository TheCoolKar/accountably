-- Record the count a goal had before each change, so the activity feed can tell
-- a step forward (shown in green) from a count taken back down.
-- Same rules as before; only the metadata gains `previous_count`.

create or replace function public.goals_record_activity()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_type text;
  v_goal public.goals;
  v_metadata jsonb;
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

  v_metadata := jsonb_build_object(
    'title', v_goal.title,
    'completed_count', v_goal.completed_count,
    'target_count', v_goal.target_count
  );
  if tg_op = 'UPDATE' then
    v_metadata := v_metadata || jsonb_build_object('previous_count', old.completed_count);
  end if;

  insert into public.activity_events (squad_id, actor_id, goal_id, event_type, metadata)
  values (
    v_goal.squad_id,
    v_actor,
    case when tg_op = 'DELETE' then null else v_goal.id end,
    v_type,
    v_metadata
  );
  return null;
end;
$$;
