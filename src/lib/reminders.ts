import { setHours, setMinutes, startOfDay, subDays, subMinutes } from 'date-fns';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getReminderSettings, listUpcomingScheduledJobs } from './api';
import { formatAddress, formatLeadTime, formatTime } from './format';
import { Job, ReminderSettings } from './types';

// iOS keeps at most 64 pending local notifications per app; leave headroom.
const MAX_SCHEDULED = 60;
// How many upcoming jobs to consider when filling those slots.
const JOB_LOOKAHEAD = 100;

export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('job-reminders', {
      name: 'Job reminders',
      // eslint-disable-next-line import/namespace -- exported via `export *`; the import plugin can't follow it
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

type PlannedReminder = { at: Date; job: Job; title: string };

export function planReminders(job: Job, defaults: ReminderSettings, now = new Date()): PlannedReminder[] {
  const settings = job.reminders ?? defaults;
  const start = new Date(job.starts_at);
  const clientName = job.client?.name ?? 'client';
  const planned: PlannedReminder[] = [];

  for (const minutes of settings.minutesBefore) {
    planned.push({
      at: subMinutes(start, minutes),
      job,
      title: `In ${formatLeadTime(minutes)}: ${job.title} – ${clientName}`,
    });
  }

  if (settings.dayBeforeTime) {
    const [h, m] = settings.dayBeforeTime.split(':').map(Number);
    planned.push({
      at: setMinutes(setHours(subDays(startOfDay(start), 1), h), m),
      job,
      title: `Tomorrow ${formatTime(start)}: ${job.title} – ${clientName}`,
    });
  }

  return planned.filter((r) => r.at > now);
}

let syncInFlight: Promise<void> = Promise.resolve();

/**
 * Rebuilds the device's scheduled reminders from Supabase. Call after any job
 * change and when the app comes to the foreground. Calls are serialised so
 * overlapping syncs can't double-schedule.
 */
export function syncReminders(): Promise<void> {
  syncInFlight = syncInFlight.catch(() => {}).then(doSync);
  return syncInFlight;
}

async function doSync(): Promise<void> {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;

  const [defaults, jobs] = await Promise.all([
    getReminderSettings(),
    listUpcomingScheduledJobs(JOB_LOOKAHEAD),
  ]);

  const reminders = jobs
    .flatMap((job) => planReminders(job, defaults))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_SCHEDULED);

  // This app is the only source of scheduled notifications, so a full reset is safe.
  await Notifications.cancelAllScheduledNotificationsAsync();

  for (const reminder of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: reminder.title,
        body: formatAddress(reminder.job.client) || undefined,
        data: { jobId: reminder.job.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.at,
        channelId: 'job-reminders',
      },
    });
  }
}

export async function clearReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
