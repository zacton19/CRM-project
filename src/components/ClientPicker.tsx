import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { listClients, saveClient } from '@/lib/api';
import { formatAddress } from '@/lib/format';
import { Client } from '@/lib/types';

import { colors } from './theme';
import { Button, ErrorText, Field, Label, styles } from './ui';

type Props = {
  value: Pick<Client, 'id' | 'name'> | null;
  onChange: (client: Client | null) => void;
};

/**
 * Inline client search used by the quote and job forms.
 * If the typed name isn't an existing client, it offers to add it, which saves
 * a new client (name only; the rest can be filled in later from the Clients tab).
 */
export function ClientPicker({ value, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (value) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      listClients(search)
        .then((clients) => {
          if (cancelled) return;
          setResults(clients.slice(0, 8));
          setError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setResults([]);
          setError(e instanceof Error ? e.message : String(e));
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, value]);

  const name = search.trim();
  const exactMatch = results?.some((c) => c.name.trim().toLowerCase() === name.toLowerCase());
  const canCreate = !!name && results !== null && !exactMatch;

  const createClient = async () => {
    setCreating(true);
    setError(null);
    try {
      const client = await saveClient({
        name,
        phone: null,
        email: null,
        address: null,
        notes: null,
      });
      setSearch('');
      onChange(client);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

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
      <Field
        label="Client"
        placeholder="Search, or type a new client's name"
        value={search}
        onChangeText={setSearch}
      />
      <ErrorText error={error} />
      {!error && results?.length === 0 && !name && (
        <Text style={styles.muted}>No clients yet. Type a name to add your first one.</Text>
      )}
      {!!results?.length && <Text style={styles.muted}>Tap a client to select them:</Text>}
      {results?.map((client) => (
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
      {canCreate && (
        <Pressable
          onPress={createClient}
          disabled={creating}
          style={({ pressed }) => [
            styles.row,
            { paddingVertical: 10, opacity: pressed || creating ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.body, { color: colors.primary, fontWeight: '600', flex: 1 }]}>
            + Add “{name}” as a new client
          </Text>
          {creating && <ActivityIndicator color={colors.primary} />}
        </Pressable>
      )}
    </View>
  );
}
