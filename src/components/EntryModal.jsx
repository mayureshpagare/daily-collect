import React, { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import CustomerPicker from './CustomerPicker';
import { Field } from './ui';
import { api } from '../lib/api';
import { useApp } from '../context';
import { amountError, toNumber } from '../lib/format';

/** Add a new entry (entry = null) or edit an existing one. */
export default function EntryModal({ entry, defaultCustomerId = null, defaultDate, onClose, onSaved }) {
  const { today, toast, bump, money } = useApp();
  const editing = !!entry;
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState(entry?.customer_id ?? defaultCustomerId);
  const [date, setDate] = useState(entry?.date ?? defaultDate ?? today);
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const amountRef = useRef(null);

  useEffect(() => {
    if (editing) return;
    api.customers.list({ includeInactive: false }).then(setCustomers, (e) => toast(e.message, 'error'));
  }, [editing, toast]);

  const submit = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (!customerId) errs.customer = 'Choose a customer.';
    if (!date) errs.date = 'Choose a date.';
    const aErr = amountError(amount);
    if (aErr) errs.amount = aErr;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = { amount: toNumber(amount), date, note };
      const saved = editing ? await api.collections.update(entry.id, payload) : await api.collections.add({ ...payload, customer_id: customerId });
      toast(editing ? 'Entry updated.' : `Saved ${money(saved.amount)} for ${saved.customer_name}.`, 'success');
      bump();
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setErrors({ form: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit entry — ${entry.customer_name || ''}` : 'Add collection'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save entry'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="form-grid">
        {errors.form && <div className="form-error">{errors.form}</div>}
        {!editing && (
          <Field label="Customer" required error={errors.customer}>
            <CustomerPicker customers={customers} value={customerId} onChange={setCustomerId} onPicked={() => amountRef.current?.focus()} autoFocus={!customerId} />
          </Field>
        )}
        <div className="form-row">
          <Field label="Date" required error={errors.date}>
            <input type="date" className="input" value={date} max="9999-12-31" onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amount" required error={errors.amount}>
            <input
              ref={amountRef}
              className="input amount-input"
              inputMode="decimal"
              value={amount}
              autoFocus={editing || !!customerId}
              placeholder="0.00"
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Note" hint="Optional — e.g. cash, UPI, partial">
          <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
      {editing && <p className="muted small">Changes are recorded in the audit log with the old and new values.</p>}
    </Modal>
  );
}
