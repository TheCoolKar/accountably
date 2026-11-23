-- Plan further ahead: goals can now be set for this week, next week, and the
-- week after (was: this week and next week). Matches PLANNING_WEEKS_AHEAD in
-- lib/domain/week.ts. Past weeks still can never be opened after the fact.

create or replace function public.ensure_week(p_squad_id uuid, p_week_start date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_weeks_ahead constant integer := 2;
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

  if extract(isodow from p_week_start) <> 1
    or p_week_start < v_current_monday
    or p_week_start > v_current_monday + 7 * v_weeks_ahead then
    raise exception 'Goals can only be set for this week or the next two'
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
