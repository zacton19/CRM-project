import { useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { formatDuration, parseAmount } from '@/lib/format';
import { Client, DEFAULT_REMINDERS, Job, JobInput, ReminderSettings } from '@/lib/types';

import { ClientPicker } from './ClientPicker';
import { DateTimeField } from './DateTimeField';
import { ReminderPicker } from './ReminderPicker';
import { colors } from './theme';
import { Button, Card, Chip, ErrorText, Field, FormScreen, Label, styles } from './ui';

const DURATIONS = [30, 45, 60, 90, 120, 180];
const REPEATS = [null, 2, 4, 6, 8, 12];

export type JobFormValues = { input: JobInput; intervalWeeks: number | null; applyToFuture: boolean };

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
  const [title, setTitle] = useState(initial?.title ?? defaults.title ?? 'Window clean');
  const [startsAt, setStartsAt] = useState(
    initial ? new Date(initial.starts_at) : (defaults.startsAt ?? new Date()),
  );
  const [duration, setDuration] = useState(initial?.duration_minutes ?? 60);
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : (defaults.price ?? ''));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [intervalWeeks, setIntervalWeeks] = useState<number | null>(null);
  const [customReminders, setCustomReminders] = useState<ReminderSettings | null>(initial?.reminders ?? null);
  const [applyToFuture, setApplyToFuture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedPrice = parseAmount(price);
  const valid = !!client && !!title.trim() && !Number.isNaN(parsedPrice);

  const submit = async () => {
    if (!client) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        input: {
          client_id: client.id,
          title: title.trim(),
          starts_at: startsAt.toISOString(),
          duration_minutes: duration,
          price: parsedPrice,
          notes: notes.trim() || null,
          reminders: customReminders,
        },
        intervalWeeks,
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
      <Field label="Job *" value={title} onChangeText={setTitle} />
      <DateTimeField label="Start" value={startsAt} onChange={setStartsAt} />

      <View style={{ gap: 6 }}>
        <Label>Duration</Label>
        <View style={styles.wrap}>
          {DURATIONS.map((m) => (
            <Chip
              key={m}
              label={formatDuration(m)}
              selected={duration === m}
              onPress={() => setDuration(m)}
            />
          ))}
        </View>
      </View>

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
            {REPEATS.map((w) => (
              <Chip
                key={w ?? 0}
                label={w ? `Every ${w} weeks` : 'One-off'}
                selected={intervalWeeks === w}
                onPress={() => setIntervalWeeks(w)}
              />
            ))}
          </View>
          {intervalWeeks && (
            <Text style={styles.muted}>Visits are added automatically about 6 months ahead.</Text>
          )}
        </View>
      )}

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
            Updates job name, duration, price, notes and reminders. Dates stay as they are.
          </Text>
        </Card>
      )}

      <ErrorText error={error} />
      <Button
        title={isEdit ? 'Save job' : 'Schedule job'}
        onPress={submit}
        loading={saving}
        disabled={!valid}
      />
    </FormScreen>
  );
}
