import React, { useState } from 'react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { fmtDate, diffLabel } from '../lib/format';
import { Loading, ErrorBox, Empty } from '../components/ui';
import CustomerForm from '../components/CustomerForm';
import DeleteCustomerDialog from '../components/DeleteCustomerDialog';
import Icon from '../components/Icon';

export default function Customers({ params }) {
  const { money, navigate, dataVersion, today, toast, bump } = useApp();
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(true);
  const [editing, setEditing] = useState(params.new ? {} : null); // {} = new, object = edit
  const [deleting, setDeleting] = useState(null);
  const { data, error, reload } = useLoad(() => api.customers.list({ search, includeInactive }), [search, includeInactive, dataVersion]);

  const importCsv = async () => {
    try {
      const res = await api.exports.importCustomers();
      if (res?.canceled) return;
      bump();
      const skipped = res.skipped.length ? ` ${res.skipped.length} skipped — ${res.skipped.slice(0, 3).map((s) => `line ${s.line}: ${s.reason}`).join('; ')}` : '';
      toast(`Imported ${res.imported} customer${res.imported === 1 ? '' : 's'}.${skipped}`, res.skipped.length ? 'info' : 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const total = (data || []).reduce((a, c) => a + c.total, 0);

  return (
    <div className="page">
      <div className="toolbar">
        <div className="search-input">
          <Icon name="search" size={16} />
          <input className="input" placeholder="Search by name, phone or address…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
        <label className="check">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} /> Show inactive
        </label>
        <div className="grow" />
        <button className="btn" onClick={importCsv} title="Columns: name, phone, address, notes, start_date, daily_target">
          <Icon name="upload" size={16} /> Import CSV
        </button>
        <button className="btn ghost sm" onClick={() => api.exports.importTemplate().catch((e) => toast(e.message, 'error'))}>
          Template
        </button>
        <button className="btn primary" onClick={() => setEditing({})} title="Ctrl+Shift+N">
          <Icon name="userPlus" size={16} /> Add customer
        </button>
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && data.length === 0 && (
        <Empty title={search ? 'No customers match your search' : 'No customers yet'} icon="users">
          {!search && (
            <button className="btn primary" onClick={() => setEditing({})}>
              Add your first customer
            </button>
          )}
        </Empty>
      )}
      {data && data.length > 0 && (
        <div className="card no-pad">
          <table className="table hover">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th className="num">Daily target</th>
                <th>Last paid</th>
                <th className="num">Entries</th>
                <th className="num">Total collected</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} onClick={() => navigate('customer', { id: c.id })} className={c.active ? '' : 'inactive'}>
                  <td>
                    <div className="strong">{c.name}</div>
                    {c.address && <div className="muted small truncate">{c.address}</div>}
                  </td>
                  <td>{c.phone || <span className="muted">—</span>}</td>
                  <td className="num">{c.daily_target ? money(c.daily_target) : <span className="muted">—</span>}</td>
                  <td>
                    {c.last_date ? (
                      <>
                        {fmtDate(c.last_date, { day: '2-digit', month: 'short', year: 'numeric' })} <span className="muted small">{diffLabel(c.last_date, today)}</span>
                      </>
                    ) : (
                      <span className="muted">never</span>
                    )}
                    {!c.active && <span className="badge">inactive</span>}
                  </td>
                  <td className="num">{c.entry_count}</td>
                  <td className="num strong">{money(c.total)}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn" title="Edit" onClick={() => setEditing(c)}>
                      <Icon name="edit" size={16} />
                    </button>
                    <button className="icon-btn danger" title="Delete permanently" onClick={() => setDeleting(c.id)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>{data.length} customers</td>
                <td className="num">{money(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editing && <CustomerForm customer={editing.id ? editing : null} onClose={() => setEditing(null)} />}
      {deleting && <DeleteCustomerDialog customerId={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
