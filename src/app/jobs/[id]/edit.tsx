import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { JobForm } from '@/components/JobForm';
import { EmptyState, Loading } from '@/components/ui';
import { getJob, updateJob } from '@/lib/api';
import { syncReminders } from '@/lib/reminders';
import { useFocusQuery } from '@/lib/useQuery';

export default function EditJob() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, error } = useFocusQuery(useCallback(() => getJob(id), [id]));

  if (error) return <EmptyState text={error} />;
  if (!job) return <Loading />;

  return (
    <JobForm
      initial={job}
      onSubmit={async ({ input, applyToFuture }) => {
        await updateJob(job, input, applyToFuture);
        syncReminders().catch(() => {});
        router.back();
      }}
    />
  );
}
