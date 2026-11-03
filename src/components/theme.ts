export const colors = {
  primary: '#0E7490',
  primaryText: '#FFFFFF',
  background: '#F4F7F9',
  card: '#FFFFFF',
  text: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
  danger: '#DC2626',
  success: '#15803D',
  warning: '#B45309',
};

export const statusColors: Record<string, string> = {
  draft: colors.muted,
  sent: colors.warning,
  accepted: colors.success,
  declined: colors.danger,
  scheduled: colors.primary,
  completed: colors.success,
  cancelled: colors.muted,
};
