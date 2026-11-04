import { parseISO } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { JobForm } from '@/components/JobForm';
import { EmptyState, Loading } from '@/components/ui';
import { createJob, getClient } from '@/lib/api';
import { syncReminders } from '@/lib/reminders';
import { useFocusQuery } from '@/lib/useQuery';

/** Params: clientId, date (yyyy-MM-dd), title, price — all optional prefills. */
export default function NewJob() {
  const { clientId, date, title, price } = useLocalSearchParams<{
    clientId?: string;
    date?: string;
    title?: string;
    price?: string;
  }>();
  const {
    data: client,
    error,
    loading,
  } = useFocusQuery(useCallback(async () => (clientId ? getClient(clientId) : null), [clientId]));

  if (error) return <EmptyState text={error} />;
  if (loading && client === undefined) return <Loading />;

  const startsAt = date ? parseISO(date) : new Date();
  startsAt.setHours(9, 0, 0, 0);

  return (
    <JobForm
      defaults={{ client, startsAt, title, price }}
      onSubmit={async ({ input, intervalMonths }) => {
        await createJob(input, intervalMonths);
        syncReminders().catch(() => {});
        router.back();
      }}
    />
  );
}
