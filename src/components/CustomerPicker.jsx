import React, { useEffect, useMemo, useRef, useState } from 'react';

/** Type-to-search customer combobox with full keyboard support (↑ ↓ Enter Esc). */
export default function CustomerPicker({ customers, value, onChange, onPicked, autoFocus, inputRef, placeholder = 'Type a name or phone…', disabled }) {
  const selected = customers.find((c) => c.id === value) || null;
  const [query, setQuery] = useState(selected?.name || '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    setQuery(selected ? selected.name : '');
  }, [value, selected?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const isSelectedName = selected && selected.name.toLowerCase() === q;
    const list = q && !isSelectedName ? customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)) : customers;
    return list.slice(0, 60);
  }, [customers, query, selected]);

  useEffect(() => {
    const el = listRef.current?.children[hi];
    el?.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  const pick = (c) => {
    onChange(c.id);
    setQuery(c.name);
    setOpen(false);
    onPicked?.(c);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && matches[hi]) {
        e.preventDefault();
        pick(matches[hi]);
      } else if (!selected && matches.length === 1) {
        e.preventDefault();
        pick(matches[0]);
      }
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="picker">
      <input
        ref={inputRef}
        className="input"
        value={query}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHi(0);
          if (value) onChange(null);
        }}
        onFocus={(e) => {
          e.target.select();
          setOpen(true);
        }}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            setQuery((q) => (selected ? selected.name : q));
          }, 150)
        }
        onKeyDown={onKeyDown}
      />
      {open && !disabled && (
        <ul className="picker-list" ref={listRef} role="listbox">
          {matches.length === 0 && <li className="picker-empty">No matching customer</li>}
          {matches.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === hi}
              className={`picker-item ${i === hi ? 'hi' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onMouseEnter={() => setHi(i)}
            >
              <span>{c.name}</span>
              <span className="muted small">{c.phone || ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
