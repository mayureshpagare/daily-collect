'use strict';
const D = require('./dates');
const { round2 } = require('./validation');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * Forecast the next `days` days from a contiguous daily series.
 * Least-squares trend line, scaled by a damped day-of-week factor so that
 * weekly patterns (e.g. low Sundays) show up in the prediction.
 */
function linearForecast(series, days = 7) {
  const n = series.length;
  if (n === 0) return { points: [], total: 0, slopePerDay: 0, direction: 'flat' };
  const ys = series.map((p) => p.total);
  const xMean = (n - 1) / 2;
  const yMean = sum(ys) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  const wdSum = Array(7).fill(0);
  const wdCount = Array(7).fill(0);
  series.forEach((p) => {
    const w = D.weekday(p.date);
    wdSum[w] += p.total;
    wdCount[w] += 1;
  });

  const last = series[n - 1].date;
  const points = [];
  for (let i = 1; i <= days; i++) {
    const date = D.addDays(last, i);
    const w = D.weekday(date);
    const base = intercept + slope * (n - 1 + i);
    let factor = 1;
    if (yMean > 0 && wdCount[w] > 0) factor = 0.5 + 0.5 * (wdSum[w] / wdCount[w] / yMean);
    points.push({ date, amount: round2(Math.max(0, base * factor)) });
  }

  const threshold = Math.max(0.01, yMean * 0.02);
  const direction = slope > threshold ? 'up' : slope < -threshold ? 'down' : 'flat';
  return { points, total: round2(sum(points.map((p) => p.amount))), slopePerDay: round2(slope), direction };
}

function streaks(amounts) {
  let longest = 0;
  let run = 0;
  for (const a of amounts) {
    run = a > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // Current streak: consecutive paid days ending today, or ending yesterday if today is not paid yet.
  let i = amounts.length - 1;
  if (i >= 0 && amounts[i] <= 0) i -= 1;
  let current = 0;
  while (i >= 0 && amounts[i] > 0) {
    current += 1;
    i -= 1;
  }
  return { current, longest };
}

/**
 * @param {object} p
 * @param {Record<string, number>} p.daily  date -> total collected that day
 * @param {string} p.start  first day the customer is expected to pay
 * @param {string} p.today
 * @param {number|null} p.target  optional daily target
 */
function computeInsights({ daily, start, today, target = null }) {
  if (!start || start > today) start = today;
  const days = D.dateRange(start, today);
  const amounts = days.map((d) => daily[d] || 0);
  const total = round2(sum(amounts));
  const paidAmounts = amounts.filter((a) => a > 0);
  const paidDays = paidAmounts.length;

  // Day-of-week averages (average over every occurrence of that weekday in the period).
  const wd = WEEKDAYS.map((name, day) => ({ day, name, total: 0, occurrences: 0, paidDays: 0 }));
  days.forEach((d, i) => {
    const w = wd[D.weekday(d)];
    w.total += amounts[i];
    w.occurrences += 1;
    if (amounts[i] > 0) w.paidDays += 1;
  });
  const weekdayStats = wd.map((w) => ({ ...w, total: round2(w.total), avg: w.occurrences ? round2(w.total / w.occurrences) : 0 }));
  const occurred = weekdayStats.filter((w) => w.occurrences > 0);
  let bestDay = null;
  let worstDay = null;
  if (total > 0 && occurred.length > 1) {
    bestDay = occurred.reduce((a, b) => (b.avg > a.avg ? b : a));
    worstDay = occurred.reduce((a, b) => (b.avg < a.avg ? b : a));
  }

  // Consistency (0-100) over the most recent 90 days of the period.
  const window = amounts.slice(-Math.min(90, amounts.length));
  const windowPaid = window.filter((a) => a > 0);
  const attendance = window.length ? windowPaid.length / window.length : 0;
  let regularity = 0;
  if (windowPaid.length >= 2) {
    const mean = sum(windowPaid) / windowPaid.length;
    const sd = Math.sqrt(sum(windowPaid.map((a) => (a - mean) ** 2)) / windowPaid.length);
    regularity = clamp01(1 - sd / mean);
  } else if (windowPaid.length === 1) {
    regularity = 0.5;
  }
  const targetRate = target && target > 0 ? window.filter((a) => a >= target).length / window.length : attendance;
  const consistency = Math.round(100 * (0.6 * attendance + 0.25 * regularity + 0.15 * targetRate));
  const consistencyLabel = consistency >= 80 ? 'Excellent' : consistency >= 60 ? 'Good' : consistency >= 40 ? 'Fair' : 'Poor';

  const forecastSeries = days.slice(-28).map((d) => ({ date: d, total: daily[d] || 0 }));

  return {
    start,
    totalDays: days.length,
    paidDays,
    missedDays: days.length - paidDays,
    total,
    avgPerPaidDay: paidDays ? round2(total / paidDays) : 0,
    avgPerDay: days.length ? round2(total / days.length) : 0,
    maxDay: paidDays ? round2(Math.max(...paidAmounts)) : 0,
    weekdayStats,
    bestDay,
    worstDay,
    consistency,
    consistencyLabel,
    consistencyParts: {
      attendance: Math.round(attendance * 100),
      regularity: Math.round(regularity * 100),
      target: Math.round(targetRate * 100),
      windowDays: window.length,
    },
    streak: streaks(amounts),
    forecast: linearForecast(forecastSeries, 7),
  };
}

module.exports = { computeInsights, linearForecast, WEEKDAYS };
