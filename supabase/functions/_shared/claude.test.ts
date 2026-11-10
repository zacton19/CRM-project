import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import {
  AiUnavailableError,
  backoffDelay,
  callClaude,
  ClaudeRequest,
  InvalidOutputError,
  isRetryable,
} from './claude.ts';
import { MAX_DELAY_MS, MAX_RETRIES } from './config.ts';
import { Anthropic } from './deps.ts';
import { apiError, fakeDeps, textMessage } from './testing.ts';

/** A request whose parse step accepts any text reply except "bad". */
function request(promptVersion = 'v1', input = 'hello'): ClaudeRequest<string> {
  return {
    feature: 'analyze',
    promptVersion,
    params: { max_tokens: 100, messages: [{ role: 'user', content: input }] },
    parse: (message) => {
      const block = message.content[0];
      if (block?.type !== 'text' || block.text === 'bad') throw new InvalidOutputError('bad reply');
      return block.text;
    },
  };
}

// --- Happy path, logging and cost ---------------------------------------------------------

Deno.test('a successful call returns the parsed result, logs tokens and cost, and caches it', async () => {
  const { deps, sent, logs, cache } = fakeDeps([textMessage('ok')]);

  const { result, cacheHit } = await callClaude(request(), deps);

  assertEquals(result, 'ok');
  assertEquals(cacheHit, false);
  assertEquals(sent.length, 1);
  assertEquals(sent[0].model, 'claude-sonnet-5-5'); // analyze uses Sonnet
  assertEquals(cache.size, 1);
  assertEquals(logs.length, 1);
  assertEquals(logs[0].success, true);
  assertEquals(logs[0].input_tokens, 1000);
  assertEquals(logs[0].output_tokens, 200);
  // 1000 input * $2/M + 200 output * $10/M = $0.002 + $0.002
  assertEquals(logs[0].cost_usd, 0.004);
});

// --- Caching ------------------------------------------------------------------------------

Deno.test('the same request twice hits the cache and makes only one API call', async () => {
  const { deps, sent, logs } = fakeDeps([textMessage('ok')]);

  await callClaude(request(), deps);
  const second = await callClaude(request(), deps);

  assertEquals(second, { result: 'ok', cacheHit: true });
  assertEquals(sent.length, 1);
  assertEquals(logs[1].cache_hit, true);
  assertEquals(logs[1].input_tokens, 0); // a cache hit costs nothing
  assertEquals(logs[1].cost_usd, 0);
});

Deno.test('a different input or prompt version misses the cache', async () => {
  const { deps, sent } = fakeDeps([textMessage('a'), textMessage('b'), textMessage('c')]);

  await callClaude(request('v1', 'hello'), deps);
  await callClaude(request('v1', 'different text'), deps);
  await callClaude(request('v2', 'hello'), deps);

  assertEquals(sent.length, 3);
});

Deno.test('a cached reply that no longer parses is ignored and fetched again', async () => {
  const { deps, sent, cache } = fakeDeps([textMessage('bad'), textMessage('bad'), textMessage('fresh')]);
  // Poison the cache by pre-filling it via a request whose parse accepts anything.
  await callClaude({ ...request(), parse: () => 'anything' }, deps);
  assertEquals(cache.size, 1);

  const { result, cacheHit } = await callClaude(request(), deps);

  assertEquals(result, 'fresh');
  assertEquals(cacheHit, false);
  assertEquals(sent.length, 3);
});

// --- Retries and backoff ------------------------------------------------------------------

for (const status of [429, 500, 503, 529]) {
  Deno.test(`HTTP ${status} is retried after a backoff, then succeeds`, async () => {
    const { deps, sent, sleeps, logs } = fakeDeps([apiError(status), textMessage('ok')]);

    const { result } = await callClaude(request(), deps);

    assertEquals(result, 'ok');
    assertEquals(sent.length, 2);
    assertEquals(sleeps, [backoffDelay(0, () => 0.5)]);
    assertEquals(logs.length, 1);
    assertEquals(logs[0].success, true);
  });
}

Deno.test('backoff doubles each retry until the API recovers', async () => {
  const { deps, sleeps } = fakeDeps([apiError(529), apiError(529), apiError(429), textMessage('ok')]);

  await callClaude(request(), deps);

  // random() = 0.5 => 75% of 500ms, 1000ms, 2000ms
  assertEquals(sleeps, [375, 750, 1500]);
});

Deno.test(`gives up after ${MAX_RETRIES} retries with a user-friendly error and a failure log`, async () => {
  const errors = Array.from({ length: MAX_RETRIES + 1 }, () => apiError(529));
  const { deps, sent, logs, cache } = fakeDeps(errors);

  const err = await assertRejects(() => callClaude(request(), deps), AiUnavailableError);

  assert(err.message.includes('unavailable'));
  assertEquals(sent.length, MAX_RETRIES + 1);
  assertEquals(logs.length, 1);
  assertEquals(logs[0].success, false);
  assertEquals(logs[0].attempts, MAX_RETRIES + 1);
  assert(logs[0].error?.includes('529'));
  assertEquals(cache.size, 0);
});

for (const status of [400, 401, 404]) {
  Deno.test(`HTTP ${status} is NOT retried (retrying would fail the same way)`, async () => {
    const { deps, sent, sleeps } = fakeDeps([apiError(status), textMessage('never reached')]);

    await assertRejects(() => callClaude(request(), deps), AiUnavailableError);

    assertEquals(sent.length, 1);
    assertEquals(sleeps, []);
  });
}

Deno.test('a timeout is not retried, to keep the worst-case wait short', async () => {
  const { deps, sent } = fakeDeps([new Anthropic.APIConnectionTimeoutError()]);

  const err = await assertRejects(() => callClaude(request(), deps), AiUnavailableError);

  assertEquals(sent.length, 1);
  assert(err.message.includes('too long'));
});

Deno.test('isRetryable: only 429 and 5xx (including 529 overloaded)', () => {
  assert(isRetryable(apiError(429)));
  assert(isRetryable(apiError(500)));
  assert(isRetryable(apiError(529)));
  assert(apiError(529) instanceof Anthropic.OverloadedError);
  assertEquals(isRetryable(apiError(400)), false);
  assertEquals(isRetryable(new Error('random bug')), false);
});

Deno.test('backoffDelay grows exponentially, is capped, and stays within its jitter range', () => {
  assertEquals(backoffDelay(0, () => 0), 250); // half of 500
  assertEquals(backoffDelay(0, () => 1), 500);
  assertEquals(backoffDelay(3, () => 1), 4000);
  assertEquals(backoffDelay(10, () => 1), MAX_DELAY_MS); // capped
  for (let i = 0; i < 100; i++) {
    const d = backoffDelay(2);
    assert(d >= 1000 && d <= 2000, `delay ${d} out of range`);
  }
});

// --- Output validation --------------------------------------------------------------------

Deno.test('an invalid reply is retried once; the bad attempt is logged as a failure', async () => {
  const { deps, sent, logs } = fakeDeps([textMessage('bad'), textMessage('good')]);

  const { result } = await callClaude(request(), deps);

  assertEquals(result, 'good');
  assertEquals(sent.length, 2);
  assertEquals(logs.map((l) => l.success), [false, true]);
  assert(logs[0].error?.startsWith('Invalid output'));
  assertEquals(logs[0].input_tokens, 1000); // we still paid for the bad reply
});

Deno.test('two invalid replies in a row fail gracefully and cache nothing', async () => {
  const { deps, sent, cache } = fakeDeps([textMessage('bad'), textMessage('bad')]);

  await assertRejects(() => callClaude(request(), deps), AiUnavailableError, 'unexpected format');

  assertEquals(sent.length, 2);
  assertEquals(cache.size, 0);
});
