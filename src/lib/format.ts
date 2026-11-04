import { format } from 'date-fns';

import { ClientSummary } from './types';

const CURRENCY = process.env.EXPO_PUBLIC_CURRENCY || 'USD';
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY });

export function formatMoney(amount: number | null | undefined): string {
  return amount == null ? '—' : money.format(amount);
}

export function formatAddress(client: Partial<ClientSummary> | null | undefined): string {
  return client?.address?.trim() ?? '';
}

export function formatTime(iso: string | Date): string {
  return format(new Date(iso), 'h:mm a');
}

export function formatDateTime(iso: string | Date): string {
  return format(new Date(iso), 'EEE d MMM yyyy, h:mm a');
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

export function formatLeadTime(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 day' : `${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? '1 hour' : `${minutes / 60} hours`;
  return `${minutes} min`;
}

/** Parses a decimal from a text field; returns null for blank, NaN for invalid. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return Number(trimmed.replace(/[^0-9.]/g, ''));
}
