import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';

import { InteractionCard } from '@/components/InteractionCard';
import { colors } from '@/components/theme';
import { Button, Card, EmptyState, FormScreen, Loading, Section, StatusPill, styles } from '@/components/ui';
import { deleteClient, getClient, listInteractions, listJobsForClient, listQuotes } from '@/lib/api';
import { formatAddress, formatDateTime, formatMoney } from '@/lib/format';
import { openDirections } from '@/lib/maps';
import { syncReminders } from '@/lib/reminders';
import { useFocusQuery } from '@/lib/useQuery';

export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useFocusQuery(
    useCallback(async () => {
      const [client, quotes, jobs, interactions] = await Promise.all([
        getClient(id),
        listQuotes({ clientId: id }),
        listJobsForClient(id),
        listInteractions({ clientId: id }),
      ]);
      // Jobs arrive newest first; upcoming should read soonest first.
      const now = Date.now();
      const upcoming = jobs
        .filter((j) => j.status === 'scheduled' && new Date(j.starts_at).getTime() >= now)
        .reverse();
      const history = jobs.filter((j) => !upcoming.includes(j)).slice(0, 10);
      return { client, quotes, upcoming, history, interactions };
    }, [id]),
  );

  if (error) return <EmptyState text={error} />;
  if (!data) return <Loading />;
  const { client, quotes, upcoming, history, interactions } = data;

  const address = formatAddress(client);

  const confirmDelete = () =>
    Alert.alert('Delete client?', `This also deletes all quotes, jobs and interactions for ${client.name}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteClient(id);
          syncReminders().catch(() => {});
          router.back();
        },
      },
    ]);

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: client.name,
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/clients/[id]/edit', params: { id } })}
              hitSlop={10}
            >
              <Text style={{ color: colors.primary, fontSize: 17 }}>Edit</Text>
            </Pressable>
          ),
        }}
      />

      <Card>
        {address ? (
          <Text style={styles.body}>{address}</Text>
        ) : (
          <Text
            style={[styles.body, { color: colors.primary }]}
            onPress={() => router.push({ pathname: '/clients/[id]/edit', params: { id } })}
          >
            + Add address
          </Text>
        )}
        {!!client.phone && (
          <Text
            style={[styles.body, { color: colors.primary }]}
            onPress={() => Linking.openURL(`tel:${client.phone}`)}
          >
            {client.phone}
          </Text>
        )}
        {!!client.email && (
          <Text
            style={[styles.body, { color: colors.primary }]}
            onPress={() => Linking.openURL(`mailto:${client.email}`)}
          >
            {client.email}
          </Text>
        )}
      </Card>

      <View style={styles.row}>
        <Button
          title="Directions"
          variant="secondary"
          onPress={() => openDirections(address)}
          style={{ flex: 1 }}
        />
        <Button
          title="Schedule job"
          onPress={() => router.push({ pathname: '/jobs/new', params: { clientId: id } })}
          style={{ flex: 1 }}
        />
      </View>

      {!!client.notes && (
        <Section title="Notes">
          <Card>
            <Text style={styles.body}>{client.notes}</Text>
          </Card>
        </Section>
      )}

      <Section
        title="Upcoming jobs"
        action={upcoming.length > 0 && <Text style={styles.muted}>{upcoming.length}</Text>}
      >
        {upcoming.length === 0 && <Text style={styles.muted}>Nothing scheduled.</Text>}
        {upcoming.slice(0, 5).map((job) => (
          <Card key={job.id} onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}>
            <View style={styles.row}>
              <Text style={styles.title}>{formatDateTime(job.starts_at)}</Text>
              {job.series_id && <Ionicons name="repeat" size={16} color={colors.muted} />}
            </View>
            <Text style={styles.muted}>
              {job.title} · {formatMoney(job.price)}
            </Text>
          </Card>
        ))}
      </Section>

      <Section
        title="Quotes"
        action={
          <Pressable
            onPress={() => router.push({ pathname: '/quotes/new', params: { clientId: id } })}
            hitSlop={10}
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add</Text>
          </Pressable>
        }
      >
        {quotes.length === 0 && <Text style={styles.muted}>No quotes yet.</Text>}
        {quotes.map((quote) => (
          <Card
            key={quote.id}
            onPress={() => router.push({ pathname: '/quotes/[id]', params: { id: quote.id } })}
          >
            <View style={styles.row}>
              <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
                {quote.description}
              </Text>
              <Text style={styles.title}>{formatMoney(quote.amount)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.muted}>{format(new Date(quote.created_at), 'd MMM yyyy')}</Text>
              <StatusPill status={quote.status} />
            </View>
          </Card>
        ))}
      </Section>

      <Section
        title="Interactions"
        action={
          <Pressable
            onPress={() => router.push({ pathname: '/interactions/new', params: { clientId: id } })}
            hitSlop={10}
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Log</Text>
          </Pressable>
        }
      >
        {interactions.length === 0 && <Text style={styles.muted}>No emails, calls or notes yet.</Text>}
        {interactions.map((interaction) => (
          <InteractionCard key={interaction.id} interaction={interaction} />
        ))}
      </Section>

      {history.length > 0 && (
        <Section title="Recent history">
          {history.map((job) => (
            <Card
              key={job.id}
              onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}
            >
              <View style={styles.row}>
                <Text style={styles.body}>{formatDateTime(job.starts_at)}</Text>
                <StatusPill status={job.status} />
              </View>
            </Card>
          ))}
        </Section>
      )}

      <Button variant="danger" title="Delete client" onPress={confirmDelete} />
    </FormScreen>
  );
}
