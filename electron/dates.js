'use strict';
// Date helpers working on local calendar dates stored as 'YYYY-MM-DD' strings.
// Arithmetic is done in UTC so daylight-saving changes never shift a day.

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

function today(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDays(s, n) {
  return fromUTC(parseISO(s) + n * DAY_MS);
}

/** Number of days from a to b (b - a). */
function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday */
function weekday(s) {
  return new Date(parseISO(s)).getUTCDay();
}

function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUTC(parseISO(s)) === s;
}

function monthStart(s) {
  return `${s.slice(0, 8)}01`;
}

function dateRange(from, to) {
  const out = [];
  if (from > to) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function timestamp(d = new Date()) {
  return `${today(d)}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

module.exports = { today, parseISO, fromUTC, addDays, diffDays, weekday, isValidISODate, monthStart, dateRange, timestamp };
