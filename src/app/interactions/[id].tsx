import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { AnalysisPanel } from '@/components/AnalysisPanel';
import { InteractionForm, interactionKindLabel } from '@/components/InteractionForm';
import { Button, EmptyState, FormScreen, Loading, Section } from '@/components/ui';
import { deleteInteraction, getInteraction, listActionItems, listQuotes, saveInteraction } from '@/lib/api';
import { useFocusQuery } from '@/lib/useQuery';

export default function InteractionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useFocusQuery(
    useCallback(async () => {
      const [interaction, actionItems] = await Promise.all([
        getInteraction(id),
        listActionItems({ interactionId: id }),
      ]);
      const quotes = await listQuotes({ clientId: interaction.client_id });
      return { interaction, quotes, actionItems };
    }, [id]),
  );

  if (error) return <EmptyState text={error} />;
  if (!data) return <Loading />;
  const { interaction, quotes, actionItems } = data;

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
      <AnalysisPanel interaction={interaction} actionItems={actionItems} onAnalyzed={reload} />

      <Section title="Details">
        <InteractionForm
          clientId={interaction.client_id}
          quotes={quotes}
          initial={interaction}
          onSubmit={async (input) => {
            await saveInteraction(input, id);
            router.back();
          }}
        />
      </Section>
      <Button variant="danger" title="Delete" onPress={confirmDelete} />
    </FormScreen>
  );
}
