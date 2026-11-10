import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { callClaude } from './claude.ts';
import {
  addDays,
  buildSearchRequest,
  MAX_LIMIT,
  parseSearchReply,
  resolveDateValue,
  SEARCH_TOOL,
  startOfDayInZone,
  validateSearch,
} from './search.ts';
import { fakeDeps, fakeMessage, textMessage } from './testing.ts';

// Thursday 12 Nov 2026, in New York (UTC-5 in November).
const CTX = { today: '2026-11-12', timeZone: 'America/New_York' };

function search(filters: unknown[], sort: unknown = null, limit: unknown = null) {
  return validateSearch({ filters, sort, limit }, CTX);
}

function ok(result: ReturnType<typeof validateSearch>) {
  if (!result.ok) throw new Error(`expected ok, got: ${result.errors.join(' ')}`);
  return result.search;
}

function errors(result: ReturnType<typeof validateSearch>) {
  if (result.ok) throw new Error('expected the search to be rejected');
  return result.errors.join(' ');
}

// --- The headline example -----------------------------------------------------------------

Deno.test('"open quotes over $10k created this month" becomes safe query-builder calls', () => {
  const result = ok(
    search(
      [
        { field: 'status', op: 'eq', value: 'open' },
        { field: 'amount', op: 'gt', value: 10000 },
        { field: 'created_at', op: 'eq', value: 'this_month' },
      ],
      { field: 'amount', direction: 'desc' },
    ),
  );

  assertEquals(result.ops, [
    { method: 'in', column: 'status', value: ['draft', 'sent'] },
    { method: 'gt', column: 'amount', value: 10000 },
    { method: 'gte', column: 'created_at', value: '2026-11-01T00:00:00-05:00' },
    { method: 'lt', column: 'created_at', value: '2026-12-01T00:00:00-05:00' },
  ]);
  assertEquals(result.sort, { column: 'amount', ascending: false });
  assertEquals(
    result.description,
    'Showing quotes where status is open and amount > $10,000 and created between Nov 1, 2026 and Nov 30, 2026, amount highest first',
  );
});

Deno.test('no filters means all quotes, newest first, default limit', () => {
  const result = ok(search([]));
  assertEquals(result.ops, []);
  assertEquals(result.sort, { column: 'created_at', ascending: false });
  assertEquals(result.limit, 20);
  assertStringIncludes(result.description, '(all quotes)');
});

Deno.test('limit is capped', () => {
  assertEquals(ok(search([], null, 10_000)).limit, MAX_LIMIT);
  assertEquals(ok(search([], null, 0)).limit, 20);
});

// --- Rejecting things that don't fit ------------------------------------------------------

Deno.test('fields outside the allowlist are rejected (including real columns like user_id)', () => {
  assertStringIncludes(errors(search([{ field: 'user_id', op: 'eq', value: 'x' }])), '"user_id" isn\'t something');
  assertStringIncludes(errors(search([{ field: 'notes', op: 'contains', value: 'x' }])), 'isn\'t something');
});

Deno.test('operators that do not suit the field are rejected', () => {
  assertStringIncludes(errors(search([{ field: 'status', op: 'gt', value: 'sent' }])), 'Can\'t use "gt" with status');
  assertStringIncludes(errors(search([{ field: 'amount', op: 'contains', value: 5 }])), 'Can\'t use "contains"');
  assertStringIncludes(errors(search([{ field: 'amount', op: 'neq', value: 5 }])), 'Can\'t use "neq"');
});

Deno.test('wrong value types are rejected', () => {
  assertStringIncludes(errors(search([{ field: 'amount', op: 'gt', value: '10k' }])), 'needs a number');
  assertStringIncludes(errors(search([{ field: 'score', op: 'gt', value: 150 }])), 'out of range');
  assertStringIncludes(errors(search([{ field: 'status', op: 'eq', value: 'won' }])), 'Status must be one of');
  assertStringIncludes(errors(search([{ field: 'created_at', op: 'eq', value: 'someday' }])), 'needs a date');
  assertStringIncludes(errors(search([{ field: 'created_at', op: 'eq', value: '2026-02-30' }])), 'needs a date');
  assertStringIncludes(errors(search([{ field: 'amount', op: 'between', value: 5 }])), '"between" needs two');
  assertStringIncludes(errors(search([{ field: 'amount', op: 'between', value: [900, 100] }])), 'smaller one');
});

Deno.test('a badly shaped tool call or bad sort field is rejected', () => {
  assertStringIncludes(errors(validateSearch({ filters: 'all' }, CTX)), 'unexpected shape');
  assertStringIncludes(errors(validateSearch({ filters: [], sort: null, limit: null, sql: 'x' }, CTX)), 'unexpected shape');
  assertStringIncludes(errors(search([], { field: 'description', direction: 'asc' })), 'Can\'t sort by');
  assertStringIncludes(errors(search([], { field: 'user_id', direction: 'asc' })), 'Can\'t sort by');
});

// --- Injection attempts -------------------------------------------------------------------

Deno.test('injection attempts in field or op names are rejected outright', () => {
  for (const field of ['amount; drop table quotes', 'amount)', 'clients.name', '__proto__', 'constructor']) {
    assertEquals(search([{ field, op: 'eq', value: 1 }]).ok, false, field);
  }
  for (const op of ['in.(1,2)', 'eq.1&user_id=eq', 'not.eq']) {
    assertEquals(search([{ field: 'amount', op, value: 1 }]).ok, false, op);
  }
});

Deno.test('SQL-looking text values stay plain data in a parameter', () => {
  const evil = "x'); drop table quotes; --";
  const result = ok(search([{ field: 'client_name', op: 'contains', value: evil }]));
  assertEquals(result.ops, [{ method: 'ilike', column: 'clients.name', value: `%${evil}%` }]);
});

Deno.test('% and _ in the user text are escaped so they are not wildcards', () => {
  const result = ok(search([{ field: 'description', op: 'contains', value: '100%_off' }]));
  assertEquals(result.ops[0].value, '%100\\%\\_off%');
});

// --- Date resolution ----------------------------------------------------------------------

Deno.test('periods resolve relative to today (Thursday 12 Nov 2026)', () => {
  const t = CTX.today;
  assertEquals(resolveDateValue('today', t), { start: '2026-11-12', end: '2026-11-12' });
  assertEquals(resolveDateValue('yesterday', t), { start: '2026-11-11', end: '2026-11-11' });
  assertEquals(resolveDateValue('this_week', t), { start: '2026-11-09', end: '2026-11-15' }); // Mon-Sun
  assertEquals(resolveDateValue('last_week', t), { start: '2026-11-02', end: '2026-11-08' });
  assertEquals(resolveDateValue('next_week', t), { start: '2026-11-16', end: '2026-11-22' });
  assertEquals(resolveDateValue('this_month', t), { start: '2026-11-01', end: '2026-11-30' });
  assertEquals(resolveDateValue('last_month', t), { start: '2026-10-01', end: '2026-10-31' });
  assertEquals(resolveDateValue('next_month', t), { start: '2026-12-01', end: '2026-12-31' });
  assertEquals(resolveDateValue('this_year', t), { start: '2026-01-01', end: '2026-12-31' });
  assertEquals(resolveDateValue('last_7_days', t), { start: '2026-11-06', end: '2026-11-12' });
  assertEquals(resolveDateValue('This_Month', t)?.start, '2026-11-01'); // case-insensitive
  assertEquals(resolveDateValue('next_decade', t), null);
});

Deno.test('month and year boundaries, including leap years', () => {
  assertEquals(resolveDateValue('this_month', '2028-02-10'), { start: '2028-02-01', end: '2028-02-29' });
  assertEquals(resolveDateValue('this_month', '2027-02-10'), { start: '2027-02-01', end: '2027-02-28' });
  assertEquals(resolveDateValue('last_month', '2027-01-15'), { start: '2026-12-01', end: '2026-12-31' });
  assertEquals(resolveDateValue('next_month', '2026-12-31'), { start: '2027-01-01', end: '2027-01-31' });
  assertEquals(resolveDateValue('this_week', '2026-11-15'), { start: '2026-11-09', end: '2026-11-15' }); // Sunday
  assertEquals(addDays('2026-12-31', 1), '2027-01-01');
});

Deno.test('date operators map onto the right side of the range', () => {
  const ops = (op: string, value: unknown) => ok(search([{ field: 'follow_up_date', op, value }])).ops;
  assertEquals(ops('eq', 'this_week'), [
    { method: 'gte', column: 'follow_up_date', value: '2026-11-09' },
    { method: 'lte', column: 'follow_up_date', value: '2026-11-15' },
  ]);
  assertEquals(ops('gt', '2026-11-12'), [{ method: 'gte', column: 'follow_up_date', value: '2026-11-13' }]);
  assertEquals(ops('lt', 'this_month'), [{ method: 'lte', column: 'follow_up_date', value: '2026-10-31' }]);
  assertEquals(ops('lte', 'today'), [{ method: 'lte', column: 'follow_up_date', value: '2026-11-12' }]);
  assertEquals(ops('between', ['last_month', 'this_month']), [
    { method: 'gte', column: 'follow_up_date', value: '2026-10-01' },
    { method: 'lte', column: 'follow_up_date', value: '2026-11-30' },
  ]);
  assertEquals(search([{ field: 'follow_up_date', op: 'between', value: ['next_month', 'last_month'] }]).ok, false);
});

Deno.test('timestamps use midnight in the user time zone, including daylight saving', () => {
  assertEquals(startOfDayInZone('2026-11-01', 'America/New_York'), '2026-11-01T00:00:00-05:00'); // EST
  assertEquals(startOfDayInZone('2026-07-01', 'America/New_York'), '2026-07-01T00:00:00-04:00'); // EDT
  assertEquals(startOfDayInZone('2026-07-01', 'UTC'), '2026-07-01T00:00:00+00:00');
  assertEquals(startOfDayInZone('2026-07-01', 'Not/AZone'), '2026-07-01T00:00:00+00:00');
});

// --- Claude's side: tool call vs. clarification -------------------------------------------

Deno.test('the request offers only the search tool, strict, with auto tool choice', () => {
  const request = buildSearchRequest('big quotes', CTX.today);
  assertEquals(request.feature, 'search');
  assertEquals(request.params.tools?.length, 1);
  assertEquals(SEARCH_TOOL.strict, true);
  assertEquals(request.params.tool_choice, { type: 'auto' });
  assertStringIncludes(request.params.messages[0].content as string, 'Today is Thursday 2026-11-12');
  assertStringIncludes(request.params.messages[0].content as string, '<question>\nbig quotes\n</question>');
});

Deno.test('a tool call is returned as tool input; a text reply becomes a clarification', () => {
  const input = { filters: [], sort: null, limit: null };
  const toolReply = fakeMessage([{ type: 'tool_use', id: 't1', name: 'search_quotes', input }], undefined, 'tool_use');
  assertEquals(parseSearchReply(toolReply), { kind: 'tool', input });

  const textReply = textMessage('I can search quotes by amount, status, dates or client.');
  assertEquals(parseSearchReply(textReply).kind, 'text');
});

Deno.test('the same question on the same day is answered from the cache', async () => {
  const input = { filters: [{ field: 'amount', op: 'gt', value: 500 }], sort: null, limit: null };
  const reply = fakeMessage([{ type: 'tool_use', id: 't1', name: 'search_quotes', input }], undefined, 'tool_use');
  const { deps, sent } = fakeDeps([reply]);

  await callClaude(buildSearchRequest('quotes over $500', CTX.today), deps);
  const second = await callClaude(buildSearchRequest('quotes over $500', CTX.today), deps);

  assert(second.cacheHit);
  assertEquals(sent.length, 1);
});
