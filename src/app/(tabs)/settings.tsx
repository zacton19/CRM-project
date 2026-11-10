import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Alert, Linking, Text } from 'react-native';

import { ReminderPicker } from '@/components/ReminderPicker';
import { Button, Card, ErrorText, FormScreen, Section, styles } from '@/components/ui';
import { deleteOwnAccount, getReminderSettings, saveReminderSettings, seedDemoData } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { clearReminders, ensureNotificationPermission, syncReminders } from '@/lib/reminders';
import { supabase } from '@/lib/supabase';
import { DEFAULT_REMINDERS, ReminderSettings } from '@/lib/types';

type NotificationStatus = { granted: boolean; scheduled: number };

async function loadNotificationStatus(): Promise<NotificationStatus> {
  const [permission, scheduled] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Notifications.getAllScheduledNotificationsAsync(),
  ]);
  return { granted: permission.granted, scheduled: scheduled.length };
}

export default function SettingsScreen() {
  const { session } = useAuth();
  const [reminders, setReminders] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyStatus = (status: NotificationStatus) => {
    setPermission(status.granted);
    setScheduledCount(status.scheduled);
  };
  const refreshStatus = () => loadNotificationStatus().then(applyStatus);

  useEffect(() => {
    getReminderSettings()
      .then(setReminders)
      .catch((e) => setError(e.message));
    loadNotificationStatus().then(applyStatus);
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveReminderSettings(reminders);
      await syncReminders();
      await refreshStatus();
      Alert.alert('Saved', 'Reminders have been rescheduled.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const enableNotifications = async () => {
    if (!(await ensureNotificationPermission())) {
      Linking.openSettings();
      return;
    }
    await syncReminders();
    await refreshStatus();
  };

  const loadDemoData = async () => {
    setSeeding(true);
    setError(null);
    try {
      await seedDemoData();
      await syncReminders();
      Alert.alert('Demo data loaded', 'Look for the sample clients in the Clients tab.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  };

  const signOut = async () => {
    await clearReminders();
    await supabase.auth.signOut();
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteOwnAccount();
      await clearReminders();
      // The user no longer exists server-side, so only clear the local session.
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all of your clients, quotes and jobs. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: deleteAccount },
      ],
    );
  };

  return (
    <FormScreen>
      <Section title="Default reminders">
        <Text style={styles.muted}>Used for every job unless you override it on the job itself.</Text>
        <Card>
          <ReminderPicker value={reminders} onChange={setReminders} />
        </Card>
        <ErrorText error={error} />
        <Button title="Save reminder settings" onPress={save} loading={saving} />
      </Section>

      <Section title="Notifications">
        <Card>
          <Text style={styles.body}>
            {permission === false
              ? 'Notifications are turned off, so you won’t get job reminders.'
              : `${scheduledCount} reminder${scheduledCount === 1 ? '' : 's'} scheduled on this phone.`}
          </Text>
          <Text style={styles.muted}>
            Reminders are scheduled on this device and refresh each time you open the app.
          </Text>
        </Card>
        {permission === false && <Button title="Turn on notifications" onPress={enableNotifications} />}
      </Section>

      <Section title="Demo data">
        <Text style={styles.muted}>
          Adds sample clients, quotes and email history for trying the AI features. Running it again
          replaces the previous demo clients; your own clients are never touched.
        </Text>
        <Button variant="secondary" title="Load demo data" onPress={loadDemoData} loading={seeding} />
      </Section>

      <Section title="Account">
        <Text style={styles.muted}>Signed in as {session?.user.email}</Text>
        <Button variant="danger" title="Sign out" onPress={signOut} />
        <Button variant="danger" title="Delete account" onPress={confirmDeleteAccount} loading={deleting} />
        <Text style={styles.muted}>Permanently removes your account and everything stored in it.</Text>
      </Section>
    </FormScreen>
  );
}
