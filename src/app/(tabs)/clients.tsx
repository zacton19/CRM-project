import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, Text, TextInput, View } from 'react-native';

import { Fab } from '@/components/Fab';
import { colors } from '@/components/theme';
import { Card, EmptyState, ErrorText, styles } from '@/components/ui';
import { listClients } from '@/lib/api';
import { formatAddress } from '@/lib/format';
import { useFocusQuery } from '@/lib/useQuery';

export default function ClientsScreen() {
  const [search, setSearch] = useState('');
  const {
    data: clients = [],
    error,
    loading,
    reload,
  } = useFocusQuery(useCallback(() => listClients(search), [search]));

  return (
    <View style={styles.screen}>
      <FlatList
        data={clients}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading && clients.length > 0} onRefresh={reload} />}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <TextInput
              placeholder="Search name, address, postcode, phone"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              style={styles.input}
              clearButtonMode="while-editing"
            />
            <ErrorText error={error} />
          </View>
        }
        ListEmptyComponent={
          loading ? undefined : (
            <EmptyState text={search ? 'No matching clients.' : 'No clients yet. Tap + to add one.'} />
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push({ pathname: '/clients/[id]', params: { id: item.id } })}>
            <Text style={styles.title}>{item.name}</Text>
            {!!formatAddress(item) && <Text style={styles.muted}>{formatAddress(item)}</Text>}
            {!!item.phone && <Text style={styles.muted}>{item.phone}</Text>}
          </Card>
        )}
      />
      <Fab label="New client" onPress={() => router.push('/clients/new')} />
    </View>
  );
}
