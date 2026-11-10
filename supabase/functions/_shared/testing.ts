// Test helpers: fake versions of everything callClaude talks to. No real API calls are made.

import { ClaudeDeps, LogEntry } from './claude.ts';
import { Anthropic } from './deps.ts';

/** A minimal Messages API response containing the given content blocks. */
export function fakeMessage(
  content: unknown[],
  usage = { input_tokens: 1000, output_tokens: 200 },
  stopReason: Anthropic.Message['stop_reason'] = 'end_turn',
): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'test-model',
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  } as unknown as Anthropic.Message;
}

export function textMessage(text: string): Anthropic.Message {
  return fakeMessage([{ type: 'text', text, citations: null }]);
}

/** An SDK error exactly as the SDK would create it for this HTTP status. */
export function apiError(status: number): Error {
  return Anthropic.APIError.generate(
    status,
    { type: 'error', error: { type: 'test_error', message: `HTTP ${status}` } },
    `HTTP ${status}`,
    new Headers(),
  );
}

/**
 * Fake dependencies. `responses` are returned (or thrown, if they're Errors) by `send`, in
 * order. Inspect `sent`, `logs`, `sleeps` and `cache` afterwards.
 */
export function fakeDeps(responses: (Anthropic.Message | Error)[]) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const logs: LogEntry[] = [];
  const sleeps: number[] = [];
  const cache = new Map<string, Anthropic.Message>();
  const queue = [...responses];

  const deps: ClaudeDeps = {
    send: (params) => {
      sent.push(params);
      const next = queue.shift();
      if (!next) throw new Error('fakeDeps: no more responses queued');
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    cache: {
      get: (key) => Promise.resolve(cache.get(key) ?? null),
      set: (key, _feature, message) => {
        cache.set(key, message);
        return Promise.resolve();
      },
    },
    log: (entry) => {
      logs.push(entry);
      return Promise.resolve();
    },
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0.5,
  };
  return { deps, sent, logs, sleeps, cache };
}
