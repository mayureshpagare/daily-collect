import React, { useEffect, useState } from 'react';
import { useApp } from '../context';
import { api } from '../lib/api';
import { useLoad } from '../lib/hooks';
import { makeMoney, fmtDateTime, fmtBytes } from '../lib/format';
import { PLACEHOLDERS, buildReminder } from '../lib/reminder';
import { SHORTCUTS } from '../nav';
import { Field, Kbd } from '../components/ui';
import Icon from '../components/Icon';

const LOCALES = [
  ['en-IN', 'India (1,23,456.78)'],
  ['en-US', 'US (123,456.78)'],
  ['en-GB', 'UK (123,456.78)'],
  ['de-DE', 'Germany (123.456,78)'],
  ['fr-FR', 'France (123 456,78)'],
  ['es-ES', 'Spain (123.456,78)'],
  ['pt-BR', 'Brazil (123.456,78)'],
  ['ar-AE', 'UAE'],
  ['ja-JP', 'Japan'],
];

export default function Settings() {
  return (
    <div className="page settings">
      <GeneralSettings />
      <ReminderSettings />
      <SecuritySettings />
      <BackupSettings />
      <DataSettings />
      <section className="card">
        <h3>Keyboard shortcuts</h3>
        <table className="table compact">
          <tbody>
            {SHORTCUTS.map(([k, d]) => (
              <tr key={k}>
                <td className="nowrap" style={{ width: 220 }}>
                  <Kbd>{k}</Kbd>
                </td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <About />
    </div>
  );
}

function GeneralSettings() {
  const { settings, setSettings, toast } = useApp();
  const [form, setForm] = useState({
    business_name: settings.business_name,
    currency_symbol: settings.currency_symbol,
    locale: settings.locale,
    theme: settings.theme,
  });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const preview = makeMoney(form);

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      setSettings(await api.settings.set(form));
      toast('Settings saved.', 'success');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="card">
      <h3>General</h3>
      <form className="form-grid" onSubmit={save}>
        {error && <div className="form-error">{error}</div>}
        <div className="form-row">
          <Field label="Business name" hint="Shown on reports and reminders">
            <input className="input" value={form.business_name} onChange={set('business_name')} maxLength={100} />
          </Field>
          <Field label="Theme">
            <select className="input" value={form.theme} onChange={set('theme')}>
              <option value="system">Follow system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Currency symbol" hint="e.g. ₹  $  €  £  Rs  KSh">
            <input className="input" value={form.currency_symbol} onChange={set('currency_symbol')} maxLength={5} />
          </Field>
          <Field label="Number format">
            <select className="input" value={form.locale} onChange={set('locale')}>
              {LOCALES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
              {!LOCALES.some(([v]) => v === form.locale) && <option value={form.locale}>{form.locale}</option>}
            </select>
          </Field>
        </div>
        <div className="row between">
          <span className="muted">
            Preview: <strong className="big-num">{preview(1234567.5)}</strong>
          </span>
          <button className="btn primary">Save</button>
        </div>
      </form>
    </section>
  );
}

function ReminderSettings() {
  const { settings, setSettings, toast, money, today } = useApp();
  const [template, setTemplate] = useState(settings.reminder_template);
  const sample = { name: 'Ramesh', daysWithout: 3, last_date: today, last_amount: 250, daily_target: 200 };
  const save = async () => {
    try {
      setSettings(await api.settings.set({ reminder_template: template }));
      toast('Reminder template saved.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <section className="card">
      <h3>Reminders</h3>
      <Field label="Reminder message (WhatsApp / SMS)">
        <textarea className="input" rows={3} value={template} maxLength={1000} onChange={(e) => setTemplate(e.target.value)} />
      </Field>
      <div className="placeholders">
        {PLACEHOLDERS.map(([p, d]) => (
          <button key={p} className="chip" title={d} onClick={() => setTemplate((t) => `${t}${t.endsWith(' ') ? '' : ' '}${p}`)}>
            {p}
          </button>
        ))}
      </div>
      <div className="preview-box">
        <div className="muted small">Preview</div>
        {buildReminder(template, sample, { money, settings, today })}
      </div>
      <div className="row end">
        <button className="btn primary" onClick={save}>
          Save template
        </button>
      </div>
    </section>
  );
}

function SecuritySettings() {
  const { settings, reloadSettings, toast } = useApp();
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState(null);
  const digits = (fn) => (e) => fn(e.target.value.replace(/\D/g, '').slice(0, 8));

  const savePin = async (e) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{4,8}$/.test(pin)) return setError('PIN must be 4 to 8 digits.');
    if (pin !== pin2) return setError('The two PINs do not match.');
    try {
      await api.auth.setPin(current, pin);
      await reloadSettings();
      setCurrent('');
      setPin('');
      setPin2('');
      toast(settings.hasPin ? 'PIN changed.' : 'PIN lock is on. You will be asked for it when the app starts.', 'success');
    } catch (err) {
      setError(err.message);
    }
  };

  const removePin = async () => {
    setError(null);
    try {
      await api.auth.removePin(current);
      await reloadSettings();
      setCurrent('');
      toast('PIN lock turned off.', 'success');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="card">
      <h3>Security — PIN lock</h3>
      <p className="muted">
        {settings.hasPin ? 'PIN lock is ON. The app asks for the PIN on start and when you press Ctrl+L.' : 'Optional: require a 4–8 digit PIN when the app starts.'}
      </p>
      <form className="form-grid" onSubmit={savePin}>
        {error && <div className="form-error">{error}</div>}
        <div className="form-row three">
          {settings.hasPin && (
            <Field label="Current PIN">
              <input className="input" type="password" inputMode="numeric" value={current} onChange={digits(setCurrent)} autoComplete="off" />
            </Field>
          )}
          <Field label={settings.hasPin ? 'New PIN' : 'PIN'}>
            <input className="input" type="password" inputMode="numeric" value={pin} onChange={digits(setPin)} autoComplete="off" />
          </Field>
          <Field label="Repeat PIN">
            <input className="input" type="password" inputMode="numeric" value={pin2} onChange={digits(setPin2)} autoComplete="off" />
          </Field>
        </div>
        <div className="row gap end">
          {settings.hasPin && (
            <button type="button" className="btn danger-outline" onClick={removePin}>
              Turn off PIN
            </button>
          )}
          <button className="btn primary">{settings.hasPin ? 'Change PIN' : 'Turn on PIN lock'}</button>
        </div>
      </form>
      <p className="muted small">If you forget the PIN, restore a backup made before the PIN was set — there is no reset without it.</p>
    </section>
  );
}

function BackupSettings() {
  const { settings, setSettings, reloadSettings, toast, confirm, dataVersion } = useApp();
  const [keep, setKeep] = useState(settings.backup_keep);
  const [busy, setBusy] = useState(false);
  const backups = useLoad(() => api.backup.list(), [settings.backup_folder, dataVersion]);

  useEffect(() => setKeep(settings.backup_keep), [settings.backup_keep]);

  const update = async (partial) => {
    try {
      setSettings(await api.settings.set(partial));
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const choose = async () => {
    try {
      const res = await api.backup.chooseFolder();
      if (!res.canceled) {
        await reloadSettings();
        toast(`Backup folder set to ${res.folder}`, 'success');
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const backupNow = async () => {
    setBusy(true);
    try {
      const res = await api.backup.now();
      toast(`Backup saved: ${res.path}`, 'success', { label: 'Show', onClick: () => api.app.showItem(res.path) });
      backups.reload();
      reloadSettings();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async (fn, label) => {
    const ok = await confirm({
      title: 'Restore from backup?',
      message: `All current data will be replaced with the backup ${label}. A safety copy of your current data is saved first, so this can be undone.`,
      confirmText: 'Restore',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fn();
      if (res?.canceled) return;
      toast(`Restored ${res.customers} customers and ${res.collections} entries. Reloading…`, 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const restoreFromFile = async () => {
    // Pick the file first, confirm after (the main process validates it before replacing anything).
    const ok = await confirm({
      title: 'Restore from a file?',
      message: 'You will pick a DailyCollect backup file (.db). All current data will be replaced; a safety copy is saved first.',
      confirmText: 'Choose file…',
    });
    if (!ok) return;
    try {
      const res = await api.backup.restoreFromFile();
      if (res?.canceled) return;
      toast(`Restored ${res.customers} customers and ${res.collections} entries. Reloading…`, 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <section className="card">
      <h3>Backup & restore</h3>
      <div className="form-grid">
        <Field label="Backup folder" hint="Choose a USB drive or a synced folder (Google Drive, OneDrive, Dropbox) for off-computer safety.">
          <div className="row gap-sm">
            <input className="input grow" readOnly value={settings.backup_folder || 'Not set'} />
            <button className="btn" onClick={choose}>
              <Icon name="folder" size={16} /> Choose…
            </button>
          </div>
        </Field>
        <div className="row gap wrap">
          <label className="check">
            <input type="checkbox" checked={settings.backup_enabled} disabled={!settings.backup_folder} onChange={(e) => update({ backup_enabled: e.target.checked })} />
            Automatic daily backup
          </label>
          <label className="row gap-sm">
            <span className="muted">Keep last</span>
            <input type="number" className="input sm" style={{ width: 70 }} min={1} max={365} value={keep} onChange={(e) => setKeep(e.target.value)} onBlur={() => Number(keep) !== settings.backup_keep && update({ backup_keep: Number(keep) })} />
            <span className="muted">automatic backups</span>
          </label>
          <div className="grow" />
          <button className="btn primary" onClick={backupNow} disabled={busy || !settings.backup_folder}>
            <Icon name="save" size={16} /> {busy ? 'Backing up…' : 'Back up now'}
          </button>
        </div>
        <p className="muted small">
          {settings.last_backup_at ? `Last backup: ${fmtDateTime(settings.last_backup_at)} — ${settings.last_backup_file}` : 'No backup made yet.'} Automatic backups run once a day while the app is open.
        </p>
      </div>
      <div className="card-head">
        <h4>Backups in folder</h4>
        <button className="btn sm" onClick={restoreFromFile}>
          <Icon name="upload" size={15} /> Restore from file…
        </button>
      </div>
      {(backups.data || []).length === 0 ? (
        <p className="muted">No backups found{settings.backup_folder ? ' in this folder' : ''}.</p>
      ) : (
        <table className="table compact">
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Date</th>
              <th className="num">Size</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {backups.data.slice(0, 30).map((b) => (
              <tr key={b.path}>
                <td className="mono small">{b.file}</td>
                <td>
                  <span className="pill">{b.kind}</span>
                </td>
                <td className="nowrap">{fmtDateTime(b.modified)}</td>
                <td className="num">{fmtBytes(b.size)}</td>
                <td className="actions">
                  <button className="btn sm" onClick={() => doRestore(() => api.backup.restore(b.path), `"${b.file}"`)}>
                    Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DataSettings() {
  const { toast, bump } = useApp();
  const run = async (fn, okMsg) => {
    try {
      const res = await fn();
      if (res?.canceled) return;
      toast(okMsg(res), 'success', res?.path ? { label: 'Show', onClick: () => api.app.showItem(res.path) } : null);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <section className="card">
      <h3>Export & import</h3>
      <div className="row gap wrap">
        <button className="btn" onClick={() => run(() => api.exports.all('xlsx'), (r) => `Excel file saved: ${r.path}`)}>
          <Icon name="download" size={16} /> Export everything to Excel
        </button>
        <button className="btn" onClick={() => run(() => api.exports.all('csv'), (r) => `CSV files saved in ${r.path}`)}>
          <Icon name="download" size={16} /> Export everything to CSV
        </button>
        <button className="btn" onClick={() => run(() => api.exports.all('pdf'), (r) => `PDF report saved: ${r.path}`)}>
          <Icon name="file" size={16} /> Full report PDF
        </button>
      </div>
      <div className="row gap wrap" style={{ marginTop: 12 }}>
        <button
          className="btn"
          onClick={() =>
            run(
              async () => {
                const r = await api.exports.importCustomers();
                if (!r.canceled) bump();
                return r;
              },
              (r) => `Imported ${r.imported} customers${r.skipped.length ? `; ${r.skipped.length} rows skipped (${r.skipped.slice(0, 3).map((s) => `line ${s.line}: ${s.reason}`).join('; ')})` : ''}.`
            )
          }
        >
          <Icon name="upload" size={16} /> Import customers from CSV
        </button>
        <button className="btn ghost" onClick={() => run(() => api.exports.importTemplate(), (r) => `Template saved: ${r.path}`)}>
          Download CSV template
        </button>
      </div>
      <p className="muted small">CSV columns: name (required), phone, address, notes, start_date (YYYY-MM-DD), daily_target. Rows with errors or duplicate phones are skipped and reported.</p>
    </section>
  );
}

function About() {
  const { data } = useLoad(() => api.app.info(), []);
  return (
    <section className="card">
      <h3>About</h3>
      {data && (
        <div className="muted small">
          DailyCollect {data.version} · Electron {data.electron}
          <br />
          Database: <span className="mono">{data.dbPath}</span>{' '}
          <button className="btn sm ghost" onClick={() => api.app.openDataFolder()}>
            Open data folder
          </button>
        </div>
      )}
    </section>
  );
}
