import { format } from 'date-fns';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { ScoreBadge } from '@/components/ScoreBadge';
import { colors } from '@/components/theme';
import { Button, Card, Chip, ErrorText, Field, StatusPill, styles } from '@/components/ui';
import { SearchResponse, searchQuotes } from '@/lib/api';
import { formatMoney } from '@/lib/format';

const EXAMPLES = [
  'Open quotes over $500 created this month',
  'Quotes to follow up this week',
  'Best leads first',
  'Declined quotes last month',
];

/**
 * Ask in plain English. The AI only fills in a fixed set of filters; the server validates
 * them, and the screen shows exactly which filters were applied.
 */
export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (text: string) => {
    if (!text.trim()) return;
    setQuery(text);
    setSearching(true);
    setError(null);
    setResponse(null);
    try {
      setResponse(await searchQuotes(text.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      data={response?.results ?? []}
      keyExtractor={(q) => q.id}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 4 }}>
          <Field
            label="Ask about your quotes"
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. sent quotes over $500 this month"
            returnKeyType="search"
            onSubmitEditing={() => run(query)}
          />
          <Button title="Search" onPress={() => run(query)} loading={searching} disabled={!query.trim()} />
          {!response && !searching && (
            <View style={styles.wrap}>
              {EXAMPLES.map((example) => (
                <Chip key={example} label={example} selected={false} onPress={() => run(example)} />
              ))}
            </View>
          )}
          <ErrorText error={error} />
          {response?.clarification && (
            <Card>
              <Text style={styles.body}>{response.clarification}</Text>
            </Card>
          )}
          {response?.description && (
            <Text style={[styles.body, { color: colors.primary, fontWeight: '600' }]}>
              {response.description} · {response.results.length} found
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Card onPress={() => router.push({ pathname: '/quotes/[id]', params: { id: item.id } })}>
          <View style={styles.row}>
            <Text style={[styles.title, { flex: 1 }]}>{item.client_name}</Text>
            <Text style={styles.title}>{formatMoney(item.amount)}</Text>
          </View>
          <Text style={styles.body} numberOfLines={1}>
            {item.description}
          </Text>
          <View style={styles.row}>
            <Text style={styles.muted}>Created {format(new Date(item.created_at), 'd MMM yyyy')}</Text>
            <StatusPill status={item.status} />
            <ScoreBadge score={item.score} />
          </View>
        </Card>
      )}
    />
  );
}
