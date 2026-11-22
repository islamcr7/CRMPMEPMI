import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { locale } from './i18n';
import type { Money, Organization } from '../types';

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<Organization>('/settings'), staleTime: 5 * 60_000 });
}

export function formatMoney(value: Money | null | undefined, currency = 'EUR', compact = false) {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(locale(), {
      style: 'currency',
      currency,
      maximumFractionDigits: compact ? 0 : 2,
      notation: compact && Math.abs(n) >= 100_000 ? 'compact' : 'standard',
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Formateur monétaire basé sur la devise des paramètres de l'organisation. */
export function useMoney() {
  const { data } = useSettings();
  const currency = data?.currency ?? 'EUR';
  return (v: Money | null | undefined, compact = false) => formatMoney(v, currency, compact);
}

export function formatDate(value: string | Date | null | undefined, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleDateString(locale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** Pour les champs <input type="date"> */
export function toDateInput(value: string | Date | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Pour les champs <input type="datetime-local"> */
export function toDateTimeInput(value: string | Date | null | undefined) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromDateTimeInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function isOverdue(date: string | null | undefined) {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(date) < today;
}

export const fullName = (c?: { firstName: string; lastName: string } | null) => (c ? `${c.firstName} ${c.lastName}` : '');
