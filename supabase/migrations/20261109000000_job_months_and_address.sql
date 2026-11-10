-- The app saves repeating jobs as "every N months" (job_series.interval_months) and lets a
-- job have its own address (jobs.address, job_series.address), but no earlier migration
-- created those columns. This adds them and teaches extend_job_series about months.
-- "if not exists" makes this safe to run on a database where they were added by hand.

alter table public.job_series add column if not exists interval_months integer
  check (interval_months between 1 and 12);
alter table public.job_series add column if not exists address text;
alter table public.jobs       add column if not exists address text;

-- A series now repeats every N weeks OR every N months.
alter table public.job_series alter column interval_weeks drop not null;
-- NOT VALID: only checked for new and updated rows, so existing rows can't block the migration.
alter table public.job_series add constraint job_series_one_interval
  check ((interval_weeks is null) <> (interval_months is null)) not valid;

create or replace function public.extend_job_series(horizon_weeks integer default 26)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
  horizon timestamptz := now() + make_interval(weeks => horizon_weeks);
begin
  with series as (
    select
      s.*,
      -- The gap between visits, and the first visit in the series' own time zone.
      case when s.interval_months is not null
        then make_interval(months => s.interval_months)
        else make_interval(weeks => s.interval_weeks)
      end as step,
      s.first_starts_at at time zone s.time_zone as first_local
    from public.job_series s
    where s.active and s.user_id = (select auth.uid())
  ),
  candidates as (
    select
      s.id as series_id, s.user_id, s.client_id, s.title, s.duration_minutes, s.price, s.notes,
      s.reminders, s.address,
      n.idx,
      -- Adding months in local time keeps "the 15th at 9am" on the 15th at 9am.
      (s.first_local + n.idx * s.step) at time zone s.time_zone as occurs_at
    from series s
    cross join lateral generate_series(
      s.generated_through + 1,
      -- Upper bound on how many steps fit before the horizon (+1 slack for DST and month
      -- lengths); anything past the horizon is filtered out below.
      case when s.interval_months is not null
        then (extract(year from age(horizon, s.first_starts_at)) * 12
              + extract(month from age(horizon, s.first_starts_at)))::integer / s.interval_months + 1
        else floor(extract(epoch from horizon - s.first_starts_at) / (604800 * s.interval_weeks))::integer + 1
      end
    ) as n(idx)
  ),
  due as (
    select * from candidates where occurs_at <= horizon
  ),
  ins as (
    insert into public.jobs
      (user_id, client_id, series_id, occurrence_index, title, starts_at, duration_minutes, price,
       notes, reminders, address)
    select user_id, client_id, series_id, idx, title, occurs_at, duration_minutes, price,
           notes, reminders, address
    from due
    on conflict (series_id, occurrence_index) do nothing
    returning 1
  ),
  upd as (
    update public.job_series s
    set generated_through = d.max_idx
    from (select series_id, max(idx) as max_idx from due group by series_id) d
    where s.id = d.series_id
    returning 1
  )
  select count(*) into inserted_count from ins;

  return inserted_count;
end;
$$;
