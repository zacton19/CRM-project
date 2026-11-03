export type ReminderSettings = {
  /** Offsets (minutes) before the job start, e.g. [60] = one hour before. */
  minutesBefore: number[];
  /** "HH:MM" reminder on the day before the job, or null for none. */
  dayBeforeTime: string | null;
};

export const DEFAULT_REMINDERS: ReminderSettings = { minutesBefore: [60], dayBeforeTime: '18:00' };

export type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientInput = Omit<Client, 'id' | 'created_at' | 'updated_at'>;

export type ClientSummary = Pick<
  Client,
  'id' | 'name' | 'address_line1' | 'address_line2' | 'city' | 'postcode'
>;

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export type Quote = {
  id: string;
  client_id: string;
  description: string;
  amount: number;
  status: QuoteStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client?: Pick<Client, 'id' | 'name'>;
};

export type QuoteInput = Pick<Quote, 'client_id' | 'description' | 'amount' | 'status' | 'notes'>;

export const JOB_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type Job = {
  id: string;
  client_id: string;
  series_id: string | null;
  occurrence_index: number | null;
  title: string;
  starts_at: string;
  duration_minutes: number;
  price: number | null;
  status: JobStatus;
  notes: string | null;
  reminders: ReminderSettings | null;
  created_at: string;
  updated_at: string;
  client?: ClientSummary;
};

export type JobInput = Pick<
  Job,
  'client_id' | 'title' | 'starts_at' | 'duration_minutes' | 'price' | 'notes' | 'reminders'
>;

export type JobSeries = {
  id: string;
  client_id: string;
  title: string;
  first_starts_at: string;
  time_zone: string;
  interval_weeks: number;
  duration_minutes: number;
  price: number | null;
  notes: string | null;
  active: boolean;
};
