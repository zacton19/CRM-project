// Settings for the Claude integration. Models can be overridden with Edge Function secrets
// (e.g. `npx supabase secrets set CLAUDE_SCORING_MODEL=...`) without changing code.

export type Feature = 'analyze' | 'score' | 'search';

function env(name: string, fallback: string): string {
  return Deno.env.get(name) || fallback;
}

/** Sonnet for the tasks that need judgement (summaries, search); Haiku for cheap, frequent scoring. */
export const MODELS: Record<Feature, string> = {
  analyze: env('CLAUDE_SUMMARY_MODEL', 'claude-sonnet-5-5'),
  search: env('CLAUDE_SEARCH_MODEL', 'claude-sonnet-5-5'),
  score: env('CLAUDE_SCORING_MODEL', 'claude-haiku-5-5'),
};

/** US dollars per million tokens (Anthropic price list, Nov 2026). Used to log the cost of each call. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model];
  if (!price) return 0; // unknown model: tokens are still logged, cost shows as 0
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

// --- Reliability -------------------------------------------------------------------------

/** Give up on a single API request after this long. */
export const REQUEST_TIMEOUT_MS = 25_000;
/** Retries after the first attempt, for rate limits (429), server errors (5xx) and overload (529). */
export const MAX_RETRIES = 3;
/** Backoff before retry n (0-based) is about BASE * 2^n, capped at MAX, with random jitter. */
export const BASE_DELAY_MS = 500;
export const MAX_DELAY_MS = 8_000;
/** Cached responses older than this are ignored. */
export const CACHE_TTL_DAYS = 30;
