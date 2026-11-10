// POST /functions/v1/rescore-quotes  { force?: boolean, timeZone?: string }
//
// Scores the signed-in user's open quotes (draft or sent). Quotes whose details and
// interactions haven't changed since their last score are skipped (no API call at all);
// the rest go through callClaude, which may still answer from the cache.
// This is the "rescore command": the app's Rescore button calls it, and so could a scheduler.

import { AiUnavailableError, callClaude } from '../_shared/claude.ts';
import { z } from '../_shared/deps.ts';
import { aiEndpoint, productionDeps, unwrap } from '../_shared/http.ts';
import { buildScoreRequest, needsRescore } from '../_shared/scoring.ts';

/** Keeps one run well inside the Edge Function time limit. */
const MAX_PER_RUN = 25;

const Body = z.object({
  force: z.boolean().default(false),
  timeZone: z.string().max(64).default('UTC'),
});

type QuoteRow = {
  id: string;
  description: string;
  amount: number;
  status: string;
  created_at: string;
  updated_at: string;
  follow_up_date: string | null;
  scored_at: string | null;
  client: { name: string };
  interactions: { kind: string; body: string; occurred_at: string; updated_at: string }[];
};

export default {
  fetch: aiEndpoint(Body, async ({ force, timeZone }, supabase) => {
    const quotes = unwrap(
      await supabase
        .from('quotes')
        .select(
          'id, description, amount, status, created_at, updated_at, follow_up_date, scored_at, client:clients(name), interactions(kind, body, occurred_at, updated_at)',
        )
        .in('status', ['draft', 'sent'])
        .order('occurred_at', { referencedTable: 'interactions', ascending: false })
        // Without generated DB types, supabase-js assumes joined rows are arrays; a quote has
        // exactly one client, so we state the real shape here.
        .overrideTypes<QuoteRow[], { merge: false }>(),
    );

    const now = new Date();
    const today = todayIn(timeZone, now);
    const deps = productionDeps(supabase);
    const summary = { scored: 0, fromCache: 0, skipped: 0, remaining: 0, error: null as string | null };

    for (const quote of quotes) {
      if (!force && !needsRescore(quote, quote.interactions, now)) {
        summary.skipped++;
        continue;
      }
      if (summary.scored >= MAX_PER_RUN) {
        summary.remaining++;
        continue;
      }
      try {
        const { result, cacheHit } = await callClaude(
          buildScoreRequest({ today, clientName: quote.client.name, quote, interactions: quote.interactions }),
          deps,
        );
        unwrap(
          await supabase.rpc('save_quote_score', {
            p_quote_id: quote.id,
            p_score: result.score,
            p_rationale: result.rationale,
            p_signals: result.top_signals,
          }),
        );
        summary.scored++;
        if (cacheHit) summary.fromCache++;
      } catch (err) {
        // If the AI is down, stop here: the scores saved so far are kept, and the rest of
        // the quotes simply keep their previous scores.
        if (!(err instanceof AiUnavailableError)) throw err;
        summary.error = err.message;
        break;
      }
    }
    return summary;
  }),
};

/** Today's date (YYYY-MM-DD) in the user's time zone. */
function todayIn(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
