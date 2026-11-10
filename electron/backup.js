'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const D = require('./dates');
const { ValidationError } = require('./validation');
const { REQUIRED_TABLES } = require('./db');

const BACKUP_RE = /^DailyCollect-(auto|backup|pre-restore)-.*\.db$/;

function ensureFolder(folder) {
  if (!folder) throw new ValidationError('Choose a backup folder first (Settings → Backup).');
  fs.mkdirSync(folder, { recursive: true });
}

/** Online backup using SQLite's backup API: safe while the app is running. */
async function backupTo(db, folder, kind = 'backup') {
  ensureFolder(folder);
  const name = kind === 'auto' ? `DailyCollect-auto-${D.today()}.db` : `DailyCollect-${kind}-${D.timestamp()}.db`;
  const target = path.join(folder, name);
  await db.backup(target);
  return target;
}

function listBackups(folder) {
  if (!folder || !fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter((f) => BACKUP_RE.test(f))
    .map((f) => {
      const full = path.join(folder, f);
      const st = fs.statSync(full);
      return { file: f, path: full, size: st.size, modified: st.mtime.toISOString(), kind: f.match(BACKUP_RE)[1] };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

function hasAutoBackupToday(folder) {
  return !!folder && fs.existsSync(path.join(folder, `DailyCollect-auto-${D.today()}.db`));
}

/** Keeps the newest `keep` automatic backups; manual backups are never pruned. */
function pruneAutoBackups(folder, keep) {
  const autos = listBackups(folder).filter((b) => b.kind === 'auto');
  const removed = [];
  for (const b of autos.slice(keep)) {
    try {
      fs.unlinkSync(b.path);
      removed.push(b.file);
    } catch {
      /* file in use or already gone: try again next time */
    }
  }
  return removed;
}

/** Opens a candidate backup read-only and checks integrity and schema before it is allowed to replace live data. */
function validateBackupFile(file) {
  if (!file || !fs.existsSync(file)) throw new ValidationError('Backup file not found.');
  let db;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`integrity check failed (${integrity})`);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
    const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
    if (missing.length) throw new Error(`missing tables: ${missing.join(', ')}`);
    return {
      customers: db.prepare('SELECT COUNT(*) AS n FROM customers').get().n,
      collections: db.prepare('SELECT COUNT(*) AS n FROM collections').get().n,
    };
  } catch (err) {
    throw new ValidationError(`This file is not a valid DailyCollect backup: ${err.message}`);
  } finally {
    if (db) db.close();
  }
}

module.exports = { backupTo, listBackups, hasAutoBackupToday, pruneAutoBackups, validateBackupFile };
