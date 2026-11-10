import { parseISO, diffDays } from './dates';

export function diffLabel(date, today) {
  const n = diffDays(date, today);
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 0) return `in ${-n} days`;
  return `${n} days ago`;
}

export function makeMoney(settings) {
  let nf;
  let nfShort;
  try {
    nf = new Intl.NumberFormat(settings?.locale || 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    nfShort = new Intl.NumberFormat(settings?.locale || 'en-IN', { notation: 'compact', maximumFractionDigits: 1 });
  } catch {
    nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    nfShort = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
  }
  const sym = settings?.currency_symbol ?? '';
  const money = (n) => {
    const v = Number(n) || 0;
    return `${v < 0 ? '-' : ''}${sym}${nf.format(Math.abs(v))}`;
  };
  money.short = (n) => {
    const v = Number(n) || 0;
    return `${v < 0 ? '-' : ''}${sym}${nfShort.format(Math.abs(v))}`;
  };
  money.symbol = sym;
  return money;
}

export function fmtDate(iso, opts = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  return new Date(parseISO(iso)).toLocaleDateString(undefined, { timeZone: 'UTC', ...opts });
}

export const fmtShortDate = (iso) => fmtDate(iso, { day: '2-digit', month: 'short' });

export function fmtDateTime(s) {
  if (!s) return '—';
  // SQLite local timestamps look like "2026-11-10 14:05:09"
  const d = new Date(String(s).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Client-side amount check mirroring the main-process rules; returns an error message or null. */
export function amountError(raw, { required = true } = {}) {
  const s = String(raw ?? '').trim();
  if (!s) return required ? 'Amount is required.' : null;
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n)) return 'Amount must be a number.';
  if (n < 0) return 'Amount cannot be negative.';
  if (n === 0) return 'Amount must be greater than zero.';
  return null;
}

export const toNumber = (raw) => Number(String(raw ?? '').replace(/,/g, '').trim());
