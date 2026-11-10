import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { colors } from '@/components/theme';
import { Loading } from '@/components/ui';
import { extendJobSeries } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { configureNotifications, ensureNotificationPermission, syncReminders } from '@/lib/reminders';

configureNotifications();

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const signedIn = !!session;

  useBackgroundSync(signedIn);
  useOpenJobFromNotification(signedIn);

  if (loading) return <Loading />;

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="clients/new" options={{ title: 'New client', presentation: 'modal' }} />
        <Stack.Screen name="clients/[id]/index" options={{ title: 'Client' }} />
        <Stack.Screen name="clients/[id]/edit" options={{ title: 'Edit client', presentation: 'modal' }} />
        <Stack.Screen name="quotes/new" options={{ title: 'New quote', presentation: 'modal' }} />
        <Stack.Screen name="quotes/[id]" options={{ title: 'Quote' }} />
        <Stack.Screen name="interactions/new" options={{ title: 'Log interaction', presentation: 'modal' }} />
        <Stack.Screen name="interactions/[id]" options={{ title: 'Interaction' }} />
        <Stack.Screen name="jobs/new" options={{ title: 'New job', presentation: 'modal' }} />
        <Stack.Screen name="jobs/[id]/index" options={{ title: 'Job' }} />
        <Stack.Screen name="jobs/[id]/edit" options={{ title: 'Edit job', presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

/** On sign-in and whenever the app returns to the foreground: top up recurring jobs, then reschedule reminders. */
function useBackgroundSync(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return;

    const run = async () => {
      try {
        await extendJobSeries();
        await syncReminders();
      } catch (e) {
        console.warn('Background sync failed', e);
      }
    };

    ensureNotificationPermission().then(run);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && run());
    return () => sub.remove();
  }, [signedIn]);
}

/** Tapping a reminder opens that job. */
function useOpenJobFromNotification(signedIn: boolean) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn || !response) return;
    const id = response.notification.request.identifier;
    const jobId = response.notification.request.content.data?.jobId;
    if (handled.current === id || typeof jobId !== 'string') return;
    handled.current = id;
    router.push({ pathname: '/jobs/[id]', params: { id: jobId } });
  }, [response, signedIn]);
}
