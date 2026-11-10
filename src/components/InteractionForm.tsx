import { useState } from 'react';
import { View } from 'react-native';

import { formatMoney } from '@/lib/format';
import { Interaction, INTERACTION_KINDS, InteractionInput, InteractionKind, Quote } from '@/lib/types';

import { DateTimeField } from './DateTimeField';
import { Button, Chip, ErrorText, Field, Label, styles } from './ui';

const KIND_LABELS: Record<InteractionKind, string> = {
  email: 'Email',
  call: 'Call',
  visit: 'Site visit',
  note: 'Note',
};

type Props = {
  clientId: string;
  /** The client's quotes, so the interaction can optionally be linked to one. */
  quotes: Quote[];
  initial?: Interaction;
  initialQuoteId?: string | null;
  onSubmit: (input: InteractionInput) => Promise<void>;
};

export function InteractionForm({ clientId, quotes, initial, initialQuoteId = null, onSubmit }: Props) {
  const [kind, setKind] = useState<InteractionKind>(initial?.kind ?? 'email');
  const [quoteId, setQuoteId] = useState<string | null>(initial ? initial.quote_id : initialQuoteId);
  const [occurredAt, setOccurredAt] = useState(initial ? new Date(initial.occurred_at) : new Date());
  const [body, setBody] = useState(initial?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        client_id: clientId,
        quote_id: quoteId,
        kind,
        body: body.trim(),
        occurred_at: occurredAt.toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Label>Type</Label>
        <View style={styles.wrap}>
          {INTERACTION_KINDS.map((k) => (
            <Chip key={k} label={KIND_LABELS[k]} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </View>
      </View>

      {quotes.length > 0 && (
        <View style={{ gap: 6 }}>
          <Label>About quote</Label>
          <View style={styles.wrap}>
            <Chip label="None" selected={quoteId === null} onPress={() => setQuoteId(null)} />
            {quotes.map((q) => (
              <Chip
                key={q.id}
                label={`${q.description.slice(0, 24)} · ${formatMoney(q.amount)}`}
                selected={quoteId === q.id}
                onPress={() => setQuoteId(q.id)}
              />
            ))}
          </View>
        </View>
      )}

      <DateTimeField label="When" value={occurredAt} onChange={setOccurredAt} />

      <Field
        label="Text *"
        value={body}
        onChangeText={setBody}
        multiline
        style={{ minHeight: 200 }}
        placeholder="Paste the email thread, or type what was said on the call or visit"
      />
      <ErrorText error={error} />
      <Button title="Save" onPress={submit} loading={saving} disabled={!body.trim()} />
    </View>
  );
}

export function interactionKindLabel(kind: InteractionKind): string {
  return KIND_LABELS[kind];
}
