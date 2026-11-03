import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { colors } from '@/components/theme';
import { Button, Card, EmptyState, FormScreen, Loading, Section, StatusPill, styles } from '@/components/ui';
import { deleteJob, getJob, setJobStatus, stopSeries } from '@/lib/api';
import { formatAddress, formatDateTime, formatDuration, formatLeadTime, formatMoney } from '@/lib/format';
import { openDirections } from '@/lib/maps';
import { syncReminders } from '@/lib/reminders';
import { JobStatus } from '@/lib/types';
import { useFocusQuery } from '@/lib/useQuery';

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, error, reload } = useFocusQuery(useCallback(() => getJob(id), [id]));

  if (error) return <EmptyState text={error} />;
  if (!job) return <Loading />;

  const address = formatAddress(job.client);

  const afterChange = async () => {
    syncReminders().catch(() => {});
    await reload();
  };

  const changeStatus = async (status: JobStatus) => {
    await setJobStatus(id, status);
    await afterChange();
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete this job?',
      job.series_id ? 'Only this visit is deleted; the series keeps repeating.' : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteJob(id);
            syncReminders().catch(() => {});
            router.back();
          },
        },
      ],
    );

  const confirmStopSeries = () =>
    Alert.alert('Stop repeating?', 'All scheduled visits after this one will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop repeating',
        style: 'destructive',
        onPress: async () => {
          await stopSeries(job.series_id!, job.starts_at);
          await afterChange();
        },
      },
    ]);

  const reminders = job.reminders;

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: job.title,
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/jobs/[id]/edit', params: { id } })}
              hitSlop={10}
            >
              <Text style={{ color: colors.primary, fontSize: 17 }}>Edit</Text>
            </Pressable>
          ),
        }}
      />

      <Card>
        <View style={styles.row}>
          <Text style={styles.title}>{formatDateTime(job.starts_at)}</Text>
          <StatusPill status={job.status} />
        </View>
        <Text style={styles.body}>
          {formatDuration(job.duration_minutes)} · {formatMoney(job.price)}
        </Text>
        {job.series_id && (
          <View style={[styles.row, { justifyContent: 'flex-start' }]}>
            <Ionicons name="repeat" size={16} color={colors.muted} />
            <Text style={styles.muted}>Part of a repeating series</Text>
          </View>
        )}
      </Card>

      <Card onPress={() => router.push({ pathname: '/clients/[id]', params: { id: job.client_id } })}>
        <Text style={styles.title}>{job.client?.name}</Text>
        {!!address && <Text style={styles.muted}>{address}</Text>}
      </Card>

      <Button title="Directions" variant="secondary" onPress={() => openDirections(address)} />

      {!!job.notes && (
        <Section title="Notes">
          <Card>
            <Text style={styles.body}>{job.notes}</Text>
          </Card>
        </Section>
      )}

      <Section title="Reminders">
        <Text style={styles.muted}>
          {reminders
            ? [
                ...reminders.minutesBefore.map((m) => `${formatLeadTime(m)} before`),
                ...(reminders.dayBeforeTime ? [`day before at ${reminders.dayBeforeTime}`] : []),
              ].join(', ') || 'None for this job'
            : 'Using your default reminder settings'}
        </Text>
      </Section>

      {job.status === 'scheduled' ? (
        <View style={{ gap: 10 }}>
          <Button title="Mark completed" onPress={() => changeStatus('completed')} />
          <Button variant="secondary" title="Cancel this visit" onPress={() => changeStatus('cancelled')} />
        </View>
      ) : (
        <Button
          variant="secondary"
          title="Move back to scheduled"
          onPress={() => changeStatus('scheduled')}
        />
      )}

      {job.series_id && (
        <Button variant="danger" title="Stop repeating after this visit" onPress={confirmStopSeries} />
      )}
      <Button variant="danger" title="Delete job" onPress={confirmDelete} />
    </FormScreen>
  );
}
