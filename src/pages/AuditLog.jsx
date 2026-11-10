import React, { useState } from 'react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { fmtDateTime, fmtDate } from '../lib/format';
import { Loading, ErrorBox, Empty } from '../components/ui';
import Icon from '../components/Icon';

const PAGE = 100;

function describe(action, d, money) {
  const change = (k, v) => (k === 'amount' ? money(v) : v == null || v === '' ? '(empty)' : String(v));
  switch (action) {
    case 'customer.create':
      return `Added customer "${d.name}"${d.phone ? ` (${d.phone})` : ''}`;
    case 'customer.update':
      return `Edited "${d.name}": ${Object.entries(d.changes || {})
        .map(([k, v]) => `${k} ${v.from ?? '(empty)'} → ${v.to ?? '(empty)'}`)
        .join(', ')}`;
    case 'customer.delete':
      return `Deleted customer "${d.name}" and ${d.deleted_entries} entries (${money(d.deleted_total)})`;
    case 'customer.activate':
      return `Marked "${d.name}" active`;
    case 'customer.deactivate':
      return `Marked "${d.name}" inactive`;
    case 'customer.import':
      return `Imported ${d.imported} customers from CSV (${d.skipped} skipped)`;
    case 'collection.create':
      return `${money(d.amount)} from ${d.customer} on ${fmtDate(d.date)}${d.note ? ` — ${d.note}` : ''}`;
    case 'collection.bulk_create':
      return `Bulk entry: ${d.count} entries totalling ${money(d.total)} on ${fmtDate(d.date)}`;
    case 'collection.update':
      return `Edited entry #${d.id} for ${d.customer}: ${(d.changed || []).map((k) => `${k} ${change(k, d.before?.[k])} → ${change(k, d.after?.[k])}`).join(', ')}`;
    case 'collection.delete':
      return `Deleted entry #${d.id}: ${money(d.amount)} from ${d.customer} on ${fmtDate(d.date)}`;
    case 'day.close':
      return `Closed ${fmtDate(d.date)}: collected ${money(d.expected)}, counted ${money(d.counted)}, difference ${money(d.difference)}`;
    case 'settings.update':
      return `Changed settings: ${(d.keys || []).join(', ')}`;
    case 'pin.set':
      return 'PIN lock turned on';
    case 'pin.change':
      return 'PIN changed';
    case 'pin.remove':
      return 'PIN lock turned off';
    case 'backup.create':
      return `${d.kind === 'auto' ? 'Automatic' : 'Manual'} backup saved to ${d.file}`;
    case 'backup.restore':
      return `Restored data from ${d.file} (${d.customers} customers, ${d.collections} entries)`;
    default:
      return JSON.stringify(d);
  }
}

const TONE = { delete: 'bad', update: 'warn', create: 'ok', bulk_create: 'ok', restore: 'warn' };

export default function AuditLog() {
  const { money, dataVersion } = useApp();
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [expanded, setExpanded] = useState(null);
  const { data, error, reload } = useLoad(() => api.audit({ search, limit }), [search, limit, dataVersion]);

  return (
    <div className="page">
      <div className="toolbar">
        <div className="search-input">
          <Icon name="search" size={16} />
          <input className="input" placeholder="Search actions, names, amounts…" value={search} onChange={(e) => (setSearch(e.target.value), setLimit(PAGE))} />
        </div>
        <div className="segmented">
          {[
            ['', 'All'],
            ['collection.', 'Entries'],
            ['customer.', 'Customers'],
            ['delete', 'Deletions'],
            ['backup', 'Backups'],
          ].map(([q, l]) => (
            <button key={l} className={search === q ? 'active' : ''} onClick={() => (setSearch(q), setLimit(PAGE))}>
              {l}
            </button>
          ))}
        </div>
        <div className="grow" />
        {data && <span className="muted">{data.total} records</span>}
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && data.rows.length === 0 && <Empty title="No audit records" icon="shield" />}
      {data && data.rows.length > 0 && (
        <div className="card no-pad">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 170 }}>When</th>
                <th style={{ width: 170 }}>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                let d = {};
                try {
                  d = JSON.parse(r.details || '{}');
                } catch {
                  d = { raw: r.details };
                }
                const tone = TONE[r.action.split('.')[1]] || '';
                return (
                  <React.Fragment key={r.id}>
                    <tr onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="clickable">
                      <td className="muted small nowrap">{fmtDateTime(r.timestamp)}</td>
                      <td>
                        <span className={`pill ${tone}`}>{r.action}</span>
                      </td>
                      <td>{describe(r.action, d, money)}</td>
                    </tr>
                    {expanded === r.id && (
                      <tr className="sub-row">
                        <td colSpan={3}>
                          <pre className="json">{JSON.stringify(d, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {data.rows.length < data.total && (
            <div className="pad center">
              <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                Load more ({data.total - data.rows.length} older)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
