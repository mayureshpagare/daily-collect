import React, { useEffect, useState } from 'react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { useLoad, useKey, isMod } from '../lib/hooks';
import { fmtDate, fmtDateTime, toNumber } from '../lib/format';
import { addDays } from '../lib/dates';
import { Loading, ErrorBox, Field } from '../components/ui';
import EntryActions from '../components/EntryActions';
import Icon from '../components/Icon';

export default function DayClose() {
  const { money, today, toast, bump, dataVersion, navigate } = useApp();
  const [date, setDate] = useState(today);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const { data, error, reload } = useLoad(() => api.closing.get(date), [date, dataVersion]);
  const recent = useLoad(() => api.closing.list(14), [dataVersion]);

  // Prefill from an existing closing when the date changes.
  useEffect(() => {
    if (!data || data.date !== date) return;
    setCounted(data.closing ? String(data.closing.counted) : '');
    setNote(data.closing?.note || '');
  }, [data?.date, data?.closing?.closed_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const countedNum = toNumber(counted);
  const hasCount = String(counted).trim() !== '' && Number.isFinite(countedNum) && countedNum >= 0;
  const diff = data && hasCount ? Math.round((countedNum - data.total) * 100) / 100 : null;
  const countError = String(counted).trim() && !hasCount ? 'Enter a valid amount (0 or more).' : null;

  const save = async () => {
    if (!hasCount) {
      toast('Enter the cash you counted first.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.closing.save({ date, counted: countedNum, note });
      toast(res.difference === 0 ? 'Day closed — cash matches.' : `Day closed with a difference of ${money(res.difference)}.`, res.difference === 0 ? 'success' : 'info');
      bump();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    try {
      const res = await api.exports.dayClosing({ date, counted: hasCount ? countedNum : null, note });
      if (!res?.canceled) toast(`Report saved to ${res.path}`, 'success', { label: 'Show', onClick: () => api.app.showItem(res.path) });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  useKey((e) => {
    if (isMod(e) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  });

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const changedSinceClose = data.closing && Math.abs(data.closing.expected - data.total) > 0.001;
  const diffTone = diff == null ? '' : diff === 0 ? 'ok' : diff < 0 ? 'bad' : 'warn';
  const diffText = diff == null ? 'Enter counted cash' : diff === 0 ? 'Balanced' : diff < 0 ? `Short by ${money(-diff)}` : `Excess ${money(diff)}`;

  return (
    <div className="page">
      <div className="toolbar">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} title="Previous day">
          <Icon name="back" size={16} />
        </button>
        <input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} title="Next day">
          <Icon name="chevronRight" size={16} />
        </button>
        <h3 style={{ margin: 0 }}>{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
        <div className="grow" />
        {data.closing && <span className="badge ok">Closed {fmtDateTime(data.closing.closed_at)}</span>}
      </div>

      <div className="closing-grid">
        <div className="closing-box">
          <div className="stat-label">Collected (system)</div>
          <div className="closing-num">{money(data.total)}</div>
          <div className="muted small">
            {data.entries.length} entries · {data.customers} of {data.activeCustomers} customers
          </div>
        </div>
        <div className="closing-box input-box">
          <Field label="Cash counted in hand" error={countError}>
            <input className="input amount-input xl" inputMode="decimal" placeholder="0.00" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />
          </Field>
        </div>
        <div className={`closing-box diff ${diffTone}`}>
          <div className="stat-label">Difference</div>
          <div className="closing-num">{diff == null ? '—' : money(diff)}</div>
          <div className="strong">{diffText}</div>
        </div>
      </div>

      {changedSinceClose && (
        <div className="warn-box">
          <Icon name="alert" size={16} /> Entries changed after this day was closed (collected was {money(data.closing.expected)}, now {money(data.total)}). Save again to update the closing.
        </div>
      )}

      <div className="row gap">
        <input className="input grow" placeholder="Closing note (optional) — e.g. handed over to manager" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        <button className="btn primary lg" onClick={save} disabled={saving}>
          <Icon name="check" size={16} /> {saving ? 'Saving…' : data.closing ? 'Update closing' : 'Close day'}
        </button>
        <button className="btn lg" onClick={exportPdf}>
          <Icon name="file" size={16} /> Export PDF
        </button>
      </div>

      <div className="grid-2-1">
        <section className="card">
          <div className="card-head">
            <h3>Entries</h3>
            <button className="btn sm ghost" onClick={() => navigate('bulk')}>
              Add more
            </button>
          </div>
          {data.entries.length === 0 ? (
            <p className="muted">No collections recorded for this date.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="num">Amount</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{e.customer_name}</td>
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
        </section>
        <section className="card">
          <div className="card-head">
            <h3>Recent closings</h3>
          </div>
          {(recent.data || []).length === 0 ? (
            <p className="muted">No days closed yet.</p>
          ) : (
            <ul className="simple-list">
              {recent.data.map((r) => (
                <li key={r.date} className="clickable" onClick={() => setDate(r.date)}>
                  <span>{fmtDate(r.date, { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                  <span className="num">{money(r.expected)}</span>
                  <span className={`pill ${r.difference === 0 ? 'ok' : r.difference < 0 ? 'bad' : 'warn'}`}>{r.difference === 0 ? 'OK' : money(r.difference)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
