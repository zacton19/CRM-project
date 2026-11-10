import { format } from 'date-fns';
import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Interaction } from '@/lib/types';

import { interactionKindLabel } from './InteractionForm';
import { Card, styles } from './ui';

/** One row of interaction history: type, date and the first couple of lines of text. */
export function InteractionCard({ interaction }: { interaction: Interaction }) {
  return (
    <Card onPress={() => router.push({ pathname: '/interactions/[id]', params: { id: interaction.id } })}>
      <View style={styles.row}>
        <Text style={styles.title}>
          {interactionKindLabel(interaction.kind)}
          {interaction.summary ? '  ✦ summarised' : ''}
        </Text>
        <Text style={styles.muted}>{format(new Date(interaction.occurred_at), 'd MMM yyyy')}</Text>
      </View>
      {/* The AI summary once analysed, otherwise the start of the raw text. */}
      <Text style={styles.muted} numberOfLines={2}>
        {interaction.summary ?? interaction.body}
      </Text>
    </Card>
  );
}
