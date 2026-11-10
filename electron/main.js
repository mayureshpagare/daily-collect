'use strict';
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Menu, dialog, shell, nativeTheme } = require('electron');
const { openDatabase } = require('./db');
const { createRepo } = require('./repo');
const { registerIpc } = require('./ipc');
const backup = require('./backup');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = !!DEV_URL;

// Optional: keep data in a custom folder (portable installs, testing).
if (process.env.DAILYCOLLECT_DATA_DIR) app.setPath('userData', path.resolve(process.env.DAILYCOLLECT_DATA_DIR));

const state = {
  db: null,
  repo: null,
  dbPath: null,
  unlocked: false,
  mainWindow: null,
};

function openAt(file) {
  state.db = openDatabase(file);
  state.repo = createRepo(state.db);
}

function initDatabase() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  state.dbPath = path.join(dir, 'dailycollect.db');
  openAt(state.dbPath);
  state.unlocked = !state.repo.hasPin();
}

/** Replaces the live database with a validated backup file, then reopens it. */
async function reopenDatabase(sourceFile) {
  const tmp = `${state.dbPath}.restoring`;
  fs.copyFileSync(sourceFile, tmp);
  state.db.close();
  try {
    for (const ext of ['-journal', '-wal', '-shm']) fs.rmSync(state.dbPath + ext, { force: true });
    fs.renameSync(tmp, state.dbPath);
  } finally {
    // Always reopen, even if the swap failed, so the app keeps working on whatever is on disk.
    openAt(state.dbPath);
    fs.rmSync(tmp, { force: true });
  }
}

async function runAutoBackup(force = false) {
  const s = state.repo.getSettings();
  if (!s.backup_enabled || !s.backup_folder) {
    if (force) throw Object.assign(new Error('Turn on automatic backup and choose a folder first.'), { code: 'VALIDATION' });
    return null;
  }
  if (!force && backup.hasAutoBackupToday(s.backup_folder)) return null;
  const file = await backup.backupTo(state.db, s.backup_folder, 'auto');
  backup.pruneAutoBackups(s.backup_folder, s.backup_keep);
  state.repo.setRawSetting('last_backup_at', new Date().toISOString());
  state.repo.setRawSetting('last_backup_file', file);
  state.repo.audit('backup.create', { file, kind: 'auto' });
  return { path: file };
}

function startBackupScheduler() {
  const tick = () => runAutoBackup(false).catch((err) => console.error('[auto-backup]', err.message));
  setTimeout(tick, 15000);
  setInterval(tick, 30 * 60 * 1000);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [isMac ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(isDev ? [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }] : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [{ label: 'Open data folder', click: () => shell.openPath(app.getPath('userData')) }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    title: 'DailyCollect',
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f6f7f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  state.mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    state.mainWindow = null;
  });

  // Never open other pages inside the app; send http(s) links to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isDev && url.startsWith(DEV_URL)) return;
    if (!isDev && url.startsWith('file://')) return;
    e.preventDefault();
  });

  if (isDev) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (state.mainWindow) {
      if (state.mainWindow.isMinimized()) state.mainWindow.restore();
      state.mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    try {
      initDatabase();
    } catch (err) {
      dialog.showErrorBox('DailyCollect could not open its database', `${err.message}\n\nData folder: ${app.getPath('userData')}`);
      app.quit();
      return;
    }
    registerIpc(state, { reopenDatabase, runAutoBackup });
    buildMenu();
    createWindow();
    startBackupScheduler();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    try {
      state.db?.close();
    } catch {
      /* already closed */
    }
  });
}
