// Calendar-date helpers for 'YYYY-MM-DD' strings (same rules as electron/dates.js).
const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export function today(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
export function fromUTC(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export const addDays = (s, n) => fromUTC(parseISO(s) + n * DAY_MS);
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / DAY_MS);
export const weekday = (s) => new Date(parseISO(s)).getUTCDay();
export const monthStart = (s) => `${s.slice(0, 8)}01`;

export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
];

/** Week starts on Monday. */
export function presetRange(preset, t = today()) {
  switch (preset) {
    case 'today':
      return { from: t, to: t };
    case 'week': {
      const back = (weekday(t) + 6) % 7;
      return { from: addDays(t, -back), to: t };
    }
    case 'month':
      return { from: monthStart(t), to: t };
    case 'last30':
      return { from: addDays(t, -29), to: t };
    case 'lastMonth': {
      const end = addDays(monthStart(t), -1);
      return { from: monthStart(end), to: end };
    }
    case 'all':
    default:
      return { from: null, to: null };
  }
}
