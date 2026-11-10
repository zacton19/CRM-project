import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { setActionItemDone } from '@/lib/api';
import { formatDay, isOverdue } from '@/lib/format';
import { ActionItem } from '@/lib/types';

import { colors } from './theme';
import { styles } from './ui';

type Props = { item: Pick<ActionItem, 'id' | 'description' | 'due_date' | 'done'> };

/** A to-do with a checkbox. Ticking it saves straight away; on failure the tick is undone. */
export function ActionItemRow({ item }: Props) {
  const [done, setDone] = useState(item.done);
  const overdue = !done && !!item.due_date && isOverdue(item.due_date);

  const toggle = async () => {
    const next = !done;
    setDone(next);
    try {
      await setActionItemDone(item.id, next);
    } catch {
      setDone(!next);
    }
  };

  return (
    <Pressable onPress={toggle} style={[styles.row, { justifyContent: 'flex-start', paddingVertical: 4 }]}>
      <Ionicons
        name={done ? 'checkbox' : 'square-outline'}
        size={22}
        color={done ? colors.success : colors.muted}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.body, done && { textDecorationLine: 'line-through', color: colors.muted }]}>
          {item.description}
        </Text>
        {!!item.due_date && (
          <Text style={[styles.muted, overdue && { color: colors.danger, fontWeight: '600' }]}>
            {overdue ? 'Overdue · ' : 'Due '}
            {formatDay(item.due_date)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
