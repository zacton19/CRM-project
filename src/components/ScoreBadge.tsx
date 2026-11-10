import { Text, View } from 'react-native';

import { colors } from './theme';

/** The AI lead score as a small coloured circle: green 70+, amber 40-69, grey below 40. */
export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color = score >= 70 ? colors.success : score >= 40 ? colors.warning : colors.muted;
  return (
    <View
      style={{
        borderWidth: 2,
        borderColor: color,
        borderRadius: 999,
        minWidth: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityLabel={`Lead score ${score} out of 100`}
    >
      <Text style={{ color, fontWeight: '700', fontSize: 14 }}>{score}</Text>
    </View>
  );
}
