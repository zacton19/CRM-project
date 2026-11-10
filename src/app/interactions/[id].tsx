import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { InteractionForm, interactionKindLabel } from '@/components/InteractionForm';
import { Button, EmptyState, FormScreen, Loading } from '@/components/ui';
import { deleteInteraction, getInteraction, listQuotes, saveInteraction } from '@/lib/api';
import { useFocusQuery } from '@/lib/useQuery';

export default function InteractionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useFocusQuery(
    useCallback(async () => {
      const interaction = await getInteraction(id);
      const quotes = await listQuotes({ clientId: interaction.client_id });
      return { interaction, quotes };
    }, [id]),
  );

  if (error) return <EmptyState text={error} />;
  if (!data) return <Loading />;
  const { interaction, quotes } = data;

  const confirmDelete = () =>
    Alert.alert('Delete this entry?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteInteraction(id);
          router.back();
        },
      },
    ]);

  return (
    <FormScreen>
      <Stack.Screen
        options={{ title: `${interactionKindLabel(interaction.kind)} · ${interaction.client?.name ?? ''}` }}
      />
      <InteractionForm
        clientId={interaction.client_id}
        quotes={quotes}
        initial={interaction}
        onSubmit={async (input) => {
          await saveInteraction(input, id);
          router.back();
        }}
      />
      <Button variant="danger" title="Delete" onPress={confirmDelete} />
    </FormScreen>
  );
}
