import { supabase } from './supabase';
import {
  Client,
  ClientInput,
  DEFAULT_REMINDERS,
  Job,
  JobInput,
  JobStatus,
  Quote,
  QuoteInput,
  QuoteStatus,
  ReminderSettings,
} from './types';

const CLIENT_SUMMARY = 'client:clients(id, name, address_line1, address_line2, city, postcode)';

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
export async function listClients(search = ''): Promise<Client[]> {
  let query = supabase.from('clients').select('*').order('name');
  const term = search.trim().replace(/[%,()]/g, ' ');
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,address_line1.ilike.%${term}%,city.ilike.%${term}%,postcode.ilike.%${term}%,phone.ilike.%${term}%`,
    );
  }
  return unwrap(await query);
}

export async function getClient(id: string): Promise<Client> {
  return unwrap(await supabase.from('clients').select('*').eq('id', id).single());
}

export async function saveClient(input: ClientInput, id?: string): Promise<Client> {
  const query = id
    ? supabase.from('clients').update(input).eq('id', id)
    : supabase.from('clients').insert(input);
  return unwrap(await query.select().single());
}

export async function deleteClient(id: string): Promise<void> {
  unwrap(await supabase.from('clients').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------
export async function listQuotes(filter: { status?: QuoteStatus; clientId?: string } = {}): Promise<Quote[]> {
  let query = supabase
    .from('quotes')
    .select('*, client:clients(id, name)')
    .order('created_at', { ascending: false });
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.clientId) query = query.eq('client_id', filter.clientId);
  return unwrap(await query);
}

export async function getQuote(id: string): Promise<Quote> {
  return unwrap(await supabase.from('quotes').select('*, client:clients(id, name)').eq('id', id).single());
}

export async function saveQuote(input: QuoteInput, id?: string): Promise<Quote> {
  const query = id
    ? supabase.from('quotes').update(input).eq('id', id)
    : supabase.from('quotes').insert(input);
  return unwrap(await query.select().single());
}

export async function deleteQuote(id: string): Promise<void> {
  unwrap(await supabase.from('quotes').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
export async function listJobsBetween(from: Date, to: Date): Promise<Job[]> {
  return unwrap(
    await supabase
      .from('jobs')
      .select(`*, ${CLIENT_SUMMARY}`)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at'),
  );
}

export async function listJobsForClient(clientId: string): Promise<Job[]> {
  return unwrap(
    await supabase
      .from('jobs')
      .select('*')
      .eq('client_id', clientId)
      .order('starts_at', { ascending: false })
      .limit(50),
  );
}

export async function listUpcomingScheduledJobs(limit: number): Promise<Job[]> {
  return unwrap(
    await supabase
      .from('jobs')
      .select(`*, ${CLIENT_SUMMARY}`)
      .eq('status', 'scheduled')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(limit),
  );
}

export async function getJob(id: string): Promise<Job> {
  return unwrap(await supabase.from('jobs').select(`*, ${CLIENT_SUMMARY}`).eq('id', id).single());
}

/** Creates a one-off job, or a repeating series when intervalMonths is set. */
export async function createJob(input: JobInput, intervalMonths: number | null): Promise<void> {
  if (!intervalMonths) {
    unwrap(await supabase.from('jobs').insert(input));
    return;
  }
  unwrap(
    await supabase.from('job_series').insert({
      client_id: input.client_id,
      title: input.title,
      first_starts_at: input.starts_at,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      interval_months: intervalMonths,
      duration_minutes: input.duration_minutes,
      price: input.price,
      notes: input.notes,
      address: input.address,
      reminders: input.reminders,
    }),
  );
  await extendJobSeries();
}

/**
 * Updates one job. With applyToFuture, the series template and every later
 * scheduled visit in the series pick up the same title/duration/price/notes/address/reminders
 * (each visit keeps its own date and time).
 */
export async function updateJob(job: Job, input: JobInput, applyToFuture: boolean): Promise<void> {
  unwrap(await supabase.from('jobs').update(input).eq('id', job.id));
  if (!applyToFuture || !job.series_id) return;

  const shared = {
    title: input.title,
    duration_minutes: input.duration_minutes,
    price: input.price,
    notes: input.notes,
    address: input.address,
    reminders: input.reminders,
  };
  unwrap(await supabase.from('job_series').update(shared).eq('id', job.series_id));
  unwrap(
    await supabase
      .from('jobs')
      .update(shared)
      .eq('series_id', job.series_id)
      .eq('status', 'scheduled')
      .gt('starts_at', job.starts_at),
  );
}

export async function setJobStatus(id: string, status: JobStatus): Promise<void> {
  unwrap(await supabase.from('jobs').update({ status }).eq('id', id));
}

export async function deleteJob(id: string): Promise<void> {
  unwrap(await supabase.from('jobs').delete().eq('id', id));
}

/** Stops a series repeating and removes its scheduled visits after `after`. */
export async function stopSeries(seriesId: string, after: string): Promise<void> {
  unwrap(await supabase.from('job_series').update({ active: false }).eq('id', seriesId));
  unwrap(
    await supabase
      .from('jobs')
      .delete()
      .eq('series_id', seriesId)
      .eq('status', 'scheduled')
      .gt('starts_at', after),
  );
}

/**
 * Materialises upcoming occurrences for all active series (idempotent).
 * 56 weeks ahead, so a yearly job's next visit is always on the calendar.
 */
export async function extendJobSeries(horizonWeeks = 56): Promise<number> {
  return unwrap(await supabase.rpc('extend_job_series', { horizon_weeks: horizonWeeks }));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function getReminderSettings(): Promise<ReminderSettings> {
  const row = unwrap<{ reminders: ReminderSettings } | null>(
    await supabase.from('user_settings').select('reminders').maybeSingle(),
  );
  return row?.reminders ?? DEFAULT_REMINDERS;
}

export async function saveReminderSettings(reminders: ReminderSettings): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in');
  unwrap(await supabase.from('user_settings').upsert({ user_id: data.user.id, reminders }));
}
