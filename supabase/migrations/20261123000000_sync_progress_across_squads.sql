-- Progress on a goal follows you across squads.
--
-- When you change the count on one of your goals, your goals in your other
-- squads for the same week (same week_start_date) with the same title
-- (ignoring capitals and surrounding spaces), the same type and the same
-- target get the same count. Mirrors isLinkedGoal in lib/domain/goal-sync.ts.
--
-- Only the owner's own goals are touched, only in squads they are still an
-- active member of, and only in weeks that are still open there. The copies
-- are ordinary updates, so each squad gets its own activity event and
-- notifications, written as the person who made the change.
--
-- pg_trigger_depth() = 1 means this update came straight from the app; the
-- updates this trigger makes run at depth 2 and don't spread any further.

create function public.goals_sync_progress()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_week_start date;
begin
  if pg_trigger_depth() > 1 or old.completed_count = new.completed_count then
    return null;
  end if;
  -- Only the owner moves their own counts (RLS already insists on it).
  if (select auth.uid()) is distinct from new.owner_id then
    return null;
  end if;

  select w.week_start_date into v_week_start from public.weeks w where w.id = new.week_id;

  update public.goals g
  set completed_count = new.completed_count
  from public.weeks w
  where w.id = g.week_id
    and w.week_start_date = v_week_start
    and g.owner_id = new.owner_id
    and g.squad_id <> new.squad_id
    and lower(btrim(g.title)) = lower(btrim(new.title))
    and g.goal_type = new.goal_type
    and g.target_count = new.target_count
    and g.completed_count <> new.completed_count
    and (now() at time zone w.timezone)::date <= w.week_start_date + 6
    and exists (
      select 1 from public.squad_members m
      where m.squad_id = g.squad_id
        and m.user_id = new.owner_id
        and m.left_at is null
    );
  return null;
end;
$$;

revoke all on function public.goals_sync_progress() from public, anon, authenticated;

create trigger goals_sync_progress
  after update of completed_count on public.goals
  for each row execute function public.goals_sync_progress();
