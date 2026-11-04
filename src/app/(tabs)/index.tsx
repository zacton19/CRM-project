import { addDays, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';

import { Fab } from '@/components/Fab';
import { colors, statusColors } from '@/components/theme';
import { Card, EmptyState, ErrorText, Section, StatusPill, styles } from '@/components/ui';
import { listJobsBetween, listUpcomingScheduledJobs } from '@/lib/api';
import { formatAddress, formatDateTime, formatDuration, formatMoney, formatTime } from '@/lib/format';
import { Job } from '@/lib/types';
import { useFocusQuery } from '@/lib/useQuery';

const dayKey = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');
const UPCOMING_COUNT = 5;

export default function ScheduleScreen() {
  const [selected, setSelected] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [month, setMonth] = useState(startOfMonth(new Date()));

  // Load the whole visible grid (including spill-over days from adjacent months).
  const {
    data: jobs = [],
    error,
    loading,
    reload,
  } = useFocusQuery(
    useCallback(() => listJobsBetween(startOfWeek(month), addDays(endOfWeek(endOfMonth(month)), 1)), [month]),
  );

  // Soonest scheduled jobs from now, regardless of which month is showing.
  const {
    data: upcoming = [],
    error: upcomingError,
    reload: reloadUpcoming,
  } = useFocusQuery(useCallback(() => listUpcomingScheduledJobs(UPCOMING_COUNT), []));

  const refresh = () => {
    reload();
    reloadUpcoming();
  };

  const jobsByDay = useMemo(() => {
    const map: Record<string, Job[]> = {};
    for (const job of jobs) (map[dayKey(job.starts_at)] ??= []).push(job);
    return map;
  }, [jobs]);

  const markedDates = useMemo(() => {
    const marks: Record<string, object> = {};
    for (const [day, dayJobs] of Object.entries(jobsByDay)) {
      marks[day] = {
        dots: dayJobs.slice(0, 4).map((j) => ({ key: j.id, color: statusColors[j.status] })),
      };
    }
    marks[selected] = { ...marks[selected], selected: true, selectedColor: colors.primary };
    return marks;
  }, [jobsByDay, selected]);

  const dayJobs = jobsByDay[selected] ?? [];
  const dayTotal = dayJobs
    .filter((j) => j.status !== 'cancelled')
    .reduce((sum, j) => sum + (j.price ?? 0), 0);

  return (
    <View style={styles.screen}>
      <FlatList
        data={dayJobs}
        keyExtractor={(job) => job.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading && jobs.length > 0} onRefresh={refresh} />}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Calendar
              current={selected}
              markingType="multi-dot"
              markedDates={markedDates}
              onDayPress={(d: DateData) => setSelected(d.dateString)}
              onMonthChange={(d: DateData) => setMonth(startOfMonth(parseISO(d.dateString)))}
              firstDay={1}
              enableSwipeMonths
              theme={{
                todayTextColor: colors.primary,
                arrowColor: colors.primary,
                selectedDayBackgroundColor: colors.primary,
              }}
              style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}
            />
            <ErrorText error={error} />
            <View style={styles.row}>
              <Text style={styles.sectionTitle}>{format(parseISO(selected), 'EEEE d MMMM')}</Text>
              {dayJobs.length > 0 && (
                <Text style={styles.muted}>
                  {dayJobs.length} job{dayJobs.length === 1 ? '' : 's'} · {formatMoney(dayTotal)}
                </Text>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={loading ? undefined : <EmptyState text="No jobs this day. Tap + to add one." />}
        renderItem={({ item: job }) => <JobCard job={job} heading={formatTime(job.starts_at)} />}
        ListFooterComponent={
          <View style={{ marginTop: 16 }}>
            <Section title="Upcoming jobs">
              <ErrorText error={upcomingError} />
              {!upcomingError && upcoming.length === 0 && (
                <Text style={styles.muted}>Nothing scheduled.</Text>
              )}
              {upcoming.map((job) => (
                <JobCard key={job.id} job={job} heading={formatDateTime(job.starts_at)} />
              ))}
            </Section>
          </View>
        }
      />
      <Fab
        label="New job"
        onPress={() => router.push({ pathname: '/jobs/new', params: { date: selected } })}
      />
    </View>
  );
}

function JobCard({ job, heading }: { job: Job; heading: string }) {
  const address = job.address || formatAddress(job.client);
  return (
    <Card onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}>
      <View style={styles.row}>
        <Text style={[styles.title, { flex: 1 }]}>
          {heading} · {job.client?.name}
        </Text>
        <StatusPill status={job.status} />
      </View>
      <Text style={styles.body}>
        {job.title} · {formatDuration(job.duration_minutes)}
        {job.price != null ? ` · ${formatMoney(job.price)}` : ''}
        {job.series_id ? '  ↻' : ''}
      </Text>
      {!!address && <Text style={styles.muted}>{address}</Text>}
    </Card>
  );
}
