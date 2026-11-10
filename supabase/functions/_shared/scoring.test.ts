import { assert, assertEquals, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';

import { callClaude, InvalidOutputError } from './claude.ts';
import { buildScoreRequest, MAX_INTERACTIONS, needsRescore, parseScore, RESCORE_AFTER_DAYS } from './scoring.ts';
import { fakeDeps, textMessage } from './testing.ts';

const json = (value: unknown) => textMessage(JSON.stringify(value));
const GOOD = { score: 78, rationale: 'Budget approved; waiting on sign-off.', top_signals: ['budget approved'] };

// --- Schema validation --------------------------------------------------------------------

Deno.test('parseScore accepts a valid score', () => {
  assertEquals(parseScore(json(GOOD)), GOOD);
});

for (const [name, value] of [
  ['score above 100', { ...GOOD, score: 120 }],
  ['negative score', { ...GOOD, score: -5 }],
  ['fractional score', { ...GOOD, score: 77.5 }],
  ['score as text', { ...GOOD, score: '78' }],
  ['missing rationale', { score: 50, top_signals: [] }],
  ['too many signals', { ...GOOD, top_signals: ['a', 'b', 'c', 'd', 'e', 'f'] }],
  ['extra field', { ...GOOD, probability: 0.78 }],
] as const) {
  Deno.test(`parseScore rejects: ${name}`, () => {
    assertThrows(() => parseScore(json(value)), InvalidOutputError);
  });
}

// --- The request --------------------------------------------------------------------------

const quote = {
  description: 'Office windows', amount: 650, status: 'sent', created_at: '2026-11-07T10:00:00Z', follow_up_date: null,
};

Deno.test('scoring uses Haiku and sends at most the most recent interactions', () => {
  const interactions = Array.from({ length: 12 }, (_, i) => ({
    kind: 'email', occurred_at: `2026-11-${String(12 - i).padStart(2, '0')}T09:00:00Z`, body: `message ${i}`,
  }));
  const request = buildScoreRequest({ today: '2026-11-12', clientName: 'Lakeside', quote, interactions });

  assertEquals(request.feature, 'score');
  const content = request.params.messages[0].content as string;
  assertStringIncludes(content, 'message 0'); // newest kept
  assert(!content.includes(`message ${MAX_INTERACTIONS}`)); // older ones dropped
  assertStringIncludes(content, '<history>');
});

Deno.test('a quote with no interactions says so instead of sending an empty history', () => {
  const request = buildScoreRequest({ today: '2026-11-12', clientName: 'X', quote, interactions: [] });
  assertStringIncludes(request.params.messages[0].content as string, '(no interactions yet)');
});

Deno.test('rescoring the same quote the same day is served from the cache', async () => {
  const { deps, sent } = fakeDeps([json(GOOD)]);
  const input = { today: '2026-11-12', clientName: 'X', quote, interactions: [] };

  await callClaude(buildScoreRequest(input), deps);
  const second = await callClaude(buildScoreRequest(input), deps);

  assertEquals(second.cacheHit, true);
  assertEquals(sent.length, 1);
});

// --- Which quotes need rescoring ----------------------------------------------------------

const NOW = new Date('2026-11-12T12:00:00Z');
const scoredYesterday = { scored_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z' };

Deno.test('needsRescore: never scored => yes', () => {
  assert(needsRescore({ scored_at: null, updated_at: '2026-11-01T00:00:00Z' }, [], NOW));
});

Deno.test('needsRescore: nothing changed since yesterday => no (skip, no API call)', () => {
  assertEquals(needsRescore(scoredYesterday, [{ updated_at: '2026-11-10T09:00:00Z' }], NOW), false);
});

Deno.test('needsRescore: a new or edited interaction since the score => yes', () => {
  assert(needsRescore(scoredYesterday, [{ updated_at: '2026-11-12T08:00:00Z' }], NOW));
});

Deno.test('needsRescore: the quote itself changed (e.g. status) => yes', () => {
  assert(needsRescore({ ...scoredYesterday, updated_at: '2026-11-12T08:00:00Z' }, [], NOW));
});

Deno.test(`needsRescore: a score older than ${RESCORE_AFTER_DAYS} days is refreshed`, () => {
  const old = { scored_at: '2026-11-01T12:00:00Z', updated_at: '2026-11-01T12:00:00Z' };
  assert(needsRescore(old, [], NOW));
});
