import React, { useState } from 'react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { fmtDate } from '../lib/format';
import { Loading, ErrorBox, Tabs, Empty } from '../components/ui';
import DateRangeFilter, { initialRange } from '../components/DateRangeFilter';
import EntryActions from '../components/EntryActions';
import Icon from '../components/Icon';

export default function History() {
  const { today, toast } = useApp();
  const [tab, setTab] = useState('bydate');
  const [range, setRange] = useState(() => initialRange('month', today));

  const exportEntries = async (format, extra = {}) => {
    try {
      const res = await api.exports.entries({ from: range.from, to: range.to, ...extra }, format);
      if (!res?.canceled) toast(`Exported to ${res.path}`, 'success', { label: 'Show', onClick: () => api.app.showItem(res.path) });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <DateRangeFilter value={range} onChange={setRange} presets={['today', 'week', 'month', 'last30', 'lastMonth', 'all', 'custom']} />
        <div className="grow" />
        <button className="btn sm" onClick={() => exportEntries('csv')}>
          <Icon name="download" size={15} /> CSV
        </button>
        <button className="btn sm" onClick={() => exportEntries('pdf')}>
          <Icon name="file" size={15} /> PDF
        </button>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'bydate', label: 'By date' },
          { id: 'entries', label: 'All entries' },
        ]}
      />
      {tab === 'bydate' ? <ByDate range={range} /> : <AllEntries range={range} />}
    </div>
  );
}

function ByDate({ range }) {
  const { money, dataVersion } = useApp();
  const [open, setOpen] = useState(null);
  const { data, error, reload } = useLoad(() => api.historyByDate({ from: range.from, to: range.to }), [range.from, range.to, dataVersion]);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (!data.rows.length) return <Empty title="No collections in this period" icon="history" />;
  const max = Math.max(...data.rows.map((r) => r.total));
  return (
    <div className="card no-pad">
      <div className="ledger-summary pad">
        <div>
          <span className="muted small">Total</span>
          <strong>{money(data.total)}</strong>
        </div>
        <div>
          <span className="muted small">Days with collections</span>
          <strong>{data.days}</strong>
        </div>
        <div>
          <span className="muted small">Entries</span>
          <strong>{data.entries}</strong>
        </div>
        <div>
          <span className="muted small">Average per day</span>
          <strong>{money(data.days ? data.total / data.days : 0)}</strong>
        </div>
      </div>
      <table className="table hover">
        <thead>
          <tr>
            <th style={{ width: 30 }} />
            <th>Date</th>
            <th className="num">Customers</th>
            <th className="num">Entries</th>
            <th style={{ width: '30%' }} />
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <React.Fragment key={r.date}>
              <tr onClick={() => setOpen(open === r.date ? null : r.date)} className={open === r.date ? 'expanded' : ''}>
                <td>
                  <Icon name={open === r.date ? 'chevronDown' : 'chevronRight'} size={15} />
                </td>
                <td className="strong">{fmtDate(r.date)}</td>
                <td className="num">{r.customers}</td>
                <td className="num">{r.entries}</td>
                <td>
                  <div className="meter">
                    <span style={{ width: `${(r.total / max) * 100}%` }} />
                  </div>
                </td>
                <td className="num strong">{money(r.total)}</td>
              </tr>
              {open === r.date && (
                <tr className="sub-row">
                  <td />
                  <td colSpan={5}>
                    <DayEntries date={r.date} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayEntries({ date }) {
  const { money, dataVersion, navigate } = useApp();
  const { data, error } = useLoad(() => api.collections.forDate(date), [date, dataVersion]);
  if (error) return <div className="form-error">{error}</div>;
  if (!data) return <Loading />;
  return (
    <table className="table compact">
      <tbody>
        {data.map((e) => (
          <tr key={e.id}>
            <td>
              <span className="link" onClick={() => navigate('customer', { id: e.customer_id })}>
                {e.customer_name}
              </span>
            </td>
            <td className="muted">{e.note}</td>
            <td className="num strong">{money(e.amount)}</td>
            <td className="actions">
              <EntryActions entry={e} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AllEntries({ range }) {
  const { money, dataVersion, navigate } = useApp();
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const customers = useLoad(() => api.customers.list({ includeInactive: true }), [dataVersion]);
  const { data, error, reload } = useLoad(
    () => api.collections.list({ from: range.from, to: range.to, search, customerId: customerId || null, limit: 2000 }),
    [range.from, range.to, search, customerId, dataVersion]
  );
  const total = (data || []).reduce((a, e) => a + e.amount, 0);
  return (
    <div className="card no-pad">
      <div className="toolbar pad">
        <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">All customers</option>
          {(customers.data || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input className="input" placeholder="Search name or note…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
        <div className="grow" />
        {data && (
          <span className="muted">
            {data.length} entries · <strong>{money(total)}</strong>
            {data.length >= 2000 && ' (showing latest 2000 — narrow the dates to see more)'}
          </span>
        )}
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && data.length === 0 && <Empty title="No entries match" icon="history" />}
      {data && data.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th className="num">Amount</th>
              <th>Note</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id}>
                <td className="nowrap">{fmtDate(e.date)}</td>
                <td>
                  <span className="link" onClick={() => navigate('customer', { id: e.customer_id })}>
                    {e.customer_name}
                  </span>
                </td>
                <td className="num strong">{money(e.amount)}</td>
                <td className="muted">{e.note}</td>
                <td className="actions">
                  <EntryActions entry={e} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
