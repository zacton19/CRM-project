import { useState } from 'react';
import { View } from 'react-native';

import { parseAmount } from '@/lib/format';
import { Client, Quote, QUOTE_STATUSES, QuoteInput, QuoteStatus } from '@/lib/types';

import { ClientPicker } from './ClientPicker';
import { Button, Chip, ErrorText, Field, Label, styles } from './ui';

type Props = {
  initial?: Quote;
  initialClient?: Pick<Client, 'id' | 'name'> | null;
  onSubmit: (input: QuoteInput) => Promise<void>;
};

export function QuoteForm({ initial, initialClient = null, onSubmit }: Props) {
  const [client, setClient] = useState<Pick<Client, 'id' | 'name'> | null>(initial?.client ?? initialClient);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [status, setStatus] = useState<QuoteStatus>(initial?.status ?? 'draft');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseAmount(amount);
  const valid = !!client && !!description.trim() && parsedAmount != null && !Number.isNaN(parsedAmount);

  const submit = async () => {
    if (!client || parsedAmount == null) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        client_id: client.id,
        description: description.trim(),
        amount: parsedAmount,
        status,
        notes: notes.trim() || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <ClientPicker value={client} onChange={setClient} />
      <Field
        label="Description *"
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. Front & back windows, conservatory roof"
      />
      <Field
        label="Amount *"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <View style={{ gap: 6 }}>
        <Label>Status</Label>
        <View style={styles.wrap}>
          {QUOTE_STATUSES.map((s) => (
            <Chip
              key={s}
              label={s[0].toUpperCase() + s.slice(1)}
              selected={status === s}
              onPress={() => setStatus(s)}
            />
          ))}
        </View>
      </View>
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      <ErrorText error={error} />
      <Button title="Save quote" onPress={submit} loading={saving} disabled={!valid} />
    </View>
  );
}
