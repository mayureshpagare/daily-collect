'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ipcMain, dialog, BrowserWindow, clipboard, shell, app } = require('electron');
const D = require('./dates');
const { ValidationError } = require('./validation');
const { hashPin, verifyPin, validatePinFormat, createLockGuard } = require('./security');
const { toCsv, parseCsvObjects } = require('./csv');
const reports = require('./reports');
const backup = require('./backup');

const CUSTOMER_COLUMNS = [
  { key: 'name', label: 'name' },
  { key: 'phone', label: 'phone' },
  { key: 'address', label: 'address' },
  { key: 'notes', label: 'notes' },
  { key: 'start_date', label: 'start_date' },
  { key: 'daily_target', label: 'daily_target' },
];
const ENTRY_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'customer_name', label: 'Customer' },
  { key: 'amount', label: 'Amount' },
  { key: 'note', label: 'Note' },
  { key: 'id', label: 'Entry ID' },
  { key: 'created_at', label: 'Created at' },
  { key: 'updated_at', label: 'Updated at' },
];

function friendlyError(err) {
  const code = err && err.code;
  if (code === 'SQLITE_CONSTRAINT_UNIQUE') return 'That value already exists (duplicate phone number?).';
  if (code === 'SQLITE_CONSTRAINT_CHECK') return 'The database rejected an invalid value (empty name, or amount not above zero).';
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return 'The customer for this entry no longer exists.';
  if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') return 'The database is busy. Please try again.';
  if (code === 'SQLITE_READONLY') return 'The database file is read-only. Check folder permissions.';
  if (code === 'SQLITE_FULL') return 'The disk is full. Free some space and try again.';
  if (code === 'EACCES' || code === 'EPERM') return 'Permission denied while accessing the file. Choose another location.';
  if (code === 'EBUSY') return 'The file is open in another program. Close it and try again.';
  return (err && err.message) || 'Something went wrong.';
}

const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60) || 'export';

function registerIpc(state, { reopenDatabase, runAutoBackup }) {
  const guard = createLockGuard();
  const repo = () => state.repo;
  const win = () => state.mainWindow || BrowserWindow.getFocusedWindow();

  /** Every handler returns {ok, data} or {ok:false, error, code}; only auth handlers work while locked. */
  const handle = (channel, fn, { whileLocked = false } = {}) => {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        if (!whileLocked && !state.unlocked) return { ok: false, code: 'LOCKED', error: 'DailyCollect is locked. Enter your PIN.' };
        return { ok: true, data: await fn(...args) };
      } catch (err) {
        if (err.code !== 'VALIDATION' && err.code !== 'NOT_FOUND') console.error(`[ipc:${channel}]`, err);
        return { ok: false, code: err.code || 'ERROR', error: friendlyError(err), details: err.details };
      }
    });
  };

  async function saveFile({ title, defaultName, filters, data }) {
    const res = await dialog.showSaveDialog(win(), { title, defaultPath: path.join(app.getPath('documents'), defaultName), filters });
    if (res.canceled || !res.filePath) return { canceled: true };
    fs.writeFileSync(res.filePath, data);
    return { path: res.filePath };
  }

  async function htmlToPdf(html, { landscape = false } = {}) {
    const tmp = path.join(os.tmpdir(), `dailycollect-report-${process.pid}-${Date.now()}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
      await pdfWin.loadFile(tmp);
      return await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape, margins: { marginType: 'default' } });
    } finally {
      pdfWin.destroy();
      fs.rm(tmp, { force: true }, () => {});
    }
  }

  // ------------------------------------------------------------------ auth
  handle('auth:status', () => ({ hasPin: repo().hasPin(), unlocked: state.unlocked }), { whileLocked: true });
  handle(
    'auth:unlock',
    (pin) => {
      guard.check();
      if (!repo().hasPin() || verifyPin(String(pin ?? ''), repo().getRawSetting('pin_hash'))) {
        guard.reset();
        state.unlocked = true;
        return { unlocked: true };
      }
      const n = guard.fail();
      throw new ValidationError(n >= 5 ? 'Wrong PIN. Too many attempts — please wait before trying again.' : 'Wrong PIN. Please try again.');
    },
    { whileLocked: true }
  );
  handle('auth:lock', () => {
    if (repo().hasPin()) state.unlocked = false;
    return { unlocked: state.unlocked };
  });
  handle('auth:setPin', ({ currentPin, newPin } = {}) => {
    const existing = repo().getRawSetting('pin_hash');
    if (existing && !verifyPin(String(currentPin ?? ''), existing)) throw new ValidationError('Current PIN is incorrect.');
    validatePinFormat(newPin);
    repo().setRawSetting('pin_hash', hashPin(newPin));
    repo().audit(existing ? 'pin.change' : 'pin.set', {});
    return { hasPin: true };
  });
  handle('auth:removePin', ({ currentPin } = {}) => {
    const existing = repo().getRawSetting('pin_hash');
    if (!existing) return { hasPin: false };
    if (!verifyPin(String(currentPin ?? ''), existing)) throw new ValidationError('Current PIN is incorrect.');
    repo().setRawSetting('pin_hash', null);
    repo().audit('pin.remove', {});
    return { hasPin: false };
  });

  // -------------------------------------------------------------- settings
  handle(
    'settings:public',
    () => {
      const s = repo().getSettings();
      return { theme: s.theme, business_name: s.business_name };
    },
    { whileLocked: true }
  );
  handle('settings:get', () => repo().getSettings());
  handle('settings:set', (partial) => repo().setSettings(partial));

  // ------------------------------------------------------------- customers
  handle('customers:list', (opts) => repo().listCustomers(opts));
  handle('customers:get', (id) => repo().getCustomer(id));
  handle('customers:create', (data) => repo().createCustomer(data));
  handle('customers:update', (id, data) => repo().updateCustomer(id, data));
  handle('customers:setActive', (id, active) => repo().setCustomerActive(id, active));
  handle('customers:deletePreview', (id) => repo().deleteCustomerPreview(id));
  handle('customers:delete', (id, confirmName) => repo().deleteCustomer(id, confirmName));

  // ----------------------------------------------------------- collections
  handle('collections:add', (data) => repo().addCollection(data));
  handle('collections:addBulk', (data) => repo().addCollectionsBulk(data));
  handle('collections:update', (id, data) => repo().updateCollection(id, data));
  handle('collections:delete', (id) => repo().deleteCollection(id));
  handle('collections:forDate', (date) => repo().entriesForDate(date));
  handle('collections:list', (filter) => repo().listEntries(filter));
  handle('ledger:get', (id, range) => repo().getLedger(id, range));
  handle('history:byDate', (range) => repo().historyByDate(range));

  // --------------------------------------------------------------- reports
  handle('dashboard:get', () => repo().getDashboard(D.today()));
  handle('missed:get', () => repo().getMissed(D.today()));
  handle('insights:customer', (id) => repo().getCustomerInsights(id, D.today()));
  handle('heatmap:customer', (id, range) => repo().getHeatmap(id, range));
  handle('closing:get', (date) => repo().getDayClosing(date));
  handle('closing:save', (data) => repo().saveDayClosing(data));
  handle('closing:list', (limit) => repo().listDayClosings(limit));
  handle('audit:list', (opts) => repo().listAudit(opts));

  // ----------------------------------------------------------------- utils
  handle('clipboard:write', (text) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });
  handle('reminder:whatsapp', (phone, text) => {
    const digits = String(phone || '').replace(/[^\d]/g, '');
    if (!digits) throw new ValidationError('This customer has no phone number.');
    shell.openExternal(`https://wa.me/${digits}?text=${encodeURIComponent(String(text || ''))}`);
    return true;
  });
  handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    dbPath: state.dbPath,
    userData: app.getPath('userData'),
  }));
  handle('app:showItem', (p) => {
    if (p && fs.existsSync(p)) shell.showItemInFolder(p);
    return true;
  });
  handle('app:openDataFolder', () => shell.openPath(app.getPath('userData')));

  // ---------------------------------------------------------------- export
  handle('export:customerHistory', async (id, format) => {
    const customer = repo().getCustomer(id);
    const ledger = repo().getLedger(id, {});
    const base = `DailyCollect-${safeName(customer.name)}-history-${D.today()}`;
    if (format === 'pdf') {
      const pdf = await htmlToPdf(reports.customerHistoryHtml({ customer, ledger }, repo().getSettings()));
      return saveFile({ title: 'Export customer history (PDF)', defaultName: `${base}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }], data: pdf });
    }
    const csv = toCsv(ledger.rows, [
      { key: 'date', label: 'Date' },
      { key: 'amount', label: 'Amount' },
      { key: 'note', label: 'Note' },
      { key: 'running_total', label: 'Running total' },
      { key: 'id', label: 'Entry ID' },
      { key: 'created_at', label: 'Created at' },
      { key: 'updated_at', label: 'Updated at' },
    ]);
    return saveFile({ title: 'Export customer history (CSV)', defaultName: `${base}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }], data: csv });
  });

  handle('export:entries', async (filter = {}, format = 'csv') => {
    const rows = repo().listEntries({ ...filter, limit: 50000 });
    const label = filter.from || filter.to ? `${filter.from || 'start'}_to_${filter.to || D.today()}` : 'all';
    const base = `DailyCollect-entries-${label}`;
    if (format === 'pdf') {
      const title = `Collections ${filter.from || filter.to ? `${filter.from || '…'} to ${filter.to || '…'}` : '(all dates)'}`;
      const pdf = await htmlToPdf(reports.entriesHtml({ title, rows }, repo().getSettings()));
      return saveFile({ title: 'Export entries (PDF)', defaultName: `${base}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }], data: pdf });
    }
    return saveFile({ title: 'Export entries (CSV)', defaultName: `${base}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }], data: toCsv(rows, ENTRY_COLUMNS) });
  });

  handle('export:dayClosing', async ({ date, counted, note } = {}) => {
    const data = repo().getDayClosing(date);
    const c = counted === '' || counted == null ? data.closing?.counted ?? null : Number(counted);
    const html = reports.dayClosingHtml({ ...data, counted: Number.isFinite(c) ? c : null, note: note ?? data.closing?.note }, repo().getSettings());
    const pdf = await htmlToPdf(html);
    return saveFile({ title: 'Export day closing report', defaultName: `DailyCollect-day-closing-${data.date}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }], data: pdf });
  });

  handle('export:all', async (format) => {
    const data = repo().exportAll();
    const settings = repo().getSettings();
    const stamp = D.today();
    if (format === 'xlsx') {
      const buf = await reports.buildWorkbook(data, settings);
      return saveFile({ title: 'Export everything (Excel)', defaultName: `DailyCollect-export-${stamp}.xlsx`, filters: [{ name: 'Excel', extensions: ['xlsx'] }], data: buf });
    }
    if (format === 'pdf') {
      const pdf = await htmlToPdf(reports.fullReportHtml(data, settings));
      return saveFile({ title: 'Export full report (PDF)', defaultName: `DailyCollect-report-${stamp}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }], data: pdf });
    }
    // CSV: one file per table inside a new folder.
    const res = await dialog.showOpenDialog(win(), { title: 'Choose a folder for the CSV export', properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    const dir = path.join(res.filePaths[0], `DailyCollect-export-${D.timestamp()}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'customers.csv'),
      toCsv(data.customers, [{ key: 'id', label: 'id' }, ...CUSTOMER_COLUMNS, { key: 'active', label: 'active' }, { key: 'entry_count', label: 'entries' }, { key: 'total', label: 'total' }, { key: 'last_date', label: 'last_paid' }, { key: 'created_at', label: 'created_at' }])
    );
    fs.writeFileSync(path.join(dir, 'collections.csv'), toCsv(data.collections, [{ key: 'id', label: 'id' }, { key: 'date', label: 'date' }, { key: 'customer_id', label: 'customer_id' }, { key: 'customer_name', label: 'customer' }, { key: 'amount', label: 'amount' }, { key: 'note', label: 'note' }, { key: 'created_at', label: 'created_at' }, { key: 'updated_at', label: 'updated_at' }]));
    fs.writeFileSync(path.join(dir, 'daily_totals.csv'), toCsv(data.dailyTotals, [{ key: 'date', label: 'date' }, { key: 'customers', label: 'customers' }, { key: 'entries', label: 'entries' }, { key: 'total', label: 'total' }]));
    fs.writeFileSync(path.join(dir, 'day_closings.csv'), toCsv(data.closings, ['date', 'expected', 'counted', 'difference', 'note', 'closed_at'].map((k) => ({ key: k, label: k }))));
    fs.writeFileSync(path.join(dir, 'audit_log.csv'), toCsv(data.audit, ['id', 'timestamp', 'action', 'details'].map((k) => ({ key: k, label: k }))));
    return { path: dir };
  });

  handle('import:template', () =>
    saveFile({
      title: 'Save customer import template',
      defaultName: 'DailyCollect-customers-template.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      data: toCsv([{ name: 'Ramesh Kumar', phone: '9876543210', address: 'Shop 4, Market Road', notes: 'Pays mornings', start_date: D.today(), daily_target: 200 }], CUSTOMER_COLUMNS),
    })
  );

  handle('import:customersCsv', async () => {
    const res = await dialog.showOpenDialog(win(), { title: 'Import customers from CSV', properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }] });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    const file = res.filePaths[0];
    if (fs.statSync(file).size > 10 * 1024 * 1024) throw new ValidationError('CSV file is too large (max 10 MB).');
    const rows = parseCsvObjects(fs.readFileSync(file, 'utf8'));
    if (rows.length && !Object.keys(rows[0]).some((h) => ['name', 'customer name', 'customer'].includes(h.toLowerCase()))) {
      throw new ValidationError('The CSV must have a header row with a "name" column. Download the template to see the format.');
    }
    return repo().importCustomers(rows);
  });

  // ---------------------------------------------------------------- backup
  handle('backup:chooseFolder', async () => {
    const res = await dialog.showOpenDialog(win(), { title: 'Choose backup folder', properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    repo().setSettings({ backup_folder: res.filePaths[0] });
    return { folder: res.filePaths[0] };
  });
  handle('backup:now', async () => {
    const folder = repo().getSettings().backup_folder;
    const file = await backup.backupTo(state.db, folder, 'backup');
    repo().setRawSetting('last_backup_at', new Date().toISOString());
    repo().setRawSetting('last_backup_file', file);
    repo().audit('backup.create', { file, kind: 'manual' });
    return { path: file };
  });
  handle('backup:runAuto', () => runAutoBackup(true));
  handle('backup:list', () => backup.listBackups(repo().getSettings().backup_folder));

  async function restoreFrom(file) {
    const counts = backup.validateBackupFile(file);
    const safety = await backup.backupTo(state.db, path.join(app.getPath('userData'), 'safety-backups'), 'pre-restore');
    await reopenDatabase(file);
    repo().audit('backup.restore', { file, safety_copy: safety, ...counts });
    return { restored: file, safetyCopy: safety, ...counts };
  }
  handle('backup:restore', (file) => {
    const folder = repo().getSettings().backup_folder;
    const allowed = backup.listBackups(folder).some((b) => b.path === file);
    if (!allowed) throw new ValidationError('That backup is not in the backup folder.');
    return restoreFrom(file);
  });
  handle('backup:restoreFromFile', async () => {
    const res = await dialog.showOpenDialog(win(), { title: 'Restore from backup file', properties: ['openFile'], filters: [{ name: 'DailyCollect backup', extensions: ['db', 'sqlite', 'sqlite3'] }] });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    return restoreFrom(res.filePaths[0]);
  });
}

module.exports = { registerIpc, friendlyError };
