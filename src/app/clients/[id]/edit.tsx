import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { ClientForm } from '@/components/ClientForm';
import { EmptyState, Loading } from '@/components/ui';
import { getClient, saveClient } from '@/lib/api';
import { useFocusQuery } from '@/lib/useQuery';

export default function EditClient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: client, error } = useFocusQuery(useCallback(() => getClient(id), [id]));

  if (error) return <EmptyState text={error} />;
  if (!client) return <Loading />;

  return (
    <ClientForm
      initial={client}
      onSubmit={async (input) => {
        await saveClient(input, id);
        router.back();
      }}
    />
  );
}
