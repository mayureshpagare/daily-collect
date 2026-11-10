import { fmtDate } from './format';

export const PLACEHOLDERS = [
  ['{name}', 'Customer name'],
  ['{days}', 'Days without payment'],
  ['{last_date}', 'Last payment date'],
  ['{last_amount}', 'Last payment amount'],
  ['{target}', 'Daily target'],
  ['{business}', 'Your business name'],
  ['{today}', "Today's date"],
];

export function buildReminder(template, customer, { money, settings, today }) {
  const values = {
    name: customer.name,
    days: String(customer.daysWithout ?? 0),
    last_date: customer.last_date ? fmtDate(customer.last_date) : 'never',
    last_amount: customer.last_amount ? money(customer.last_amount) : '—',
    target: customer.daily_target ? money(customer.daily_target) : '—',
    business: settings.business_name || 'us',
    today: fmtDate(today),
  };
  return String(template || '').replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
}
