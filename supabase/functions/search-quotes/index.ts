// POST /functions/v1/search-quotes  { query: "sent quotes over $500 this month", timeZone }
//
// 1. Claude (Sonnet) turns the question into search_quotes tool arguments, or replies in text
//    if the question doesn't fit.
// 2. validateSearch checks every field/operator/value and resolves relative dates.
// 3. The validated QueryOps are applied with the Supabase query builder (parameterised, RLS
//    applies). Returns the results plus a plain-English description of the filters.

import { callClaude } from '../_shared/claude.ts';
import { SupabaseClient, z } from '../_shared/deps.ts';
import { aiEndpoint, productionDeps, unwrap } from '../_shared/http.ts';
import { buildSearchRequest, validateSearch, ValidSearch } from '../_shared/search.ts';

const Body = z.object({
  query: z.string().trim().min(1).max(300),
  timeZone: z.string().max(64).default('UTC'),
});

type ResultRow = {
  id: string;
  description: string;
  amount: number;
  status: string;
  score: number | null;
  created_at: string;
  follow_up_date: string | null;
  clients: { name: string };
};

export default {
  fetch: aiEndpoint(Body, async ({ query, timeZone }, supabase) => {
    const today = todayIn(timeZone);
    const { result: reply, cacheHit } = await callClaude(buildSearchRequest(query, today), productionDeps(supabase));

    // Claude answered in words: the question didn't fit the tool. Show its explanation.
    if (reply.kind === 'text') return { clarification: reply.text, cacheHit };

    const validation = validateSearch(reply.input, { today, timeZone });
    if (!validation.ok) {
      return {
        clarification: `I couldn't run that search: ${validation.errors.join(' ')} ` +
          'Try asking about amount, lead score, status, dates, client or description.',
        cacheHit,
      };
    }

    const rows = await runSearch(supabase, validation.search);
    return {
      description: validation.search.description,
      results: rows.map(({ clients, ...quote }) => ({ ...quote, client_name: clients.name })),
      cacheHit,
    };
  }),
};

async function runSearch(supabase: SupabaseClient, search: ValidSearch): Promise<ResultRow[]> {
  // !inner makes a filter on clients.name remove quotes whose client doesn't match.
  let query = supabase
    .from('quotes')
    .select('id, description, amount, status, score, created_at, follow_up_date, clients!inner(name)');

  // Each validated QueryOp maps onto exactly one query-builder method. Values are sent to the
  // database as parameters; there is no way for a value to become SQL.
  for (const op of search.ops) {
    switch (op.method) {
      case 'eq': query = query.eq(op.column, op.value); break;
      case 'gt': query = query.gt(op.column, op.value); break;
      case 'gte': query = query.gte(op.column, op.value); break;
      case 'lt': query = query.lt(op.column, op.value); break;
      case 'lte': query = query.lte(op.column, op.value); break;
      case 'ilike': query = query.ilike(op.column, String(op.value)); break;
      case 'in': query = query.in(op.column, op.value); break;
    }
  }

  return unwrap(
    await query
      .order(search.sort.column, { ascending: search.sort.ascending, nullsFirst: false })
      .limit(search.limit)
      .overrideTypes<ResultRow[], { merge: false }>(),
  );
}

function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
