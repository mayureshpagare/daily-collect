import React, { useState } from 'react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { fmtDate, fmtShortDate, diffLabel } from '../lib/format';
import { addDays } from '../lib/dates';
import { Loading, ErrorBox, Empty, Tabs, StatCard } from '../components/ui';
import DateRangeFilter, { initialRange } from '../components/DateRangeFilter';
import EntryActions from '../components/EntryActions';
import CustomerForm from '../components/CustomerForm';
import DeleteCustomerDialog from '../components/DeleteCustomerDialog';
import Heatmap from '../components/Heatmap';
import BarChart from '../components/BarChart';
import Icon from '../components/Icon';

export default function CustomerDetail({ params }) {
  const id = params.id;
  const { money, goBack, navigate, dataVersion, today, toast, openQuickEntry } = useApp();
  const [tab, setTab] = useState(params.tab || 'ledger');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cust = useLoad(() => api.customers.get(id), [id, dataVersion]);

  if (cust.error) {
    return (
      <Empty title="Customer not found" icon="users">
        <p>{cust.error}</p>
        <button className="btn" onClick={() => navigate('customers')}>
          Back to customers
        </button>
      </Empty>
    );
  }
  if (!cust.data) return <Loading />;
  const c = cust.data;

  const exportHistory = async (format) => {
    try {
      const res = await api.exports.customerHistory(c.id, format);
      if (!res?.canceled) toast(`Exported to ${res.path}`, 'success', { label: 'Show', onClick: () => api.app.showItem(res.path) });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const toggleActive = async () => {
    try {
      await api.customers.setActive(c.id, !c.active);
      toast(c.active ? `${c.name} marked inactive.` : `${c.name} is active again.`, 'success');
      cust.reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="page">
      <div className="customer-header card">
        <div className="row gap">
          <button className="icon-btn" onClick={goBack} title="Back">
            <Icon name="back" />
          </button>
          <div className="avatar">{c.name.slice(0, 1).toUpperCase()}</div>
          <div className="grow">
            <h2 className="customer-name">
              {c.name} {!c.active && <span className="badge">inactive</span>}
            </h2>
            <div className="muted small row gap-sm wrap">
              {c.phone && (
                <span>
                  <Icon name="phone" size={13} /> {c.phone}
                </span>
              )}
              {c.address && <span>· {c.address}</span>}
              {c.start_date && <span>· customer since {fmtDate(c.start_date, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
            </div>
            {c.notes && <div className="notes">{c.notes}</div>}
          </div>
          <div className="row gap-sm wrap end">
            <button className="btn primary" onClick={() => openQuickEntry({ customerId: c.id })}>
              <Icon name="plus" size={16} /> Add payment
            </button>
            <button className="btn" onClick={() => setEditing(true)}>
              <Icon name="edit" size={16} /> Edit
            </button>
            <button className="btn" onClick={toggleActive}>
              {c.active ? 'Mark inactive' : 'Mark active'}
            </button>
            <button className="btn" onClick={() => exportHistory('csv')}>
              <Icon name="download" size={16} /> CSV
            </button>
            <button className="btn" onClick={() => exportHistory('pdf')}>
              <Icon name="file" size={16} /> PDF
            </button>
            <button className="btn danger-outline" onClick={() => setDeleting(true)}>
              <Icon name="trash" size={16} /> Delete
            </button>
          </div>
        </div>
        <div className="stats-grid compact">
          <StatCard label="Total collected" value={money(c.total)} />
          <StatCard label="Entries" value={c.entry_count} />
          <StatCard label="Last payment" value={c.last_date ? fmtDate(c.last_date, { day: '2-digit', month: 'short' }) : 'never'} sub={c.last_date ? diffLabel(c.last_date, today) : null} />
          <StatCard label="Daily target" value={c.daily_target ? money(c.daily_target) : '—'} />
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'ledger', label: 'Ledger' },
          { id: 'heatmap', label: 'Calendar heatmap' },
          { id: 'insights', label: 'Smart insights' },
        ]}
      />
      {tab === 'ledger' && <LedgerTab customer={c} />}
      {tab === 'heatmap' && <HeatmapTab customer={c} />}
      {tab === 'insights' && <InsightsTab customer={c} />}

      {editing && <CustomerForm customer={c} onClose={() => setEditing(false)} />}
      {deleting && <DeleteCustomerDialog customerId={c.id} onClose={() => setDeleting(false)} onDeleted={() => navigate('customers')} />}
    </div>
  );
}

function LedgerTab({ customer }) {
  const { money, today, dataVersion } = useApp();
  const [range, setRange] = useState(() => initialRange('all', today));
  const [newestFirst, setNewestFirst] = useState(true);
  const { data, error, reload } = useLoad(() => api.ledger(customer.id, { from: range.from, to: range.to }), [customer.id, range.from, range.to, dataVersion]);

  const rows = data ? (newestFirst ? [...data.rows].reverse() : data.rows) : [];

  return (
    <section className="card">
      <div className="toolbar">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="grow" />
        <label className="check">
          <input type="checkbox" checked={newestFirst} onChange={(e) => setNewestFirst(e.target.checked)} /> Newest first
        </label>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="ledger-summary">
            {range.from && (
              <div>
                <span className="muted small">Brought forward</span>
                <strong>{money(data.opening)}</strong>
              </div>
            )}
            <div>
              <span className="muted small">Collected in period</span>
              <strong>{money(data.total)}</strong>
            </div>
            <div>
              <span className="muted small">Entries</span>
              <strong>{data.count}</strong>
            </div>
            <div>
              <span className="muted small">Running total at end</span>
              <strong>{money(data.closing)}</strong>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="muted">No entries in this period.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Amount</th>
                  <th>Note</th>
                  <th className="num">Running total</th>
                  <th className="muted small">Last changed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtDate(r.date)}</td>
                    <td className="num strong">{money(r.amount)}</td>
                    <td className="muted">{r.note}</td>
                    <td className="num">{money(r.running_total)}</td>
                    <td className="muted small nowrap">{r.updated_at !== r.created_at ? `edited ${r.updated_at.slice(0, 16)}` : ''}</td>
                    <td className="actions">
                      <EntryActions entry={r} customerName={customer.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

function HeatmapTab({ customer }) {
  const { money, today, dataVersion } = useApp();
  const [year, setYear] = useState('last');
  const from = year === 'last' ? addDays(today, -364) : `${year}-01-01`;
  const to = year === 'last' ? today : `${year}-12-31`;
  const { data, error, reload } = useLoad(() => api.heatmap(customer.id, { from, to }), [customer.id, from, to, dataVersion]);

  return (
    <section className="card">
      <div className="toolbar">
        <div className="segmented">
          <button className={year === 'last' ? 'active' : ''} onClick={() => setYear('last')}>
            Last 12 months
          </button>
          {(data?.years || []).map((y) => (
            <button key={y} className={year === y ? 'active' : ''} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && <Heatmap days={data.days} from={data.from} to={data.to} target={data.target} money={money} today={today} />}
    </section>
  );
}

function Gauge({ value, label }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const tone = value >= 80 ? 'ok' : value >= 60 ? 'primary' : value >= 40 ? 'warn' : 'bad';
  return (
    <div className="gauge">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} className="gauge-track" />
        <circle cx="65" cy="65" r={r} className={`gauge-fill ${tone}`} strokeDasharray={`${(value / 100) * circ} ${circ}`} transform="rotate(-90 65 65)" />
        <text x="65" y="66" textAnchor="middle" className="gauge-value">
          {value}
        </text>
        <text x="65" y="86" textAnchor="middle" className="gauge-label">
          {label}
        </text>
      </svg>
    </div>
  );
}

function InsightsTab({ customer }) {
  const { money, dataVersion } = useApp();
  const { data: i, error, reload } = useLoad(() => api.insights(customer.id), [customer.id, dataVersion]);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!i) return <Loading />;
  if (i.total === 0) return <Empty title="No payments yet" icon="trend">Insights appear once this customer has some entries.</Empty>;

  const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
  const wdData = weekdayOrder.map((d) => {
    const w = i.weekdayStats[d];
    return { key: String(d), label: w.name.slice(0, 3), value: w.avg, tip: `${w.name}: paid ${w.paidDays} of ${w.occurrences}` };
  });
  const fcData = i.forecast.points.map((p) => ({ key: p.date, label: fmtShortDate(p.date), value: p.amount, tip: fmtDate(p.date), muted: true }));

  return (
    <div className="insights">
      <div className="grid-1-2">
        <section className="card center-content">
          <h3>Payment consistency</h3>
          <Gauge value={i.consistency} label={i.consistencyLabel} />
          <div className="score-parts small">
            <div>
              <span>Days paid</span>
              <strong>{i.consistencyParts.attendance}%</strong>
            </div>
            <div>
              <span>Amount steadiness</span>
              <strong>{i.consistencyParts.regularity}%</strong>
            </div>
            <div>
              <span>{customer.daily_target ? 'Met target' : 'Target (n/a)'}</span>
              <strong>{i.consistencyParts.target}%</strong>
            </div>
          </div>
          <p className="muted small">Based on the last {i.consistencyParts.windowDays} days.</p>
        </section>
        <div className="stats-grid">
          <StatCard label="Average per paid day" value={money(i.avgPerPaidDay)} sub={`${i.paidDays} paid days`} />
          <StatCard label="Average per calendar day" value={money(i.avgPerDay)} sub={`over ${i.totalDays} days since ${fmtDate(i.start, { day: '2-digit', month: 'short', year: 'numeric' })}`} />
          <StatCard label="Best day of week" value={i.bestDay ? i.bestDay.name : '—'} sub={i.bestDay ? `avg ${money(i.bestDay.avg)}` : 'needs more data'} tone="good" />
          <StatCard label="Worst day of week" value={i.worstDay ? i.worstDay.name : '—'} sub={i.worstDay ? `avg ${money(i.worstDay.avg)}` : 'needs more data'} tone="bad" />
          <StatCard label="Current streak" value={`${i.streak.current} day${i.streak.current === 1 ? '' : 's'}`} sub={`Longest: ${i.streak.longest} days`} />
          <StatCard label="Missed days" value={i.missedDays} sub={`Highest single day ${money(i.maxDay)}`} />
        </div>
      </div>
      <div className="grid-1-1">
        <section className="card">
          <div className="card-head">
            <h3>Average by day of week</h3>
          </div>
          <BarChart data={wdData} height={200} format={money} formatAxis={money.short} />
        </section>
        <section className="card">
          <div className="card-head">
            <h3>Next 7 days prediction</h3>
            <strong>{money(i.forecast.total)}</strong>
          </div>
          <BarChart data={fcData} height={200} format={money} formatAxis={money.short} />
          <p className="muted small">
            Trend: <strong>{i.forecast.direction}</strong> ({money(i.forecast.slopePerDay)} per day). Simple linear trend over the last 4 weeks, adjusted by weekday pattern.
          </p>
        </section>
      </div>
    </div>
  );
}
