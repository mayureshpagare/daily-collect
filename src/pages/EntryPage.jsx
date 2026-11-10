import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { amountError, toNumber, fmtDate, fmtDateTime } from '../lib/format';
import { addDays } from '../lib/dates';
import CustomerPicker from '../components/CustomerPicker';
import EntryActions from '../components/EntryActions';
import { Field, Loading, ErrorBox, Empty } from '../components/ui';
import Icon from '../components/Icon';

export default function EntryPage({ params }) {
  const { money, today, toast, bump, dataVersion, navigate } = useApp();
  const [date, setDate] = useState(params.date || today);
  const [customerId, setCustomerId] = useState(params.customerId || null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const pickerRef = useRef(null);
  const amountRef = useRef(null);

  const customers = useLoad(() => api.customers.list({ includeInactive: false }), [dataVersion]);
  const entries = useLoad(() => api.collections.forDate(date), [date, dataVersion]);

  const selected = customers.data?.find((c) => c.id === customerId);
  const paidOnDate = useMemo(
    () => (entries.data || []).filter((e) => e.customer_id === customerId).reduce((a, e) => a + e.amount, 0),
    [entries.data, customerId]
  );
  const dayTotal = (entries.data || []).reduce((a, e) => a + e.amount, 0);

  const submit = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (!customerId) errs.customer = 'Choose a customer.';
    if (!date) errs.date = 'Choose a date.';
    const aErr = amountError(amount);
    if (aErr) errs.amount = aErr;
    setErrors(errs);
    if (errs.customer) return pickerRef.current?.focus();
    if (errs.amount) return amountRef.current?.focus();
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const saved = await api.collections.add({ customer_id: customerId, date, amount: toNumber(amount), note });
      toast(`Saved ${money(saved.amount)} for ${saved.customer_name}.`, 'success');
      setAmount('');
      setNote('');
      setCustomerId(null);
      bump();
      setTimeout(() => pickerRef.current?.focus(), 0);
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (customers.error) return <ErrorBox message={customers.error} onRetry={customers.reload} />;
  if (!customers.data) return <Loading />;
  if (customers.data.length === 0) {
    return (
      <Empty title="No active customers" icon="users">
        <button className="btn primary" onClick={() => navigate('customers', { new: true })}>
          Add a customer
        </button>
      </Empty>
    );
  }

  return (
    <div className="page grid-1-1">
      <section className="card">
        <div className="card-head">
          <h3>Record a collection</h3>
          <span className="muted small">Enter moves through fields · saves on the last one</span>
        </div>
        <form className="form-grid" onSubmit={submit}>
          {errors.form && <div className="form-error">{errors.form}</div>}
          <Field label="Date" required error={errors.date}>
            <div className="row gap-sm">
              <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, -1))} title="Previous day">
                <Icon name="back" size={16} />
              </button>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
              <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, 1))} title="Next day">
                <Icon name="chevronRight" size={16} />
              </button>
              {date !== today && (
                <button type="button" className="btn sm ghost" onClick={() => setDate(today)}>
                  Today
                </button>
              )}
            </div>
          </Field>
          <Field label="Customer" required error={errors.customer}>
            <CustomerPicker customers={customers.data} value={customerId} onChange={setCustomerId} inputRef={pickerRef} autoFocus onPicked={() => amountRef.current?.focus()} />
          </Field>
          {selected && (
            <div className="customer-hint">
              <div>
                <span className="muted small">Daily target</span>
                <strong>{selected.daily_target ? money(selected.daily_target) : '—'}</strong>
              </div>
              <div>
                <span className="muted small">Paid on {date === today ? 'today' : fmtDate(date, { day: '2-digit', month: 'short' })}</span>
                <strong className={paidOnDate ? 'ok' : ''}>{money(paidOnDate)}</strong>
              </div>
              <div>
                <span className="muted small">Last payment</span>
                <strong>{selected.last_date ? fmtDate(selected.last_date, { day: '2-digit', month: 'short', year: 'numeric' }) : 'never'}</strong>
              </div>
              <div>
                <span className="muted small">Total collected</span>
                <strong>{money(selected.total)}</strong>
              </div>
            </div>
          )}
          <Field label="Amount" required error={errors.amount}>
            <input
              ref={amountRef}
              className="input amount-input xl"
              inputMode="decimal"
              placeholder={selected?.daily_target ? String(selected.daily_target) : '0.00'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </Field>
          <Field label="Note" hint="Optional">
            <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <button className="btn primary lg" type="submit" disabled={saving}>
            <Icon name="save" size={16} /> {saving ? 'Saving…' : 'Save entry'}
          </button>
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Entries on {fmtDate(date)}</h3>
          <strong className="num">{money(dayTotal)}</strong>
        </div>
        {entries.error && <ErrorBox message={entries.error} onRetry={entries.reload} />}
        {!entries.data ? (
          <Loading />
        ) : entries.data.length === 0 ? (
          <p className="muted">No entries for this date yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="num">Amount</th>
                <th>Note</th>
                <th>Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.data.map((e) => (
                <tr key={e.id}>
                  <td>
                    <span className="link" onClick={() => navigate('customer', { id: e.customer_id })}>
                      {e.customer_name}
                    </span>
                  </td>
                  <td className="num strong">{money(e.amount)}</td>
                  <td className="muted">{e.note}</td>
                  <td className="muted small nowrap">{fmtDateTime(e.created_at).split(', ').pop()}</td>
                  <td className="actions">
                    <EntryActions entry={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
