import { format } from 'date-fns';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { ActionItemRow } from '@/components/ActionItemRow';
import { ScoreBadge } from '@/components/ScoreBadge';
import { colors } from '@/components/theme';
import { Button, Card, EmptyState, ErrorText, StatusPill, styles } from '@/components/ui';
import { getFollowUpQueueData, rescoreQuotes } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { buildFollowUpQueue, QueueEntry } from '@/lib/queue';
import { useFocusQuery } from '@/lib/useQuery';

/**
 * Today's follow-ups: overdue and due-today items first, then open quotes by AI lead score.
 * The ordering rules live in src/lib/queue.ts.
 */
export default function FollowUpsScreen() {
  const { data, error, loading, reload } = useFocusQuery(useCallback(() => getFollowUpQueueData(), []));
  const [rescoring, setRescoring] = useState(false);
  const [rescoreMessage, setRescoreMessage] = useState<string | null>(null);
  const [rescoreError, setRescoreError] = useState<string | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');
  const queue = useMemo(() => (data ? buildFollowUpQueue({ ...data, today }) : []), [data, today]);

  const rescore = async () => {
    setRescoring(true);
    setRescoreMessage(null);
    setRescoreError(null);
    try {
      const result = await rescoreQuotes();
      setRescoreMessage(
        `Scored ${result.scored} (${result.fromCache} from cache), ${result.skipped} unchanged` +
          (result.remaining ? `, ${result.remaining} left for next time` : ''),
      );
      setRescoreError(result.error);
      await reload();
    } catch (e) {
      setRescoreError(e instanceof Error ? e.message : String(e));
    } finally {
      setRescoring(false);
    }
  };

  return (
    <FlatList
      style={styles.screen}
      data={queue}
      keyExtractor={(entry) => entry.key}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} />}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 4 }}>
          <View style={styles.row}>
            <Text style={styles.muted}>{format(new Date(), 'EEEE d MMMM')}</Text>
            <Button
              variant="secondary"
              title="Rescore"
              onPress={rescore}
              loading={rescoring}
              style={{ paddingHorizontal: 16, paddingVertical: 8 }}
            />
          </View>
          {!!rescoreMessage && <Text style={styles.muted}>{rescoreMessage}</Text>}
          <ErrorText error={rescoreError} />
          <ErrorText error={error} />
        </View>
      }
      ListEmptyComponent={
        loading ? undefined : <EmptyState text="Nothing to follow up. Open quotes will appear here." />
      }
      renderItem={({ item }) => <QueueCard entry={item} />}
    />
  );
}

function QueueCard({ entry }: { entry: QueueEntry }) {
  const { quote } = entry;
  const open = () =>
    quote
      ? router.push({ pathname: '/quotes/[id]', params: { id: quote.id } })
      : router.push({ pathname: '/clients/[id]', params: { id: entry.clientId } });

  return (
    <Card onPress={open}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>{entry.title}</Text>
          {quote && (
            <Text style={styles.muted} numberOfLines={1}>
              {quote.description} · {formatMoney(quote.amount)}
            </Text>
          )}
        </View>
        {quote && <ScoreBadge score={quote.score} />}
      </View>

      {entry.reasons.length > 0 && (
        <Text
          style={{
            color: entry.urgency === 'overdue' ? colors.danger : colors.warning,
            fontWeight: '600',
            fontSize: 14,
          }}
        >
          {entry.reasons.join(' · ')}
        </Text>
      )}
      {quote?.score_rationale && (
        <Text style={styles.muted} numberOfLines={2}>
          {quote.score_rationale}
        </Text>
      )}
      {quote && !quote.score_rationale && <Text style={styles.muted}>Not scored yet. Tap Rescore.</Text>}
      {quote && <StatusPill status={quote.status} />}

      {entry.actionItems.map((item) => (
        <ActionItemRow key={item.id} item={item} />
      ))}
    </Card>
  );
}
