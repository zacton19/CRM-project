import { useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { parseAmount } from '@/lib/format';
import { Client, DEFAULT_REMINDERS, Job, JobInput, ReminderSettings } from '@/lib/types';

import { ClientPicker } from './ClientPicker';
import { DateTimeField } from './DateTimeField';
import { ReminderPicker } from './ReminderPicker';
import { colors } from './theme';
import { Button, Card, Chip, ErrorText, Field, FormScreen, Label, styles } from './ui';

const DEFAULT_TITLE = 'Window clean';
const DEFAULT_DURATION_MINUTES = 60;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

type RepeatMode = 'none' | 6 | 12 | 'other';

export type JobFormValues = { input: JobInput; intervalMonths: number | null; applyToFuture: boolean };

type Props = {
  initial?: Job;
  defaults?: {
    client?: Pick<Client, 'id' | 'name'> | null;
    startsAt?: Date;
    title?: string;
    price?: string;
  };
  onSubmit: (values: JobFormValues) => Promise<void>;
};

export function JobForm({ initial, defaults = {}, onSubmit }: Props) {
  const isEdit = !!initial;
  const [client, setClient] = useState<Pick<Client, 'id' | 'name'> | null>(
    initial?.client ?? defaults.client ?? null,
  );
  const [startsAt, setStartsAt] = useState(
    initial ? new Date(initial.starts_at) : (defaults.startsAt ?? new Date()),
  );
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : (defaults.price ?? ''));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [repeat, setRepeat] = useState<RepeatMode>('none');
  const [otherMonths, setOtherMonths] = useState(3);
  const [customReminders, setCustomReminders] = useState<ReminderSettings | null>(initial?.reminders ?? null);
  const [applyToFuture, setApplyToFuture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedPrice = parseAmount(price);
  const intervalMonths = repeat === 'none' ? null : repeat === 'other' ? otherMonths : repeat;

  const submit = async () => {
    // Explain what's missing instead of silently disabling the button.
    if (!client) {
      setError('Choose a client: tap one in the list, or tap “Add” to create a new one.');
      return;
    }
    if (Number.isNaN(parsedPrice)) {
      setError('Price must be a number, e.g. 25 or 25.50.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        input: {
          client_id: client.id,
          // Not editable in the form; existing jobs keep theirs.
          title: initial?.title ?? defaults.title ?? DEFAULT_TITLE,
          starts_at: startsAt.toISOString(),
          duration_minutes: initial?.duration_minutes ?? DEFAULT_DURATION_MINUTES,
          price: parsedPrice,
          notes: notes.trim() || null,
          address: address.trim() || null,
          reminders: customReminders,
        },
        intervalMonths,
        applyToFuture,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <FormScreen>
      <ClientPicker value={client} onChange={setClient} />
      <DateTimeField label="Start" value={startsAt} onChange={setStartsAt} />

      <Field
        label="Price"
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      {!isEdit && (
        <View style={{ gap: 6 }}>
          <Label>Repeat</Label>
          <View style={styles.wrap}>
            <Chip label="One-off" selected={repeat === 'none'} onPress={() => setRepeat('none')} />
            <Chip label="Every 6 months" selected={repeat === 6} onPress={() => setRepeat(6)} />
            <Chip label="Every 12 months" selected={repeat === 12} onPress={() => setRepeat(12)} />
            <Chip label="Other" selected={repeat === 'other'} onPress={() => setRepeat('other')} />
          </View>
          {repeat === 'other' && (
            <View style={{ gap: 6, marginTop: 4 }}>
              <Text style={styles.muted}>Every how many months?</Text>
              <View style={styles.wrap}>
                {MONTHS.map((m) => (
                  <Chip
                    key={m}
                    label={String(m)}
                    selected={otherMonths === m}
                    onPress={() => setOtherMonths(m)}
                  />
                ))}
              </View>
            </View>
          )}
          {intervalMonths && (
            <Text style={styles.muted}>
              Repeats every {intervalMonths === 1 ? 'month' : `${intervalMonths} months`}. Upcoming visits are
              added automatically.
            </Text>
          )}
        </View>
      )}

      <Field
        label="Address"
        value={address}
        onChangeText={setAddress}
        placeholder="Leave blank to use the client's address"
      />

      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />

      <Card style={{ gap: 12 }}>
        <View style={styles.row}>
          <Text style={styles.body}>Use default reminders</Text>
          <Switch
            value={customReminders == null}
            trackColor={{ true: colors.primary }}
            onValueChange={(useDefault) => setCustomReminders(useDefault ? null : DEFAULT_REMINDERS)}
          />
        </View>
        {customReminders && <ReminderPicker value={customReminders} onChange={setCustomReminders} />}
      </Card>

      {isEdit && initial.series_id && (
        <Card>
          <View style={styles.row}>
            <Text style={[styles.body, { flex: 1 }]}>Apply to all future visits in this series</Text>
            <Switch
              value={applyToFuture}
              trackColor={{ true: colors.primary }}
              onValueChange={setApplyToFuture}
            />
          </View>
          <Text style={styles.muted}>
            Updates price, address, notes and reminders. Dates stay as they are.
          </Text>
        </Card>
      )}

      <ErrorText error={error} />
      <Button title={isEdit ? 'Save job' : 'Schedule job'} onPress={submit} loading={saving} />
    </FormScreen>
  );
}
