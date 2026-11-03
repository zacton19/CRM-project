import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@/components/theme';
import { Button, ErrorText, Field, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    const credentials = { email: email.trim(), password };
    const { data, error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
    setBusy(false);
    if (error) setError(error.message);
    else if (mode === 'sign-up' && !data.session)
      setInfo('Check your email to confirm your account, then sign in.');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}
      >
        <View style={{ gap: 4, marginBottom: 12 }}>
          <Text style={{ fontSize: 30, fontWeight: '800', color: colors.primary }}>Window CRM</Text>
          <Text style={styles.muted}>Clients, quotes and your cleaning round in one place.</Text>
        </View>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
        />
        <ErrorText error={error} />
        {info && <Text style={{ color: colors.success }}>{info}</Text>}
        <Button
          title={mode === 'sign-in' ? 'Sign in' : 'Create account'}
          onPress={submit}
          loading={busy}
          disabled={!email || password.length < 6}
        />
        <Button
          variant="secondary"
          title={mode === 'sign-in' ? 'First time? Create an account' : 'Have an account? Sign in'}
          onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
