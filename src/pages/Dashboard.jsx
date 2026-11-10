import React from 'react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { fmtDate, fmtShortDate } from '../lib/format';
import { StatCard, Loading, ErrorBox, Empty } from '../components/ui';
import BarChart from '../components/BarChart';
import Icon from '../components/Icon';

export default function Dashboard() {
  const { money, navigate, dataVersion, today, openQuickEntry } = useApp();
  const { data: d, error, reload } = useLoad(() => api.dashboard(), [dataVersion, today]);

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!d) return <Loading />;

  const change = d.yesterdayTotal ? Math.round(((d.todayTotal - d.yesterdayTotal) / d.yesterdayTotal) * 100) : null;
  const paidPct = d.activeCustomers ? Math.round((d.paidToday / d.activeCustomers) * 100) : 0;
  const trendWord = { up: 'trending up', down: 'trending down', flat: 'steady' }[d.forecast.direction];
  const topMax = Math.max(1, ...d.topCollectors.map((t) => t.total));

  const chart = d.last30.map((p) => ({ key: p.date, label: fmtShortDate(p.date).replace(' ', ' '), value: p.total, tip: fmtDate(p.date) }));
  const forecastChart = [
    ...d.last30.slice(-7).map((p) => ({ key: p.date, label: fmtShortDate(p.date), value: p.total, tip: `${fmtDate(p.date)} (actual)` })),
    ...d.forecast.points.map((p) => ({ key: `f${p.date}`, label: fmtShortDate(p.date), value: p.amount, tip: `${fmtDate(p.date)} (forecast)`, muted: true })),
  ];

  if (d.activeCustomers === 0 && d.allTimeTotal === 0) {
    return (
      <div className="page">
        <Empty title="Welcome to DailyCollect" icon="users">
          <p>Start by adding your customers. Then record what each one pays every day — the amount can be different each time.</p>
          <div className="row gap center">
            <button className="btn primary" onClick={() => navigate('customers', { new: true })}>
              <Icon name="userPlus" size={16} /> Add first customer
            </button>
            <button className="btn" onClick={() => navigate('settings')}>
              Import customers from CSV
            </button>
          </div>
        </Empty>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="stats-grid">
        <StatCard
          big
          tone="accent"
          label="Today's collection"
          icon="calendar"
          value={money(d.todayTotal)}
          sub={
            <>
              {d.todayEntries} entr{d.todayEntries === 1 ? 'y' : 'ies'} · yesterday {money(d.yesterdayTotal)}
              {change != null && <span className={change >= 0 ? 'ok' : 'bad'}> ({change >= 0 ? '+' : ''}{change}%)</span>}
            </>
          }
        />
        <StatCard label="This month" icon="trend" value={money(d.monthTotal)} sub={`${d.monthEntries} entries · all time ${money(d.allTimeTotal)}`} />
        <StatCard
          label="Paid today"
          icon="users"
          value={`${d.paidToday} / ${d.activeCustomers}`}
          sub={<span className={d.notPaidToday ? 'warn' : 'ok'}>{d.notPaidToday ? `${d.notPaidToday} not paid yet` : 'Everyone has paid'}</span>}
          onClick={() => navigate('missed')}
        />
        <StatCard label="Forecast next 7 days" icon="trend" value={money(d.forecast.total)} sub={`Collections ${trendWord} (${money(d.forecast.slopePerDay)}/day)`} />
      </div>

      <div className="grid-2-1">
        <section className="card">
          <div className="card-head">
            <h3>Last 30 days</h3>
            <span className="muted">{money(d.last30Total)}</span>
          </div>
          <BarChart data={chart} height={230} format={money} formatAxis={money.short} highlightKey={today} />
        </section>
        <section className="card">
          <div className="card-head">
            <h3>Top collectors this month</h3>
          </div>
          {d.topCollectors.length === 0 && <p className="muted">No collections this month yet.</p>}
          <ol className="top-list">
            {d.topCollectors.map((t, i) => (
              <li key={t.id} onClick={() => navigate('customer', { id: t.id })}>
                <span className="rank">{i + 1}</span>
                <div className="grow">
                  <div className="row between">
                    <span className="link">{t.name}</span>
                    <strong className="num">{money(t.total)}</strong>
                  </div>
                  <div className="meter">
                    <span style={{ width: `${(t.total / topMax) * 100}%` }} />
                  </div>
                  <div className="muted small">{t.entries} entries</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="grid-3">
        <section className="card">
          <div className="card-head">
            <h3>Paid vs not paid today</h3>
            <span className="muted">{paidPct}%</span>
          </div>
          <div className="progress big">
            <span style={{ width: `${paidPct}%` }} />
          </div>
          <div className="row between small" style={{ marginTop: 6 }}>
            <span className="ok">{d.paidToday} paid</span>
            <span className="warn">{d.notPaidToday} not paid</span>
          </div>
          {d.notPaidList.length > 0 && (
            <ul className="simple-list">
              {d.notPaidList.map((c) => (
                <li key={c.id}>
                  <span className="link" onClick={() => navigate('customer', { id: c.id })}>
                    {c.name}
                  </span>
                  <button className="btn sm ghost" onClick={() => openQuickEntry({ customerId: c.id })}>
                    + Add payment
                  </button>
                </li>
              ))}
            </ul>
          )}
          {d.notPaidToday > d.notPaidList.length && (
            <button className="btn sm block" onClick={() => navigate('missed')}>
              See all {d.notPaidToday} in Missed days
            </button>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <h3>Today's entries</h3>
            <button className="btn sm ghost" onClick={() => navigate('closing')}>
              Close day
            </button>
          </div>
          {d.recentToday.length === 0 ? (
            <p className="muted">Nothing recorded today yet.</p>
          ) : (
            <ul className="simple-list">
              {d.recentToday.map((e) => (
                <li key={e.id}>
                  <span>
                    {e.customer_name}
                    {e.note && <span className="muted small"> · {e.note}</span>}
                  </span>
                  <strong className="num">{money(e.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
          <button className="btn sm block" onClick={() => navigate('bulk')}>
            <Icon name="bulk" size={14} /> Open bulk entry
          </button>
        </section>
        <section className="card">
          <div className="card-head">
            <h3>7-day forecast</h3>
          </div>
          <BarChart data={forecastChart} height={190} format={money} formatAxis={money.short} />
          <p className="muted small">Hatched bars are predictions from the last 4 weeks' trend and weekday pattern.</p>
        </section>
      </div>
    </div>
  );
}
