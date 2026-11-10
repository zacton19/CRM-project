// The ONE place that talks to the Claude API. Edge Function handlers call `callClaude` and
// never touch the SDK directly. This module adds, around every request:
//
//   1. Caching   - same model + prompt version + input => reuse the saved response.
//   2. Retries   - 429 / 5xx / 529 errors are retried with exponential backoff + jitter.
//   3. Validation - the caller's `parse` function checks the reply's shape; a reply that
//                   fails is asked for once more, then we give up cleanly.
//   4. Logging   - every request writes a row to llm_call_log (tokens, cost, latency, ...).
//
// Everything with side effects (the API, the database, sleeping, randomness) comes in through
// `ClaudeDeps`, so the tests can swap in fakes and never make a real API call.

import {
  BASE_DELAY_MS,
  costUsd,
  Feature,
  MAX_DELAY_MS,
  MAX_RETRIES,
  MODELS,
  REQUEST_TIMEOUT_MS,
} from './config.ts';
import { Anthropic } from './deps.ts';

/** Everything in a Messages API request except the model, which comes from config. */
export type ClaudeParams = Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>;

export type LogEntry = {
  feature: Feature;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  cache_hit: boolean;
  attempts: number;
  success: boolean;
  error: string | null;
};

export interface ClaudeDeps {
  /** Sends one request to the API. Production: `anthropicSender()`. Tests: a fake. */
  send: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;
  cache: {
    get: (key: string) => Promise<Anthropic.Message | null>;
    set: (key: string, feature: Feature, message: Anthropic.Message) => Promise<void>;
  };
  log: (entry: LogEntry) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

/** Thrown when the AI can't produce an answer. `message` is safe to show to the user. */
export class AiUnavailableError extends Error {
  override name = 'AiUnavailableError';
}

/** Thrown by a `parse` function when Claude's reply doesn't have the expected shape. */
export class InvalidOutputError extends Error {
  override name = 'InvalidOutputError';
}

export type ClaudeRequest<T> = {
  feature: Feature;
  /** Bump this whenever the prompt or schema changes, so old cached answers aren't reused. */
  promptVersion: string;
  params: ClaudeParams;
  /** Turns the raw reply into the result the caller wants; throws InvalidOutputError if it can't. */
  parse: (message: Anthropic.Message) => T;
};

export async function callClaude<T>(
  request: ClaudeRequest<T>,
  deps: ClaudeDeps,
): Promise<{ result: T; cacheHit: boolean }> {
  const { feature, promptVersion, params, parse } = request;
  const model = MODELS[feature];
  const key = await cacheKey(model, promptVersion, params);

  // 1. Cache. A cached reply that no longer parses (e.g. the schema changed but the prompt
  //    version wasn't bumped) is ignored rather than trusted.
  const started = Date.now();
  const cached = await deps.cache.get(key);
  if (cached) {
    try {
      const result = parse(cached);
      await deps.log(logRow(feature, model, started, { cacheHit: true, attempts: 0 }));
      return { result, cacheHit: true };
    } catch {
      // fall through to a fresh call
    }
  }

  // 2-4. Up to two rounds: if the first reply fails validation, ask once more.
  for (let round = 1; round <= 2; round++) {
    const message = await sendWithRetry(feature, model, params, deps);
    const usage = { input: message.usage.input_tokens, output: message.usage.output_tokens };
    try {
      const result = parse(message);
      await deps.log(logRow(feature, model, started, { usage, attempts: round }));
      await deps.cache.set(key, feature, message);
      return { result, cacheHit: false };
    } catch (err) {
      if (!(err instanceof InvalidOutputError)) throw err;
      // We still paid for these tokens, so log them as a failed call.
      await deps.log(
        logRow(feature, model, started, { usage, attempts: round, error: `Invalid output: ${err.message}` }),
      );
    }
  }
  throw new AiUnavailableError('The AI gave an answer in an unexpected format. Please try again.');
}

/** Sends the request, retrying 429/5xx/529 errors with exponential backoff and jitter. */
async function sendWithRetry(
  feature: Feature,
  model: string,
  params: ClaudeParams,
  deps: ClaudeDeps,
): Promise<Anthropic.Message> {
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = deps.random ?? Math.random;
  const started = Date.now();

  for (let attempt = 1; ; attempt++) {
    try {
      return await deps.send({ ...params, model });
    } catch (err) {
      const retriesUsed = attempt - 1;
      if (isRetryable(err) && retriesUsed < MAX_RETRIES) {
        await sleep(backoffDelay(retriesUsed, random));
        continue;
      }
      await deps.log(
        logRow(feature, model, started, { attempts: attempt, error: describeError(err) }),
      );
      throw new AiUnavailableError(friendlyMessage(err));
    }
  }
}

/**
 * Only temporary problems are worth retrying: rate limits (429), server errors (500-599,
 * which includes 529 "overloaded"). Bad requests, auth errors and timeouts are not.
 */
export function isRetryable(err: unknown): boolean {
  return (
    err instanceof Anthropic.RateLimitError || // 429
    err instanceof Anthropic.InternalServerError // any status >= 500; OverloadedError (529) is a subclass
  );
}

/**
 * Exponential backoff with jitter: about 500ms, 1s, 2s, 4s... capped at 8s. Half of the delay
 * is fixed and half is random, so many clients that failed together don't all retry at the
 * same instant.
 */
export function backoffDelay(retryNumber: number, random: () => number = Math.random): number {
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** retryNumber);
  return exponential / 2 + random() * (exponential / 2);
}

/** sha-256 of everything that affects the answer. Same inputs => same key => cache hit. */
export async function cacheKey(model: string, promptVersion: string, params: ClaudeParams): Promise<string> {
  const text = JSON.stringify({ model, promptVersion, params });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function logRow(
  feature: Feature,
  model: string,
  started: number,
  opts: {
    cacheHit?: boolean;
    attempts: number;
    usage?: { input: number; output: number };
    error?: string;
  },
): LogEntry {
  const input = opts.usage?.input ?? 0;
  const output = opts.usage?.output ?? 0;
  return {
    feature,
    model,
    input_tokens: input,
    output_tokens: output,
    cost_usd: costUsd(model, input, output),
    latency_ms: Date.now() - started,
    cache_hit: opts.cacheHit ?? false,
    attempts: opts.attempts,
    success: !opts.error,
    error: opts.error ?? null,
  };
}

/** Short technical description for the log. Never includes the API key. */
function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.status ?? 'network'} ${err.name}: ${err.message}`;
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function friendlyMessage(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return 'The AI is busy right now. Please try again in a minute.';
  if (err instanceof Anthropic.AuthenticationError) return 'The AI service is not set up correctly (API key).';
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'The AI took too long to answer. Please try again.';
  return 'The AI service is unavailable right now. Everything else still works; try again later.';
}

/**
 * The production `send`: the official SDK with its own retries turned off (maxRetries: 0)
 * so the backoff above is the only retry logic, and every attempt is visible to us.
 */
export function anthropicSender(): ClaudeDeps['send'] {
  const client = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });
  return (params) => client.messages.create(params);
}
