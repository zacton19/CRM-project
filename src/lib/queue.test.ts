// Run with `npm test` (Deno). Not part of the app bundle: nothing in the app imports it.
import { assertEquals } from 'jsr:@std/assert@1';

import { buildFollowUpQueue, QueueActionItem, QueueQuote, urgencyOf } from './queue.ts';

const TODAY = '2026-11-12';

function quote(id: string, score: number | null, extra: Partial<QueueQuote> = {}): QueueQuote {
  return {
    id, client_id: `c-${id}`, client_name: `Client ${id}`, description: 'Windows', amount: 100,
    status: 'sent', score, score_rationale: null, follow_up_date: null, ...extra,
  };
}

function item(id: string, quoteId: string | null, due: string | null, extra: Partial<QueueActionItem> = {}) {
  return { id, client_id: quoteId ? `c-${quoteId}` : 'c-x', quote_id: quoteId, description: id, due_date: due, done: false, ...extra };
}

const order = (entries: { key: string }[]) => entries.map((e) => e.key);

Deno.test('with nothing due, quotes are ranked by score, unscored last', () => {
  const queue = buildFollowUpQueue({
    quotes: [quote('low', 20), quote('none', null), quote('high', 90), quote('mid', 55)],
    clients: [], actionItems: [], today: TODAY,
  });
  assertEquals(order(queue), ['quote:high', 'quote:mid', 'quote:low', 'quote:none']);
});

Deno.test('overdue to-dos come first, then things due today, then by score', () => {
  const queue = buildFollowUpQueue({
    quotes: [quote('hot', 95), quote('overdue', 10), quote('today', 40)],
    clients: [],
    actionItems: [item('a', 'overdue', '2026-11-10'), item('b', 'today', TODAY)],
    today: TODAY,
  });
  assertEquals(order(queue), ['quote:overdue', 'quote:today', 'quote:hot']);
  assertEquals(queue[0].reasons, ['1 overdue to-do']);
  assertEquals(queue[1].urgency, 'today');
});

Deno.test('a follow-up date due today or earlier also moves a quote up', () => {
  const queue = buildFollowUpQueue({
    quotes: [quote('hot', 95), quote('followup', 30, { follow_up_date: TODAY })],
    clients: [], actionItems: [], today: TODAY,
  });
  assertEquals(order(queue), ['quote:followup', 'quote:hot']);
  assertEquals(queue[0].reasons, ['Follow up today']);
});

Deno.test('done to-dos and future dates do not make anything urgent', () => {
  const queue = buildFollowUpQueue({
    quotes: [quote('a', 50), quote('b', 60, { follow_up_date: '2026-12-01' })],
    clients: [],
    actionItems: [item('done', 'a', '2026-11-01', { done: true }), item('future', 'a', '2026-11-20')],
    today: TODAY,
  });
  assertEquals(order(queue), ['quote:b', 'quote:a']);
  assertEquals(queue.every((e) => e.urgency === 'later'), true);
});

Deno.test('ties on urgency and score go to the bigger quote', () => {
  const queue = buildFollowUpQueue({
    quotes: [quote('small', 50, { amount: 200 }), quote('big', 50, { amount: 5000 })],
    clients: [], actionItems: [], today: TODAY,
  });
  assertEquals(order(queue), ['quote:big', 'quote:small']);
});

Deno.test('client follow-ups appear only when due, and to-dos stay with their quote', () => {
  const queue = buildFollowUpQueue({
    quotes: [quote('q', 70)],
    clients: [
      { id: 'c-due', name: 'Due client', follow_up_date: '2026-11-11' },
      { id: 'c-later', name: 'Later client', follow_up_date: '2026-12-25' },
      { id: 'c-q', name: 'Client q', follow_up_date: null },
    ],
    actionItems: [item('on-quote', 'q', '2026-11-01')],
    today: TODAY,
  });
  assertEquals(order(queue), ['quote:q', 'client:c-due']);
  assertEquals(queue[0].actionItems.length, 1);
  assertEquals(queue[1].reasons, ['Follow-up overdue']);
});

Deno.test('urgencyOf compares YYYY-MM-DD strings', () => {
  assertEquals(urgencyOf([null, '2026-11-11'], TODAY), 'overdue');
  assertEquals(urgencyOf(['2026-11-12'], TODAY), 'today');
  assertEquals(urgencyOf(['2026-11-13', null], TODAY), 'later');
  assertEquals(urgencyOf([], TODAY), 'later');
});
