import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { Platform, View } from 'react-native';

import { Button, Label, styles } from './ui';

type Props = {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  mode?: 'datetime' | 'time';
};

/** iOS shows the native compact picker; Android opens separate date and time dialogs. */
export function DateTimeField({ label, value, onChange, mode = 'datetime' }: Props) {
  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.row, { paddingVertical: 4 }]}>
        <Label>{label}</Label>
        <DateTimePicker
          value={value}
          mode={mode}
          display="compact"
          minuteInterval={5}
          onChange={(_event, date) => date && onChange(date)}
        />
      </View>
    );
  }

  const open = (pickerMode: 'date' | 'time') =>
    DateTimePickerAndroid.open({
      value,
      mode: pickerMode,
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(date);
      },
    });

  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <View style={[styles.row, { justifyContent: 'flex-start' }]}>
        {mode === 'datetime' && (
          <Button variant="secondary" title={format(value, 'EEE d MMM yyyy')} onPress={() => open('date')} />
        )}
        <Button variant="secondary" title={format(value, 'h:mm a')} onPress={() => open('time')} />
      </View>
    </View>
  );
}
