import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { InteractionForm } from '@/components/InteractionForm';
import { EmptyState, FormScreen, Loading } from '@/components/ui';
import { listQuotes, saveInteraction } from '@/lib/api';
import { useFocusQuery } from '@/lib/useQuery';

/** Opened from a client (clientId) or a quote (clientId + quoteId). */
export default function NewInteraction() {
  const { clientId, quoteId } = useLocalSearchParams<{ clientId: string; quoteId?: string }>();
  const { data: quotes, error } = useFocusQuery(
    useCallback(() => listQuotes({ clientId }), [clientId]),
  );

  if (error) return <EmptyState text={error} />;
  if (!quotes) return <Loading />;

  return (
    <FormScreen>
      <InteractionForm
        clientId={clientId}
        quotes={quotes}
        initialQuoteId={quoteId ?? null}
        onSubmit={async (input) => {
          await saveInteraction(input);
          router.back();
        }}
      />
    </FormScreen>
  );
}
