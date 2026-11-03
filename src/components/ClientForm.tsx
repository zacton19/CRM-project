import { useState } from 'react';

import { Client, ClientInput } from '@/lib/types';

import { Button, ErrorText, Field, FormScreen } from './ui';

const EMPTY: ClientInput = {
  name: '',
  phone: null,
  email: null,
  address_line1: null,
  address_line2: null,
  city: null,
  postcode: null,
  notes: null,
};

type Props = {
  initial?: Client;
  onSubmit: (input: ClientInput) => Promise<void>;
};

export function ClientForm({ initial, onSubmit }: Props) {
  const [form, setForm] = useState<ClientInput>(() => ({ ...EMPTY, ...initial }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bind = (key: keyof ClientInput) => ({
    value: form[key] ?? '',
    onChangeText: (text: string) => setForm((f) => ({ ...f, [key]: text || null })),
  });

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const { name, phone, email, address_line1, address_line2, city, postcode, notes } = form;
      await onSubmit({
        name: name.trim(),
        phone,
        email,
        address_line1,
        address_line2,
        city,
        postcode,
        notes,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <FormScreen>
      <Field label="Name *" {...bind('name')} value={form.name} autoCapitalize="words" />
      <Field label="Phone" {...bind('phone')} keyboardType="phone-pad" autoComplete="tel" />
      <Field label="Email" {...bind('email')} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Address line 1" {...bind('address_line1')} autoComplete="street-address" />
      <Field label="Address line 2" {...bind('address_line2')} />
      <Field label="Town / city" {...bind('city')} />
      <Field label="Postcode / ZIP" {...bind('postcode')} autoCapitalize="characters" />
      <Field
        label="Notes"
        {...bind('notes')}
        multiline
        placeholder="Gate code, dog, side access, preferred days…"
      />
      <ErrorText error={error} />
      <Button title="Save client" onPress={submit} loading={saving} disabled={!form.name.trim()} />
    </FormScreen>
  );
}
