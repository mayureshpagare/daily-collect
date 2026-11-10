import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { api } from '../lib/api';
import { useApp } from '../context';
import { NAV } from '../nav';
import { fmtDate } from '../lib/format';

/** Ctrl+K command palette: customers first, then pages. */
export default function QuickSearch({ onClose, onAddPayment }) {
  const { navigate, money } = useApp();
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState([]);
  const [hi, setHi] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    api.customers.list({ includeInactive: true }).then(setCustomers, () => setCustomers([]));
  }, []);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const cust = customers
      .filter((c) => !s || c.name.toLowerCase().includes(s) || (c.phone || '').includes(s))
      .sort((a, b) => {
        // Names that start with the query rank first.
        const as = a.name.toLowerCase().startsWith(s) ? 0 : 1;
        const bs = b.name.toLowerCase().startsWith(s) ? 0 : 1;
        return as - bs || a.name.localeCompare(b.name);
      })
      .slice(0, s ? 30 : 8)
      .map((c) => ({ type: 'customer', id: `c${c.id}`, c }));
    const pages = NAV.filter((n) => !s || n.label.toLowerCase().includes(s)).map((n) => ({ type: 'page', id: `p${n.id}`, n }));
    return [...cust, ...pages];
  }, [q, customers]);

  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  const run = (item, alt) => {
    if (!item) return;
    onClose();
    if (item.type === 'page') navigate(item.n.id);
    else if (alt) onAddPayment(item.c.id);
    else navigate('customer', { id: item.c.id });
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(items[hi], e.ctrlKey || e.metaKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return createPortal(
    <div className="modal-backdrop top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Quick search">
        <div className="palette-input">
          <Icon name="search" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown} placeholder="Search customers by name or phone, or type a page name…" />
        </div>
        <ul className="palette-list" ref={listRef}>
          {items.length === 0 && <li className="palette-empty">Nothing found for “{q}”.</li>}
          {items.map((it, i) => (
            <li
              key={it.id}
              data-idx={i}
              className={`palette-item ${i === hi ? 'hi' : ''}`}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                run(it, e.ctrlKey || e.metaKey);
              }}
            >
              {it.type === 'customer' ? (
                <>
                  <Icon name="users" size={16} />
                  <span className="grow">
                    {it.c.name} {!it.c.active && <span className="badge">inactive</span>}
                    <span className="muted small"> {it.c.phone || ''}</span>
                  </span>
                  <span className="muted small">
                    {money(it.c.total)} · last {it.c.last_date ? fmtDate(it.c.last_date, { day: '2-digit', month: 'short' }) : 'never'}
                  </span>
                </>
              ) : (
                <>
                  <Icon name={it.n.icon} size={16} />
                  <span className="grow">{it.n.label}</span>
                  <span className="muted small">page</span>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="palette-foot muted small">
          <span>↑↓ move</span>
          <span>Enter open</span>
          <span>Ctrl+Enter add payment</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
