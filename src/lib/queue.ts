// "Today's follow-ups": what to work on first. Pure function, no imports, so it's easy to
// test (src/lib/queue.test.ts) and easy to reason about.
//
// Order:
//   1. Overdue:   an open to-do or a follow-up date that is already in the past.
//   2. Due today: an open to-do or a follow-up date that is today.
//   3. Everything else.
// Within each group, quotes with a higher lead score come first (unscored last), then bigger
// quotes first.
//
// Dates are "YYYY-MM-DD" strings, which sort correctly as plain text, so comparing them with
// < and === is enough.

export type QueueQuote = {
  id: string;
  client_id: string;
  client_name: string;
  description: string;
  amount: number;
  status: string;
  score: number | null;
  score_rationale: string | null;
  follow_up_date: string | null;
};

export type QueueClient = { id: string; name: string; follow_up_date: string | null };

export type QueueActionItem = {
  id: string;
  client_id: string;
  quote_id: string | null;
  description: string;
  due_date: string | null;
  done: boolean;
};

export type Urgency = 'overdue' | 'today' | 'later';

export type QueueEntry = {
  key: string;
  urgency: Urgency;
  clientId: string;
  /** Set for a quote entry; null for a client-level entry (e.g. a general follow-up). */
  quote: QueueQuote | null;
  title: string;
  reasons: string[];
  actionItems: QueueActionItem[];
};

const URGENCY_ORDER: Record<Urgency, number> = { overdue: 0, today: 1, later: 2 };

export function buildFollowUpQueue(input: {
  quotes: QueueQuote[];
  clients: QueueClient[];
  actionItems: QueueActionItem[];
  today: string;
}): QueueEntry[] {
  const { quotes, clients, today } = input;
  const openItems = input.actionItems.filter((item) => !item.done);
  const entries: QueueEntry[] = [];

  // One entry per open quote, carrying the to-dos that belong to it.
  for (const quote of quotes) {
    const items = openItems.filter((item) => item.quote_id === quote.id);
    entries.push({
      key: `quote:${quote.id}`,
      urgency: urgencyOf([quote.follow_up_date, ...items.map((i) => i.due_date)], today),
      clientId: quote.client_id,
      quote,
      title: quote.client_name,
      reasons: reasonsFor(quote.follow_up_date, items, today),
      actionItems: items,
    });
  }

  // Client-level entries: a client follow-up date, or to-dos not tied to an open quote.
  // These only appear when something is due, so the list doesn't fill with every client.
  const openQuoteIds = new Set(quotes.map((q) => q.id));
  for (const client of clients) {
    const items = openItems.filter(
      (item) => item.client_id === client.id && (!item.quote_id || !openQuoteIds.has(item.quote_id)),
    );
    const urgency = urgencyOf([client.follow_up_date, ...items.map((i) => i.due_date)], today);
    if (urgency === 'later') continue;
    entries.push({
      key: `client:${client.id}`,
      urgency,
      clientId: client.id,
      quote: null,
      title: client.name,
      reasons: reasonsFor(client.follow_up_date, items, today),
      actionItems: items,
    });
  }

  return entries.sort(
    (a, b) =>
      URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
      (b.quote?.score ?? -1) - (a.quote?.score ?? -1) ||
      (b.quote?.amount ?? 0) - (a.quote?.amount ?? 0),
  );
}

/** The most urgent of a set of dates (null dates are ignored). */
export function urgencyOf(dates: (string | null)[], today: string): Urgency {
  if (dates.some((d) => d !== null && d < today)) return 'overdue';
  if (dates.some((d) => d === today)) return 'today';
  return 'later';
}

function reasonsFor(followUp: string | null, items: QueueActionItem[], today: string): string[] {
  const reasons: string[] = [];
  const overdue = items.filter((i) => i.due_date !== null && i.due_date < today).length;
  const dueToday = items.filter((i) => i.due_date === today).length;
  if (overdue) reasons.push(`${overdue} overdue to-do${overdue > 1 ? 's' : ''}`);
  if (dueToday) reasons.push(`${dueToday} to-do${dueToday > 1 ? 's' : ''} due today`);
  if (followUp !== null && followUp < today) reasons.push('Follow-up overdue');
  if (followUp === today) reasons.push('Follow up today');
  return reasons;
}
