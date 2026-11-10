import React, { useState } from 'react';
import Icon from './Icon';
import EntryModal from './EntryModal';
import { api } from '../lib/api';
import { useApp } from '../context';
import { fmtDate } from '../lib/format';

/** Edit / delete buttons for a single collection entry. */
export default function EntryActions({ entry, customerName }) {
  const { confirm, toast, bump, money } = useApp();
  const [editing, setEditing] = useState(false);
  const row = { ...entry, customer_name: entry.customer_name || customerName };

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this entry?',
      message: `${money(row.amount)} from ${row.customer_name || 'this customer'} on ${fmtDate(row.date)} will be deleted. The deletion is recorded in the audit log.`,
      confirmText: 'Delete entry',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.collections.delete(row.id);
      toast('Entry deleted.', 'success');
      bump();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <span className="row-actions">
      <button className="icon-btn" title="Edit entry" onClick={() => setEditing(true)}>
        <Icon name="edit" size={16} />
      </button>
      <button className="icon-btn danger" title="Delete entry" onClick={remove}>
        <Icon name="trash" size={16} />
      </button>
      {editing && <EntryModal entry={row} onClose={() => setEditing(false)} />}
    </span>
  );
}
