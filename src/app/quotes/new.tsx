import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { QuoteForm } from '@/components/QuoteForm';
import { EmptyState, FormScreen, Loading } from '@/components/ui';
import { getClient, saveQuote } from '@/lib/api';
import { useFocusQuery } from '@/lib/useQuery';

export default function NewQuote() {
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  const {
    data: client,
    error,
    loading,
  } = useFocusQuery(useCallback(async () => (clientId ? getClient(clientId) : null), [clientId]));

  if (error) return <EmptyState text={error} />;
  if (loading && client === undefined) return <Loading />;

  return (
    <FormScreen>
      <QuoteForm
        initialClient={client}
        onSubmit={async (input) => {
          await saveQuote(input);
          router.back();
        }}
      />
    </FormScreen>
  );
}
