import { useCallback } from 'react';
import { Text, View } from 'react-native';

import { getAiUsage } from '@/lib/api';
import { AiFeature } from '@/lib/types';
import { useFocusQuery } from '@/lib/useQuery';

import { colors } from './theme';
import { Card, ErrorText, styles } from './ui';

const FEATURE_LABELS: Record<AiFeature, string> = {
  analyze: 'Summaries',
  score: 'Lead scoring',
  search: 'Search',
};

/** Totals from llm_call_log, so you can see what the AI features cost and how fast they are. */
export function AiUsageCard() {
  const { data: rows, error } = useFocusQuery(useCallback(() => getAiUsage(), []));

  if (error) return <ErrorText error={error} />;
  if (!rows) return null;
  if (rows.length === 0) {
    return <Text style={styles.muted}>No AI requests yet.</Text>;
  }

  const totalCost = rows.reduce((sum, r) => sum + Number(r.cost_usd), 0);

  return (
    <Card>
      {rows.map((r) => (
        <View key={r.feature} style={{ gap: 2, paddingVertical: 4 }}>
          <View style={styles.row}>
            <Text style={styles.title}>{FEATURE_LABELS[r.feature] ?? r.feature}</Text>
            <Text style={styles.body}>${Number(r.cost_usd).toFixed(4)}</Text>
          </View>
          <Text style={styles.muted}>
            {r.calls} requests · {r.cache_hits} from cache · {r.failures} failed
          </Text>
          <Text style={styles.muted}>
            {formatTokens(Number(r.input_tokens))} in / {formatTokens(Number(r.output_tokens))} out
            {r.avg_latency_ms != null ? ` · avg ${(Number(r.avg_latency_ms) / 1000).toFixed(1)}s` : ''}
          </Text>
        </View>
      ))}
      <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }]}>
        <Text style={styles.title}>Total</Text>
        <Text style={styles.title}>${totalCost.toFixed(4)}</Text>
      </View>
    </Card>
  );
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
