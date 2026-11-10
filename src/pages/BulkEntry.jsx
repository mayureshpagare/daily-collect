import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { useLoad, useKey, isMod } from '../lib/hooks';
import { amountError, toNumber, fmtDate } from '../lib/format';
import { addDays } from '../lib/dates';
import { Loading, ErrorBox, Empty } from '../components/ui';
import Icon from '../components/Icon';

/**
 * Fast entry: every active customer with an amount box.
 * Enter → next customer, Shift+Enter → previous, Ctrl+S → Save All.
 */
export default function BulkEntry() {
  const { money, today, toast, bump, dataVersion, setNavGuard, navigate } = useApp();
  const [date, setDate] = useState(today);
  const [values, setValues] = useState({}); // id -> { amount, note }
  const [errors, setErrors] = useState({});
  const [filter, setFilter] = useState('');
  const [hidePaid, setHidePaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const refs = useRef({});
  const saveRef = useRef(null);

  const customers = useLoad(() => api.customers.list({ includeInactive: false }), [dataVersion]);
  const existing = useLoad(() => api.collections.forDate(date), [date, dataVersion]);

  const paidMap = useMemo(() => {
    const m = {};
    for (const e of existing.data || []) m[e.customer_id] = (m[e.customer_id] || 0) + e.amount;
    return m;
  }, [existing.data]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (customers.data || []).filter((c) => (!q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)) && (!hidePaid || !paidMap[c.id] || values[c.id]?.amount));
  }, [customers.data, filter, hidePaid, paidMap, values]);

  const filled = Object.entries(values).filter(([, v]) => String(v.amount ?? '').trim() !== '');
  const enteredTotal = filled.reduce((a, [, v]) => a + (amountError(v.amount) ? 0 : toNumber(v.amount)), 0);
  const dirty = filled.length > 0;

  useEffect(() => {
    setNavGuard(dirty ? () => true : null);
    return () => setNavGuard(null);
  }, [dirty, setNavGuard]);

  const setVal = (id, key, v) => {
    setValues((all) => ({ ...all, [id]: { ...all[id], [key]: v } }));
    if (key === 'amount' && errors[id]) setErrors((e) => ({ ...e, [id]: undefined }));
  };

  const focusRow = (index) => {
    const c = visible[index];
    if (c) {
      refs.current[c.id]?.focus();
      refs.current[c.id]?.select();
    } else if (index >= visible.length) saveRef.current?.focus();
  };

  const onAmountKey = (e, index) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(e.shiftKey && e.key === 'Enter' ? index - 1 : index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusRow(index - 1);
    }
  };

  const saveAll = async () => {
    if (saving) return;
    const errs = {};
    const items = [];
    for (const [id, v] of filled) {
      const err = amountError(v.amount);
      if (err) errs[id] = err;
      else items.push({ customer_id: Number(id), amount: toNumber(v.amount), note: v.note || null });
    }
    setErrors(errs);
    const bad = Object.keys(errs);
    if (bad.length) {
      toast(`${bad.length} amount${bad.length > 1 ? 's are' : ' is'} invalid. Fix the highlighted rows — nothing was saved.`, 'error');
      refs.current[bad[0]]?.focus();
      return;
    }
    if (!items.length) {
      toast('Enter at least one amount before saving.', 'info');
      focusRow(0);
      return;
    }
    setSaving(true);
    try {
      const res = await api.collections.addBulk({ date, items });
      toast(`Saved ${res.count} entr${res.count === 1 ? 'y' : 'ies'} · ${money(res.total)} for ${fmtDate(date)}.`, 'success');
      setValues({});
      setNavGuard(null);
      bump();
    } catch (err) {
      toast(err.message, 'error');
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.customer_id, d.error])));
    } finally {
      setSaving(false);
    }
  };

  useKey((e) => {
    if (isMod(e) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveAll();
    }
  });

  const fillTargets = () => {
    setValues((all) => {
      const next = { ...all };
      for (const c of visible) {
        if (c.daily_target && !String(next[c.id]?.amount ?? '').trim() && !paidMap[c.id]) next[c.id] = { ...next[c.id], amount: String(c.daily_target) };
      }
      return next;
    });
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

  const alreadyTotal = Object.values(paidMap).reduce((a, b) => a + b, 0);

  return (
    <div className="page bulk-page">
      <div className="toolbar">
        <div className="row gap-sm">
          <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} title="Previous day">
            <Icon name="back" size={16} />
          </button>
          <input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} title="Next day">
            <Icon name="chevronRight" size={16} />
          </button>
          {date !== today && (
            <span className="badge warn">
              Not today — saving for {fmtDate(date)}
            </span>
          )}
        </div>
        <input className="input" placeholder="Filter customers…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 240 }} />
        <label className="check">
          <input type="checkbox" checked={hidePaid} onChange={(e) => setHidePaid(e.target.checked)} /> Hide already paid
        </label>
        <button className="btn sm" onClick={fillTargets} title="Put each customer's daily target into empty boxes">
          Fill daily targets
        </button>
        {dirty && (
          <button className="btn sm ghost" onClick={() => setValues({})}>
            Clear
          </button>
        )}
      </div>

      <div className="card no-pad">
        <table className="table bulk-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Customer</th>
              <th className="num">Target</th>
              <th className="num">Already on this date</th>
              <th style={{ width: 170 }}>Amount</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c, i) => {
              const v = values[c.id] || {};
              const err = errors[c.id];
              const paid = paidMap[c.id] || 0;
              return (
                <tr key={c.id} className={`${err ? 'row-error' : ''} ${String(v.amount ?? '').trim() ? 'row-filled' : ''}`}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <div className="strong">{c.name}</div>
                    {c.phone && <div className="muted small">{c.phone}</div>}
                  </td>
                  <td className="num muted">{c.daily_target ? money(c.daily_target) : '—'}</td>
                  <td className="num">{paid ? <span className="ok">{money(paid)}</span> : <span className="muted">—</span>}</td>
                  <td>
                    <input
                      ref={(el) => (refs.current[c.id] = el)}
                      className={`input amount-input ${err ? 'invalid' : ''}`}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={v.amount ?? ''}
                      onChange={(e) => setVal(c.id, 'amount', e.target.value)}
                      onKeyDown={(e) => onAmountKey(e, i)}
                      onFocus={(e) => e.target.select()}
                      aria-label={`Amount for ${c.name}`}
                      title={err || ''}
                      autoFocus={i === 0}
                    />
                    {err && <div className="field-error">{err}</div>}
                  </td>
                  <td>
                    <input
                      className="input sm"
                      value={v.note ?? ''}
                      maxLength={300}
                      tabIndex={-1}
                      placeholder="optional"
                      onChange={(e) => setVal(c.id, 'note', e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), focusRow(i + 1))}
                    />
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="muted center">
                  No customers match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sticky-footer">
        <div>
          <div className="muted small">Already recorded on {fmtDate(date, { day: '2-digit', month: 'short' })}</div>
          <strong>{money(alreadyTotal)}</strong>
        </div>
        <div>
          <div className="muted small">Entered now ({filled.length})</div>
          <strong className="big-num">{money(enteredTotal)}</strong>
        </div>
        <div className="grow" />
        <span className="muted small">Enter = next · Shift+Enter = previous · Ctrl+S = save</span>
        <button ref={saveRef} className="btn primary lg" onClick={saveAll} disabled={saving}>
          <Icon name="save" size={16} /> {saving ? 'Saving…' : `Save all${filled.length ? ` (${filled.length})` : ''}`}
        </button>
      </div>
    </div>
  );
}
