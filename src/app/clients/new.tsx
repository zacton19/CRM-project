import { router } from 'expo-router';

import { ClientForm } from '@/components/ClientForm';
import { saveClient } from '@/lib/api';

export default function NewClient() {
  return (
    <ClientForm
      onSubmit={async (input) => {
        const client = await saveClient(input);
        router.replace({ pathname: '/clients/[id]', params: { id: client.id } });
      }}
    />
  );
}
