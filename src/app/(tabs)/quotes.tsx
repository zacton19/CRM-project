import { format } from 'date-fns';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { Fab } from '@/components/Fab';
import { Card, Chip, EmptyState, ErrorText, StatusPill, styles } from '@/components/ui';
import { listQuotes } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { QUOTE_STATUSES, QuoteStatus } from '@/lib/types';
import { useFocusQuery } from '@/lib/useQuery';

export default function QuotesScreen() {
  const [status, setStatus] = useState<QuoteStatus | undefined>();
  const {
    data: quotes = [],
    error,
    loading,
    reload,
  } = useFocusQuery(useCallback(() => listQuotes({ status }), [status]));

  return (
    <View style={styles.screen}>
      <FlatList
        data={quotes}
        keyExtractor={(q) => q.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading && quotes.length > 0} onRefresh={reload} />}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <View style={styles.wrap}>
              <Chip label="All" selected={!status} onPress={() => setStatus(undefined)} />
              {QUOTE_STATUSES.map((s) => (
                <Chip
                  key={s}
                  label={s[0].toUpperCase() + s.slice(1)}
                  selected={status === s}
                  onPress={() => setStatus(s)}
                />
              ))}
            </View>
            <ErrorText error={error} />
          </View>
        }
        ListEmptyComponent={loading ? undefined : <EmptyState text="No quotes. Tap + to add one." />}
        renderItem={({ item }) => (
          <Card onPress={() => router.push({ pathname: '/quotes/[id]', params: { id: item.id } })}>
            <View style={styles.row}>
              <Text style={styles.title}>{item.client?.name}</Text>
              <Text style={styles.title}>{formatMoney(item.amount)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
                {item.description}
              </Text>
              <StatusPill status={item.status} />
            </View>
            <Text style={styles.muted}>{format(new Date(item.created_at), 'd MMM yyyy')}</Text>
          </Card>
        )}
      />
      <Fab label="New quote" onPress={() => router.push('/quotes/new')} />
    </View>
  );
}
