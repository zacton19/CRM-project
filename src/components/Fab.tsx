import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

import { colors } from './theme';
import { styles } from './ui';

export function Fab({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name="add" size={30} color={colors.primaryText} />
    </Pressable>
  );
}
