-- Lead scoring: Claude (Haiku) rates each open quote 0-100 on how likely it is to be accepted,
-- from the quote's details and its recent interactions. Written by the rescore-quotes Edge
-- Function; read by the "Today" follow-up queue.

alter table public.quotes
  add column score          smallint check (score between 0 and 100),
  add column score_rationale text,
  add column score_signals  jsonb,       -- short list of the main reasons, e.g. ["budget approved"]
  add column scored_at      timestamptz; -- null = never scored

create index quotes_open_score_idx on public.quotes (user_id, score desc nulls last)
  where status in ('draft', 'sent');

-- Saves a score. scored_at uses the database clock, the same now() the updated_at trigger
-- uses in this transaction, so saving a score never makes the quote look "changed since it
-- was scored" (which would cause a pointless rescore next time).
create or replace function public.save_quote_score(
  p_quote_id uuid,
  p_score integer,
  p_rationale text,
  p_signals jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.quotes
  set score = p_score, score_rationale = p_rationale, score_signals = p_signals, scored_at = now()
  where id = p_quote_id;
$$;

revoke execute on function public.save_quote_score(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.save_quote_score(uuid, integer, text, jsonb) to authenticated;
