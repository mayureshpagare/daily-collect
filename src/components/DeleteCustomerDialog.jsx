import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import Icon from './Icon';
import { Loading } from './ui';
import { api } from '../lib/api';
import { useApp } from '../context';

/**
 * Permanent delete with cascade. Shows how many entries / how much money will be removed,
 * offers an export first, and requires typing the customer's exact name.
 */
export default function DeleteCustomerDialog({ customerId, onClose, onDeleted }) {
  const { money, toast, bump } = useApp();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(null);

  useEffect(() => {
    api.customers.deletePreview(customerId).then(setPreview, (e) => setError(e.message));
  }, [customerId]);

  const matches = preview && typed.trim() === preview.name.trim();

  const exportFirst = async (format) => {
    try {
      const res = await api.exports.customerHistory(customerId, format);
      if (res?.canceled) return;
      setExported(res.path);
      toast(`History exported to ${res.path}`, 'success', { label: 'Show', onClick: () => api.app.showItem(res.path) });
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const doDelete = async () => {
    if (!matches) return;
    setBusy(true);
    try {
      const res = await api.customers.delete(customerId, typed);
      toast(`Deleted "${res.name}" and ${res.deletedEntries} entr${res.deletedEntries === 1 ? 'y' : 'ies'} (${money(res.deletedTotal)}).`, 'success');
      bump();
      onDeleted?.(res);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Delete customer permanently"
      onClose={onClose}
      width={540}
      className="danger-modal"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn danger" disabled={!matches || busy} onClick={doDelete}>
            <Icon name="trash" size={16} /> {busy ? 'Deleting…' : 'Delete customer and all entries'}
          </button>
        </>
      }
    >
      {error && <div className="form-error">{error}</div>}
      {!preview && !error && <Loading />}
      {preview && (
        <>
          <div className="danger-summary">
            <Icon name="alert" size={22} />
            <div>
              This will permanently delete <strong>{preview.name}</strong>
              {preview.phone ? ` (${preview.phone})` : ''} and <strong>all {preview.entryCount} collection entr{preview.entryCount === 1 ? 'y' : 'ies'}</strong> totalling{' '}
              <strong>{money(preview.total)}</strong>. This cannot be undone.
            </div>
          </div>
          <div className="delete-stats">
            <div>
              <div className="stat-label">Entries to remove</div>
              <div className="stat-value">{preview.entryCount}</div>
            </div>
            <div>
              <div className="stat-label">Amount to remove</div>
              <div className="stat-value">{money(preview.total)}</div>
            </div>
          </div>
          <div className="export-first">
            <span>Keep a copy first:</span>
            <button className="btn sm" onClick={() => exportFirst('csv')} disabled={preview.entryCount === 0}>
              <Icon name="download" size={15} /> Export history to CSV
            </button>
            <button className="btn sm" onClick={() => exportFirst('pdf')}>
              <Icon name="file" size={15} /> Export history to PDF
            </button>
          </div>
          {exported && <p className="ok small">Exported: {exported}</p>}
          <label className="field">
            <span className="field-label">
              Type <strong className="mono">{preview.name}</strong> to confirm
            </span>
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doDelete()}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </>
      )}
    </Modal>
  );
}
