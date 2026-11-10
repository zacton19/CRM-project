-- Interaction history: emails, calls, site-visit notes and general notes about a client,
-- optionally tied to one of that client's quotes. These are the raw text the AI features
-- (summaries, lead scoring) read from.

-- Lets interactions point at (quote id, client id) together, so an interaction can't be
-- linked to a quote that belongs to a different client.
alter table public.quotes add constraint quotes_id_client_key unique (id, client_id);

create table public.interactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   uuid not null,
  quote_id    uuid,
  kind        text not null check (kind in ('email', 'call', 'visit', 'note')),
  body        text not null check (length(trim(body)) > 0),
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete cascade,
  -- Deleting the quote keeps the interaction (it's still client history) and only clears
  -- quote_id. "set null (quote_id)" stops Postgres also nulling client_id.
  -- If a quote is moved to another client, its interactions move with it.
  foreign key (quote_id, client_id) references public.quotes (id, client_id)
    on delete set null (quote_id) on update cascade
);

create index interactions_client_idx on public.interactions (client_id, occurred_at desc);
create index interactions_quote_idx on public.interactions (quote_id, occurred_at desc);

create trigger interactions_updated_at before update on public.interactions
  for each row execute function public.set_updated_at();

alter table public.interactions enable row level security;

create policy "Owner access" on public.interactions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
