'use strict';
const Database = require('better-sqlite3');

/**
 * Migrations run in order. PRAGMA user_version records how many have been applied,
 * so existing databases upgrade in place when the schema grows.
 */
const MIGRATIONS = [
  `
  CREATE TABLE customers (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    phone        TEXT,
    address      TEXT,
    notes        TEXT,
    start_date   TEXT,
    daily_target REAL    CHECK (daily_target IS NULL OR daily_target >= 0),
    active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE UNIQUE INDEX ux_customers_phone ON customers(phone) WHERE phone IS NOT NULL AND phone <> '';
  CREATE INDEX idx_customers_name ON customers(name COLLATE NOCASE);

  CREATE TABLE collections (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount      REAL    NOT NULL CHECK (amount > 0),
    date        TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    note        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX idx_collections_customer_id ON collections(customer_id);
  CREATE INDEX idx_collections_date ON collections(date);
  CREATE INDEX idx_collections_customer_date ON collections(customer_id, date);

  CREATE TABLE audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    action    TEXT NOT NULL,
    details   TEXT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE day_closings (
    date       TEXT PRIMARY KEY,
    expected   REAL NOT NULL,
    counted    REAL NOT NULL,
    difference REAL NOT NULL,
    note       TEXT,
    closed_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  `,
];

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

function openDatabase(file, options = {}) {
  const db = new Database(file, options);
  // Rollback journal (not WAL) keeps the database a single self-contained file,
  // which makes backup files and restore-by-copy simple and safe.
  db.pragma('journal_mode = DELETE');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  if (db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new Error('SQLite foreign key support could not be enabled.');
  }
  migrate(db);
  return db;
}

const REQUIRED_TABLES = ['customers', 'collections', 'audit_log'];

module.exports = { openDatabase, migrate, REQUIRED_TABLES, SCHEMA_VERSION: MIGRATIONS.length };
