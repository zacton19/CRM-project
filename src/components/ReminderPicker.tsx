import { Switch, Text, View } from 'react-native';

import { formatLeadTime } from '@/lib/format';
import { ReminderSettings } from '@/lib/types';

import { DateTimeField } from './DateTimeField';
import { colors } from './theme';
import { Chip, Label, styles } from './ui';

const LEAD_OPTIONS = [15, 30, 60, 120, 1440];

function timeToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ReminderPicker({
  value,
  onChange,
}: {
  value: ReminderSettings;
  onChange: (value: ReminderSettings) => void;
}) {
  const toggleLead = (minutes: number) => {
    const set = new Set(value.minutesBefore);
    if (set.has(minutes)) set.delete(minutes);
    else set.add(minutes);
    onChange({ ...value, minutesBefore: [...set].sort((a, b) => a - b) });
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Label>Remind me before the job</Label>
        <View style={styles.wrap}>
          {LEAD_OPTIONS.map((minutes) => (
            <Chip
              key={minutes}
              label={formatLeadTime(minutes)}
              selected={value.minutesBefore.includes(minutes)}
              onPress={() => toggleLead(minutes)}
            />
          ))}
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.body}>Reminder the evening before</Text>
        <Switch
          value={value.dayBeforeTime != null}
          trackColor={{ true: colors.primary }}
          onValueChange={(on) => onChange({ ...value, dayBeforeTime: on ? '18:00' : null })}
        />
      </View>

      {value.dayBeforeTime != null && (
        <DateTimeField
          label="Day-before reminder time"
          mode="time"
          value={timeToDate(value.dayBeforeTime)}
          onChange={(d) => onChange({ ...value, dayBeforeTime: dateToTime(d) })}
        />
      )}
    </View>
  );
}
