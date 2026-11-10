-- Support tables for the Claude integration (supabase/functions/_shared/claude.ts).
--
-- llm_cache:    saved Claude responses, keyed by a hash of (model, prompt version, input),
--               so asking the same question twice doesn't pay for (or wait on) a second call.
-- llm_call_log: one row per AI request: tokens, cost, latency, cache hit, success/error.
--               llm_usage_by_feature totals it for the Settings screen.
--
-- Both are per-user and protected by RLS, like every other table.

create table public.llm_cache (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cache_key  text not null,            -- sha-256 hex of model + prompt version + input
  feature    text not null,
  response   jsonb not null,           -- the Claude Message object as returned by the API
  created_at timestamptz not null default now(),
  primary key (user_id, cache_key)
);

create table public.llm_call_log (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  feature       text not null check (feature in ('analyze', 'score', 'search')),
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  -- Worked out from the per-model prices in _shared/config.ts at the time of the call.
  cost_usd      numeric(12, 6) not null default 0,
  latency_ms    integer not null,
  cache_hit     boolean not null,
  attempts      integer not null default 0, -- API requests made (0 on a cache hit)
  success       boolean not null,
  error         text
);

create index llm_call_log_user_created_idx on public.llm_call_log (user_id, created_at desc);

alter table public.llm_cache    enable row level security;
alter table public.llm_call_log enable row level security;

create policy "Owner access" on public.llm_cache
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The log is append-only: users can add and read their own rows, but not edit them.
create policy "Owner read" on public.llm_call_log
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owner insert" on public.llm_call_log
  for insert to authenticated with check (user_id = (select auth.uid()));

-- security_invoker makes the view run with the caller's permissions, so RLS still applies
-- and each user only sees their own totals.
create view public.llm_usage_by_feature with (security_invoker = true) as
select
  feature,
  count(*)                                    as calls,
  count(*) filter (where cache_hit)           as cache_hits,
  count(*) filter (where not success)         as failures,
  coalesce(sum(input_tokens), 0)              as input_tokens,
  coalesce(sum(output_tokens), 0)             as output_tokens,
  coalesce(sum(cost_usd), 0)                  as cost_usd,
  -- Only real API calls: cache hits take ~0 ms and would hide how slow the API is.
  round(avg(latency_ms) filter (where success and not cache_hit)) as avg_latency_ms
from public.llm_call_log
group by feature;
