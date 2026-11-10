// Shared wrapper for the AI Edge Functions:
//  - withSupabase({ auth: 'user' }) rejects requests without a valid signed-in user and gives
//    us a Supabase client that acts as that user (so RLS applies to every query).
//  - The JSON body is checked with a Zod schema before any work happens.
//  - Errors become small JSON responses the app can show: { error: "..." }.

import { AiUnavailableError, anthropicSender, ClaudeDeps } from './claude.ts';
import { SupabaseClient, withSupabase, z } from './deps.ts';
import { supabaseCache, supabaseLog } from './stores.ts';

/** A problem with the request itself (shown to the user, HTTP 400). */
export class BadRequestError extends Error {}

type Handler<B> = (body: B, supabase: SupabaseClient) => Promise<unknown>;

export function aiEndpoint<S extends z.ZodType>(bodySchema: S, handler: Handler<z.infer<S>>) {
  return withSupabase({ auth: 'user' }, async (req, ctx) => {
    try {
      const raw = await req.json().catch(() => {
        throw new BadRequestError('Request body must be JSON.');
      });
      const body = bodySchema.safeParse(raw);
      if (!body.success) throw new BadRequestError('Invalid request.');
      return Response.json(await handler(body.data, ctx.supabase));
    } catch (err) {
      if (err instanceof AiUnavailableError) return Response.json({ error: err.message }, { status: 503 });
      if (err instanceof BadRequestError) return Response.json({ error: err.message }, { status: 400 });
      console.error(err);
      return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  });
}

/** The real dependencies for callClaude: the Anthropic SDK plus the Postgres cache and log. */
export function productionDeps(supabase: SupabaseClient): ClaudeDeps {
  return { send: anthropicSender(), cache: supabaseCache(supabase), log: supabaseLog(supabase) };
}

/** Throws if a Supabase query failed, otherwise returns its data. */
export function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}
