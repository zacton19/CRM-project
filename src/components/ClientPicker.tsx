import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { listClients } from '@/lib/api';
import { formatAddress } from '@/lib/format';
import { Client } from '@/lib/types';

import { colors } from './theme';
import { Button, Field, Label, styles } from './ui';

type Props = {
  value: Pick<Client, 'id' | 'name'> | null;
  onChange: (client: Client | null) => void;
};

/** Inline client search used by the quote and job forms. */
export function ClientPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Client[]>([]);

  useEffect(() => {
    if (value) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      listClients(search)
        .then((clients) => !cancelled && setResults(clients.slice(0, 8)))
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, value]);

  if (value) {
    return (
      <View style={{ gap: 6 }}>
        <Label>Client</Label>
        <View style={styles.row}>
          <Text style={styles.title}>{value.name}</Text>
          <Button variant="secondary" title="Change" onPress={() => onChange(null)} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <Field label="Client" placeholder="Search by name or address" value={search} onChangeText={setSearch} />
      {results.map((client) => (
        <Pressable
          key={client.id}
          onPress={() => onChange(client)}
          style={({ pressed }) => ({
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={styles.body}>{client.name}</Text>
          {!!formatAddress(client) && <Text style={styles.muted}>{formatAddress(client)}</Text>}
        </Pressable>
      ))}
    </View>
  );
}
