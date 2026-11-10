-- "Analyze" on an interaction: Claude reads the email/call/visit note and returns a summary,
-- action items, a follow-up date and (maybe) a new quote status. This migration adds the
-- places to store that, and one function that saves it all in a single transaction.

-- What the AI found, kept on the interaction it came from.
alter table public.interactions
  add column summary        text,
  add column analysis       jsonb,        -- the full validated AI result, for display and audit
  add column analyzed_at    timestamptz,
  -- The quote status this interaction changed the quote to (null = it didn't change it).
  -- This is the record of "which interaction caused the status change".
  add column applied_status text check (applied_status in ('sent', 'accepted', 'declined'));

-- When to get back in touch. On the quote if the interaction is about one, else on the client.
alter table public.quotes  add column follow_up_date date;
alter table public.clients add column follow_up_date date;

-- To-dos, either extracted by the AI (interaction_id set) or added by hand (interaction_id null).
create table public.action_items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id      uuid not null,
  quote_id       uuid,
  interaction_id uuid,
  description    text not null check (length(trim(description)) > 0),
  due_date       date,
  done           boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (client_id, user_id) references public.clients (id, user_id) on delete cascade,
  foreign key (quote_id, client_id) references public.quotes (id, client_id)
    on delete set null (quote_id) on update cascade,
  -- Items extracted from an interaction go away if that interaction is deleted.
  foreign key (interaction_id, user_id) references public.interactions (id, user_id) on delete cascade
);

create index action_items_open_due_idx on public.action_items (user_id, due_date) where not done;
create index action_items_client_idx on public.action_items (client_id);
create index action_items_interaction_idx on public.action_items (interaction_id);

create trigger action_items_updated_at before update on public.action_items
  for each row execute function public.set_updated_at();

alter table public.action_items enable row level security;

create policy "Owner access" on public.action_items
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------
-- apply_interaction_analysis: saves a validated analysis. All of it succeeds or none of it
-- does (a function runs in one transaction), so a half-saved analysis can't happen.
--
-- The Edge Function has already validated p_analysis and decided p_new_status (null = leave
-- the quote's status alone). The quotes.status check constraint still rejects anything
-- invalid, as a second line of defence. Returns the status actually applied, or null.
-- ---------------------------------------------------------------------------------------
create or replace function public.apply_interaction_analysis(
  p_interaction_id uuid,
  p_analysis jsonb,
  p_new_status text
)
returns text
language plpgsql
security invoker -- runs as the caller, so RLS limits it to their own rows
set search_path = ''
as $$
declare
  i public.interactions;
  follow_up date := (p_analysis ->> 'follow_up_date')::date;
  applied text := null;
begin
  select * into i from public.interactions where id = p_interaction_id;
  if not found then
    raise exception 'Interaction not found';
  end if;

  -- Re-analysing replaces this interaction's earlier open items (ticked-off ones are kept).
  delete from public.action_items where interaction_id = i.id and not done;
  insert into public.action_items (client_id, quote_id, interaction_id, description, due_date)
  select i.client_id, i.quote_id, i.id, item ->> 'description', (item ->> 'due_date')::date
  from jsonb_array_elements(p_analysis -> 'action_items') as item;

  if follow_up is not null then
    if i.quote_id is not null then
      update public.quotes set follow_up_date = follow_up where id = i.quote_id;
    else
      update public.clients set follow_up_date = follow_up where id = i.client_id;
    end if;
  end if;

  if p_new_status is not null and i.quote_id is not null then
    update public.quotes set status = p_new_status
    where id = i.quote_id and status <> p_new_status;
    if found then
      applied := p_new_status;
    end if;
  end if;

  update public.interactions
  set summary = p_analysis ->> 'summary',
      analysis = p_analysis,
      analyzed_at = now(),
      -- Keep the earlier record if re-analysing finds the status was already changed.
      applied_status = coalesce(applied, i.applied_status)
  where id = i.id;

  return applied;
end;
$$;

revoke execute on function public.apply_interaction_analysis(uuid, jsonb, text) from public, anon;
grant execute on function public.apply_interaction_analysis(uuid, jsonb, text) to authenticated;
