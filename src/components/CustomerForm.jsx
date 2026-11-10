import React, { useState } from 'react';
import Modal from './Modal';
import { Field } from './ui';
import { api } from '../lib/api';
import { useApp } from '../context';

export default function CustomerForm({ customer, onClose, onSaved }) {
  const { toast, bump, today } = useApp();
  const editing = !!customer;
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    address: customer?.address ?? '',
    notes: customer?.notes ?? '',
    start_date: customer?.start_date ?? (editing ? '' : today),
    daily_target: customer?.daily_target ?? '',
    active: customer ? !!customer.active : true,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required.';
    if (form.phone.trim() && !/^\+?\d{6,15}$/.test(form.phone.replace(/[\s\-().]/g, ''))) errs.phone = 'Use 6–15 digits (optional leading +).';
    if (String(form.daily_target).trim()) {
      const n = Number(String(form.daily_target).replace(/,/g, ''));
      if (!Number.isFinite(n)) errs.daily_target = 'Must be a number.';
      else if (n < 0) errs.daily_target = 'Cannot be negative.';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = { ...form, daily_target: String(form.daily_target).replace(/,/g, '') };
      const saved = editing ? await api.customers.update(customer.id, payload) : await api.customers.create(payload);
      toast(editing ? 'Customer updated.' : `Customer "${saved.name}" added.`, 'success');
      bump();
      onSaved?.(saved);
      onClose();
    } catch (err) {
      if (/phone/i.test(err.message)) setErrors({ phone: err.message });
      else setErrors({ form: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit customer — ${customer.name}` : 'Add customer'}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add customer'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="form-grid">
        {errors.form && <div className="form-error">{errors.form}</div>}
        <Field label="Name" required error={errors.name}>
          <input className="input" value={form.name} onChange={set('name')} maxLength={100} autoFocus />
        </Field>
        <div className="form-row">
          <Field label="Phone" error={errors.phone} hint="Must be unique">
            <input className="input" value={form.phone} onChange={set('phone')} inputMode="tel" maxLength={20} />
          </Field>
          <Field label="Daily target" error={errors.daily_target} hint="Optional expected amount per day">
            <input className="input" value={form.daily_target} onChange={set('daily_target')} inputMode="decimal" placeholder="0.00" />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Start date" hint="Used for missed-day tracking">
            <input type="date" className="input" value={form.start_date || ''} onChange={set('start_date')} />
          </Field>
          <Field label="Status">
            <label className="check">
              <input type="checkbox" checked={form.active} onChange={set('active')} /> Active (shown in bulk entry & reminders)
            </label>
          </Field>
        </div>
        <Field label="Address">
          <input className="input" value={form.address} onChange={set('address')} maxLength={300} />
        </Field>
        <Field label="Notes">
          <textarea className="input" rows={3} value={form.notes} onChange={set('notes')} maxLength={1000} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
