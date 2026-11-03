import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { QuoteForm } from '@/components/QuoteForm';
import { Button, EmptyState, FormScreen, Loading } from '@/components/ui';
import { deleteQuote, getQuote, saveQuote } from '@/lib/api';
import { useFocusQuery } from '@/lib/useQuery';

export default function QuoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: quote, error } = useFocusQuery(useCallback(() => getQuote(id), [id]));

  if (error) return <EmptyState text={error} />;
  if (!quote) return <Loading />;

  const confirmDelete = () =>
    Alert.alert('Delete quote?', undefined, [
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
      <Button variant="danger" title="Delete quote" onPress={confirmDelete} />
    </FormScreen>
  );
}
