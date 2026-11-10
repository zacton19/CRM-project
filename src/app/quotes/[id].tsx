import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { InteractionCard } from '@/components/InteractionCard';
import { ScoreBadge } from '@/components/ScoreBadge';
import { QuoteForm } from '@/components/QuoteForm';
import { colors } from '@/components/theme';
import { Button, Card, EmptyState, FormScreen, Loading, Section, styles } from '@/components/ui';
import { deleteQuote, getQuote, listInteractions, saveQuote } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { useFocusQuery } from '@/lib/useQuery';

export default function QuoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useFocusQuery(
    useCallback(async () => {
      const [quote, interactions] = await Promise.all([getQuote(id), listInteractions({ quoteId: id })]);
      return { quote, interactions };
    }, [id]),
  );

  if (error) return <EmptyState text={error} />;
  if (!data) return <Loading />;
  const { quote, interactions } = data;

  const confirmDelete = () =>
    Alert.alert('Delete quote?', 'Its interactions stay on the client.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteQuote(id);
          router.back();
        },
      },
    ]);

  return (
    <FormScreen>
      {!!quote.follow_up_date && (
        <Text style={styles.body}>Follow up: {formatDay(quote.follow_up_date)}</Text>
      )}
      {quote.score != null && (quote.status === 'draft' || quote.status === 'sent') && (
        <Card>
          <View style={styles.row}>
            <Text style={styles.title}>Lead score</Text>
            <ScoreBadge score={quote.score} />
          </View>
          {!!quote.score_rationale && <Text style={styles.body}>{quote.score_rationale}</Text>}
          {!!quote.score_signals?.length && (
            <Text style={styles.muted}>{quote.score_signals.join(' · ')}</Text>
          )}
        </Card>
      )}
      <QuoteForm
        initial={quote}
        onSubmit={async (input) => {
          await saveQuote(input, id);
          router.back();
        }}
      />
      <Button
        variant="secondary"
        title="Schedule job from this quote"
        onPress={() =>
          router.push({
            pathname: '/jobs/new',
            params: { clientId: quote.client_id, title: quote.description, price: String(quote.amount) },
          })
        }
      />

      <Section
        title="Interactions"
        action={
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/interactions/new',
                params: { clientId: quote.client_id, quoteId: id },
              })
            }
            hitSlop={10}
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Log</Text>
          </Pressable>
        }
      >
        {interactions.length === 0 && <Text style={styles.muted}>Nothing logged for this quote yet.</Text>}
        {interactions.map((interaction) => (
          <InteractionCard key={interaction.id} interaction={interaction} />
        ))}
      </Section>

      <Button variant="danger" title="Delete quote" onPress={confirmDelete} />
    </FormScreen>
  );
}
