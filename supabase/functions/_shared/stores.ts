// The production cache and log for callClaude, stored in Postgres (llm_cache, llm_call_log).
// `supabase` is the client scoped to the signed-in user, so RLS applies and user_id is
// filled in by the column default (auth.uid()).
//
// A failure here only logs a warning: losing a cache entry or a log row must never stop
// the user from getting their summary.

import { ClaudeDeps, LogEntry } from './claude.ts';
import { CACHE_TTL_DAYS, Feature } from './config.ts';
import { Anthropic, SupabaseClient } from './deps.ts';

export function supabaseCache(supabase: SupabaseClient): ClaudeDeps['cache'] {
  return {
    async get(key: string) {
      const oldest = new Date(Date.now() - CACHE_TTL_DAYS * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('llm_cache')
        .select('response')
        .eq('cache_key', key)
        .gte('created_at', oldest)
        .maybeSingle();
      if (error) console.warn('llm_cache read failed:', error.message);
      return (data?.response as Anthropic.Message | undefined) ?? null;
    },
    async set(key: string, feature: Feature, message: Anthropic.Message) {
      const { error } = await supabase
        .from('llm_cache')
        .upsert({ cache_key: key, feature, response: message, created_at: new Date().toISOString() });
      if (error) console.warn('llm_cache write failed:', error.message);
    },
  };
}

export function supabaseLog(supabase: SupabaseClient): ClaudeDeps['log'] {
  return async (entry: LogEntry) => {
    const { error } = await supabase.from('llm_call_log').insert(entry);
    if (error) console.warn('llm_call_log write failed:', error.message);
  };
}
