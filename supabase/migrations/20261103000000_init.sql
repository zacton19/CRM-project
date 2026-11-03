-- Window Cleaning CRM: initial schema
-- Every row belongs to the signed-in user (user_id = auth.uid()), enforced by RLS.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  phone         text,
  email         text,
  address_line1 text,
  address_line2 text,
  city          text,
  postcode      text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Lets child tables reference (id, user_id) so a row can't point at another user's client.
  unique (id, user_id)
);

create index clients_user_name_idx on public.clients (user_id, name);

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------
create table public.quotes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   uuid not null,
  description text not null check (length(trim(description)) > 0),
  amount      numeric(10, 2) not null check (amount >= 0),
  status      text not null default 'draft'
              check (status in ('draft', 'sent', 'accepted', 'declined')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete cascade
);

create index quotes_client_idx on public.quotes (client_id);
create index quotes_user_created_idx on public.quotes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Recurring job series (e.g. "every 4 weeks")
-- Concrete occurrences are materialised into public.jobs by extend_job_series().
-- ---------------------------------------------------------------------------
create table public.job_series (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id          uuid not null,
  title              text not null,
  first_starts_at    timestamptz not null,
  -- IANA zone the series was created in, so 9am stays 9am across DST changes.
  time_zone          text not null,
  interval_weeks     integer not null check (interval_weeks between 1 and 52),
  duration_minutes   integer not null default 60 check (duration_minutes > 0),
  price              numeric(10, 2) check (price >= 0),
  notes              text,
  reminders          jsonb,
  active             boolean not null default true,
  -- Highest occurrence_index already generated; -1 means none yet.
  generated_through  integer not null default -1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, user_id),
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Jobs (scheduled visits)
-- ---------------------------------------------------------------------------
create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id        uuid not null,
  series_id        uuid references public.job_series (id) on delete set null,
  occurrence_index integer,
  title            text not null,
  starts_at        timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  price            numeric(10, 2) check (price >= 0),
  status           text not null default 'scheduled'
                   check (status in ('scheduled', 'completed', 'cancelled')),
  notes            text,
  -- Per-job reminder override, same shape as user_settings.reminders. NULL = use defaults.
  reminders        jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (series_id, occurrence_index),
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete cascade
);

create index jobs_user_starts_idx on public.jobs (user_id, starts_at);
create index jobs_client_idx on public.jobs (client_id);
create index jobs_series_idx on public.jobs (series_id);

-- ---------------------------------------------------------------------------
-- Per-user settings
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- minutesBefore: offsets before the job start; dayBeforeTime: "HH:MM" on the previous day, or null.
  reminders  jsonb not null default '{"minutesBefore": [60], "dayBeforeTime": "18:00"}',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();
create trigger job_series_updated_at before update on public.job_series
  for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: owner-only access on every table
-- ---------------------------------------------------------------------------
alter table public.clients       enable row level security;
alter table public.quotes        enable row level security;
alter table public.job_series    enable row level security;
alter table public.jobs          enable row level security;
alter table public.user_settings enable row level security;

create policy "Owner access" on public.clients
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner access" on public.quotes
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner access" on public.job_series
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner access" on public.jobs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Owner access" on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- extend_job_series: generate upcoming occurrences for the caller's active series
-- up to `horizon_weeks` ahead. Safe to call repeatedly (the app calls it on launch).
-- Occurrences the user deleted are not recreated, because generation resumes
-- after generated_through.
-- ---------------------------------------------------------------------------
create or replace function public.extend_job_series(horizon_weeks integer default 26)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  with series as (
    select s.*
    from public.job_series s
    where s.active and s.user_id = (select auth.uid())
  ),
  candidates as (
    select
      s.id as series_id, s.user_id, s.client_id, s.title, s.duration_minutes, s.price, s.notes, s.reminders,
      n.idx,
      ((s.first_starts_at at time zone s.time_zone)
        + make_interval(weeks => n.idx * s.interval_weeks)) at time zone s.time_zone as occurs_at
    from series s
    cross join lateral generate_series(
      s.generated_through + 1,
      -- +1 of slack covers DST shifts; out-of-range rows are filtered below.
      floor(extract(epoch from (now() + make_interval(weeks => horizon_weeks)) - s.first_starts_at)
            / (604800 * s.interval_weeks))::integer + 1
    ) as n(idx)
  ),
  due as (
    select * from candidates
    where occurs_at <= now() + make_interval(weeks => horizon_weeks)
  ),
  ins as (
    insert into public.jobs
      (user_id, client_id, series_id, occurrence_index, title, starts_at, duration_minutes, price, notes, reminders)
    select user_id, client_id, series_id, idx, title, occurs_at, duration_minutes, price, notes, reminders
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

revoke execute on function public.extend_job_series(integer) from public, anon;
grant execute on function public.extend_job_series(integer) to authenticated;
