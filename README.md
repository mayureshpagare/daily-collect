# DailyCollect

An offline desktop app for logging the money you collect from customers every day, when the amount changes from day to day. It runs on Windows, macOS and Linux and is built with Electron, React and SQLite (better-sqlite3).

All data stays in one SQLite file on your computer. The app makes no network calls. The only exception is the optional "WhatsApp" button, which opens `wa.me` in your browser.

Author: **Mayuresh Pagare** · [github.com/mayureshpagare](https://github.com/mayureshpagare)

---

## 1. Features

| Area | What you get |
|---|---|
| Customers | Add, edit, deactivate and delete customers (name, phone, address, notes, start date, optional daily target). Phone numbers must be unique, and `98765 43210` counts as the same number as `98765-43210`. |
| Daily entry | Pick a date (today by default), pick a customer with a type-ahead picker, enter any amount and an optional note. A customer can have several entries on the same day. |
| Bulk entry | Shows every active customer with an amount box. **Enter** moves to the next customer and **Shift+Enter** to the previous one. **Save all** (or **Ctrl+S**) saves every row in one transaction, so either all rows are saved or none are. Each row shows the customer's daily target and what they already paid on that date. A "Fill daily targets" button fills empty boxes with each target. |
| History | Per-customer ledger with date, amount, note and running total, filtered by this week, this month, last 30 days, last month, all time or a custom range. Totals from before the range are carried in as "brought forward". The overall history groups entries by date and lets you expand a day, and an "All entries" tab lets you search. |
| Edit and delete | Any entry can be edited or deleted. Every change is written to the audit log with the old and new values. |
| Cascade delete | Deleting a customer removes all of their entries through `ON DELETE CASCADE`. The confirmation dialog shows how many entries and how much money will be removed, offers **Export history to CSV / PDF** first, and stays disabled until you type the customer's exact name. |
| Dashboard | Today's total compared with yesterday, this month's total, customers paid and not paid today, the top 5 customers this month, a chart of the last 30 days, and a 7-day forecast. |
| Missed-day tracker | Lists customers who have not paid today or have gone N or more days without paying. N is configurable. **Copy reminder** puts a WhatsApp/SMS message on the clipboard; the message is a template you can edit. |
| Calendar heatmap | One square per day for each customer. Colour intensity shows how much they paid, relative to their daily target if one is set. You can view the last 12 months or a single year. |
| Smart insights | Average per paid day, average per calendar day, best and worst day of the week, consistency score (0–100), current and longest payment streaks, and a 7-day prediction. |
| Day closing | Compares what the system collected with the cash you counted, shows the difference as balanced, short or excess, saves the closing, and exports it as a PDF with signature lines. If entries change after a day is closed, a warning appears. |
| Quick search | **Ctrl+K** jumps to any customer or page. **Ctrl+Enter** in the search opens "add payment" for the highlighted customer. |
| Backup | Optional automatic daily backup to a folder you choose, using SQLite's online backup API. Old automatic backups are pruned and manual backups are kept. Restore takes one click. A backup is checked for integrity and schema before it can replace your data, and a safety copy of your current data is always made first. |
| PIN lock | Optional 4–8 digit PIN, hashed with scrypt. After 5 wrong attempts the app makes you wait, and the wait grows with each further wrong attempt. While the app is locked, the main process refuses every data request. |
| Theme and keys | Dark, light or follow the system theme. Keyboard shortcuts throughout; press **F1** to see them. |
| Import and export | Export everything to Excel (5 sheets), CSV (one file per table) or PDF. Export a customer's history or a filtered set of entries. Import customers from CSV and get a report of skipped rows. |
| Settings | Currency symbol, number format, business name (printed on reports and reminders) and the reminder template. |

### Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+K | Quick search |
| Ctrl+1 … Ctrl+9 | Dashboard, New entry, Bulk entry, Customers, History, Missed, Day closing, Audit, Settings |
| Ctrl+N / Ctrl+Shift+N | Add entry / Add customer |
| Ctrl+B | Bulk entry |
| Ctrl+S | Save (bulk entry, day closing) |
| Enter / Shift+Enter | Bulk entry: next / previous customer |
| Ctrl+L / Ctrl+Shift+L | Lock app / switch theme |
| F1 or ? | Shortcut help |
| Esc | Close a dialog |

On macOS, use ⌘ instead of Ctrl.

---

## 2. Architecture

```
┌─────────────────────────── Renderer (React, sandboxed) ───────────────────────────┐
│  pages/*  components/*  lib/api.js ──► window.api.invoke(channel, ...args)        │
└──────────────────────────────────────────┬────────────────────────────────────────┘
                                           │ contextBridge (preload.js)
                                           │ fixed allow-list of IPC channels
┌──────────────────────────────────────────▼────────────────────────────────────────┐
│ Main process (Node)                                                               │
│  ipc.js     one handler per channel → { ok, data } | { ok:false, error, code }    │
│             lock guard: data channels refuse to run while the PIN lock is on      │
│  repo.js    all SQL; validation; audit logging; transactions                      │
│  db.js      open + PRAGMA foreign_keys=ON + versioned migrations                  │
│  insights.js  consistency score, weekday stats, streaks, linear forecast          │
│  reports.js   HTML report templates → PDF (printToPDF), Excel (exceljs)           │
│  backup.js    online backup, list/prune, validate-before-restore                  │
│  security.js  scrypt PIN hashing, back-off on failed attempts                     │
│  csv.js       RFC 4180 parser/writer with formula-injection guard                 │
└──────────────────────────────────────────┬────────────────────────────────────────┘
                                           ▼
                         dailycollect.db (SQLite, in the user data folder)
```

Design decisions:

- **The main process is the authority.** The renderer validates input so it can show errors quickly, but `validation.js` and `repo.js` check every input again, and the SQLite `CHECK` constraints are the final guard. A negative amount is rejected at all three levels.
- **Secure Electron defaults.** The app uses `contextIsolation`, `sandbox: true` and `nodeIntegration: false`, exposes a fixed list of IPC channels, applies a strict Content-Security-Policy in production builds, blocks navigation, and sends external links to the system browser.
- **Errors are values.** IPC handlers never throw across the bridge. They return `{ ok:false, error }` with a readable message; SQLite error codes such as UNIQUE or BUSY are translated into plain-language messages.
- **Rollback journal instead of WAL.** The database stays a single self-contained file, which keeps backup and restore-by-copy simple and safe.
- **Dates are stored as `YYYY-MM-DD` text, and date arithmetic is done in UTC.** Daylight-saving changes therefore never shift a day.
- **Amounts are rounded to 2 decimals on input, and sums use `ROUND(SUM(..), 2)`.**
- **better-sqlite3 v13 is an N-API module that ships prebuilt binaries** for Windows, macOS and Linux (x64 and arm64). The same binary loads in both Node and Electron, so no native rebuild or Visual Studio toolchain is needed. This is why `npmRebuild` is `false` in the build config.

### Database

```sql
customers   (id, name, phone UNIQUE-when-present, address, notes, start_date,
             daily_target, active, created_at)
collections (id, customer_id → customers(id) ON DELETE CASCADE, amount CHECK > 0,
             date, note, created_at, updated_at)
audit_log   (id, action, details JSON, timestamp)
settings    (key, value)                      -- app settings, PIN hash
day_closings(date PK, expected, counted, difference, note, closed_at)

PRAGMA foreign_keys = ON   (checked on every open; the app refuses to start without it)
Indexes: collections(customer_id), collections(date), collections(customer_id, date),
         customers(name), unique partial index on customers(phone), audit_log(timestamp)
```

The schema is versioned with `PRAGMA user_version`. To change it, append a migration to `MIGRATIONS` in [electron/db.js](electron/db.js); existing databases upgrade the next time the app opens them.

### Insights: how they are calculated

- **Consistency score (0–100)** is calculated over the last 90 days, or since the customer's start date if that is shorter: `60% × share of days paid` + `25% × amount steadiness` (1 − coefficient of variation) + `15% × share of days the target was met` (when there is no target, the share of days paid is used instead). Labels: 80+ Excellent, 60+ Good, 40+ Fair, otherwise Poor.
- **Best and worst weekday:** the average amount for each weekday over every occurrence of that weekday in the period. Days with no payment count as 0.
- **7-day prediction:** a least-squares trend line fitted to the last 28 days, multiplied by a damped day-of-week factor (`0.5 + 0.5 × weekday average ÷ overall average`) and never allowed to go below 0.

---

## 3. Folder structure

```
daily-collect/
├── package.json              scripts + electron-builder config
├── vite.config.mjs           renderer build (+ production CSP)
├── index.html
├── electron/                 main process (CommonJS)
│   ├── main.js               window, menu, single-instance, backup scheduler, restore swap
│   ├── preload.js            contextBridge with channel allow-list
│   ├── ipc.js                IPC handlers, dialogs, export/import, PDF rendering
│   ├── db.js                 open, pragmas, migrations (schema)
│   ├── repo.js               data access layer (all SQL)
│   ├── validation.js         input validation + error types
│   ├── insights.js           analytics + forecast
│   ├── reports.js            PDF HTML templates + Excel workbook
│   ├── backup.js             backup / list / prune / validate
│   ├── security.js           PIN hashing + attempt guard
│   ├── csv.js                CSV read/write
│   └── dates.js              calendar-date helpers
├── src/                      renderer (React 19)
│   ├── main.jsx, App.jsx     shell, routing, shortcuts, toasts, confirm dialog
│   ├── context.js, nav.js, styles.css
│   ├── lib/                  api.js, dates.js, format.js, hooks.js, reminder.js
│   ├── components/           Modal, CustomerPicker, CustomerForm, DeleteCustomerDialog,
│   │                         EntryModal, EntryActions, BarChart, Heatmap, QuickSearch,
│   │                         PinLock, Sidebar, DateRangeFilter, Icon, ErrorBoundary, ui
│   └── pages/                Dashboard, EntryPage, BulkEntry, Customers, CustomerDetail,
│                             History, Missed, DayClose, AuditLog, Settings
├── scripts/dev.mjs           Vite dev server + Electron launcher
├── samples/customers-sample.csv
└── tests/                    node:test suites (repo, insights, csv, pin, backup)
```

---

## 4. Run, test, package

Requires **Node.js 22 or newer**.

```bash
npm install            # npm 11+: approved install scripts are listed under "allowScripts" in package.json
npm run dev            # Vite dev server + Electron with hot reload (restart after editing electron/*)
npm start              # production renderer build, then run Electron
npm test               # 33 tests: schema, validation, cascade delete, ledger, insights, CSV, PIN, backup
```

If `npm install` warns that Electron's install script was not run, use `npm approve-scripts electron` followed by `npm rebuild electron`, or run `node node_modules/electron/install.js` directly.

### Build installers

```bash
npm run dist:win       # → release/DailyCollect Setup 1.0.0.exe   (NSIS, choose install folder)
npm run dist:mac       # → release/DailyCollect-1.0.0.dmg          (run on macOS)
npm run dist:linux     # → release/DailyCollect-1.0.0.AppImage + .deb
```

Build each platform on that platform; macOS builds in particular need a Mac. To use a custom app icon, put `build/icon.png` (512×512) in the project, plus `build/icon.ico` for Windows and `build/icon.icns` for macOS. Without them, electron-builder uses the default Electron icon. For public distribution, sign the installers (Windows code-signing certificate; Apple Developer ID plus notarization).

### Where the data lives

| OS | Database file |
|---|---|
| Windows | `%APPDATA%\DailyCollect\dailycollect.db` |
| macOS | `~/Library/Application Support/DailyCollect/dailycollect.db` |
| Linux | `~/.config/DailyCollect/dailycollect.db` |

Set the environment variable `DAILYCOLLECT_DATA_DIR` to keep the data somewhere else, for example a portable install on a USB drive or a throwaway test profile. Settings → About → **Open data folder** opens the current location.

---

## 5. Test checklist

Automated (`npm test`):

- [x] `PRAGMA foreign_keys` is ON and `collections.customer_id` is `ON DELETE CASCADE`
- [x] Deleting a customer removes **all** their entries and leaves other customers' entries untouched
- [x] A raw `DELETE FROM customers` also cascades, which proves the database itself enforces it
- [x] Deleting requires the exact name; with a wrong name nothing is deleted
- [x] Empty, zero, negative and non-numeric amounts are rejected, as are invalid dates
- [x] Duplicate phone numbers are rejected, even when formatted differently
- [x] Multiple entries per customer per day are allowed
- [x] A bulk save with one bad row saves nothing
- [x] Edits and deletes write audit records with before and after values
- [x] The ledger running total carries the balance from before the selected range
- [x] Dashboard paid and not-paid counts, missed-day counts, and the day-closing difference are correct
- [x] Consistency score stays within 0–100; the forecast has 7 points and is never negative
- [x] CSV round-trip with quotes and newlines; formula injection is neutralised
- [x] PIN hash and verify work; wrong attempts trigger a wait
- [x] Backup files validate; a junk file is rejected

Manual, in the app:

1. Add 3 customers. Adding a second customer with an existing phone number shows "already used by …".
2. **Bulk entry:** type amounts and press Enter to move down. Type `-5` on one row and press Ctrl+S: the row turns red and nothing is saved. Fix it and press Ctrl+S again: all rows are saved.
3. **New entry:** add two entries for the same customer on the same day. Both appear.
4. Edit an entry's amount, then delete another entry. **Audit log** shows both, with the old and new values.
5. **Customer → Ledger:** switch between This week, This month and Custom. The running total and "brought forward" update.
6. **Customer → Heatmap / Insights:** the heatmap squares, consistency score, best and worst day, and forecast all appear.
7. **Cascade delete:** on a customer with entries, click **Delete**. The dialog shows the entry count and total. Export to CSV and to PDF and check both files. The Delete button stays disabled until you type the exact name. After deleting, the customer and all their entries are gone from **History → All entries** and the dashboard totals drop by the amount shown.
8. **Missed days:** set "Flag after" to 1. Click **Copy reminder** and paste it into a text editor; the name, days and last payment are filled in.
9. **Day closing:** enter a counted amount lower than the total. The difference shows "Short by …" in red. Save it and export the PDF.
10. **Ctrl+K:** type part of a name, then press Enter to open the customer or Ctrl+Enter to add a payment.
11. **Settings:** change the currency symbol to `$` and the format to US; amounts across the app update. Switch the theme.
12. **PIN:** turn on the PIN lock, press Ctrl+L, enter a wrong PIN (you see an error), then the right PIN. Restart the app and confirm it asks for the PIN.
13. **Backup:** choose a folder, click **Back up now**, add a customer, restore the backup. The new customer is gone, and a safety copy appears in `safety-backups/`.
14. **Export everything** to Excel and open the file (5 sheets). **Import** `samples/customers-sample.csv`; rows with errors are reported and skipped.

---

## License

MIT © 2026 Mayuresh Pagare
