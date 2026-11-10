import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppContext } from './context';
import { api } from './lib/api';
import { today as todayStr } from './lib/dates';
import { makeMoney, fmtDate } from './lib/format';
import { isMod } from './lib/hooks';
import { NAV, TITLES, SHORTCUTS } from './nav';
import Sidebar from './components/Sidebar';
import Icon from './components/Icon';
import Modal, { anyModalOpen } from './components/Modal';
import QuickSearch from './components/QuickSearch';
import PinLock from './components/PinLock';
import EntryModal from './components/EntryModal';
import CustomerForm from './components/CustomerForm';
import { Loading, Kbd } from './components/ui';
import Dashboard from './pages/Dashboard';
import EntryPage from './pages/EntryPage';
import BulkEntry from './pages/BulkEntry';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import History from './pages/History';
import Missed from './pages/Missed';
import DayClose from './pages/DayClose';
import AuditLog from './pages/AuditLog';
import Settings from './pages/Settings';

const PAGES = {
  dashboard: Dashboard,
  entry: EntryPage,
  bulk: BulkEntry,
  customers: Customers,
  customer: CustomerDetail,
  history: History,
  missed: Missed,
  closing: DayClose,
  audit: AuditLog,
  settings: Settings,
};

let toastSeq = 0;

export default function App() {
  const [auth, setAuth] = useState(null);
  const [pub, setPub] = useState(null);
  const [bootError, setBootError] = useState(null);
  const [settings, setSettings] = useState(null);
  const [route, setRoute] = useState({ name: 'dashboard', params: {} });
  const history = useRef([]);
  const navGuard = useRef(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [quickEntry, setQuickEntry] = useState(null);
  const [quickCustomer, setQuickCustomer] = useState(false);
  const [today, setToday] = useState(todayStr());
  const [missedCount, setMissedCount] = useState(0);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  // ---- theme
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  const themeSetting = settings?.theme || pub?.theme || 'system';
  const effectiveTheme = themeSetting === 'system' ? (systemDark ? 'dark' : 'light') : themeSetting;
  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
  }, [effectiveTheme]);

  // ---- day rollover (app left open past midnight)
  useEffect(() => {
    const t = setInterval(() => setToday((cur) => (cur !== todayStr() ? todayStr() : cur)), 30000);
    return () => clearInterval(t);
  }, []);

  // ---- boot & lock
  useEffect(() => {
    Promise.all([api.auth.status(), api.settings.public()]).then(
      ([a, p]) => {
        setAuth(a);
        setPub(p);
      },
      (e) => setBootError(e.message)
    );
    const onLocked = () => setAuth((a) => (a ? { ...a, unlocked: false } : a));
    window.addEventListener('dailycollect:locked', onLocked);
    return () => window.removeEventListener('dailycollect:locked', onLocked);
  }, []);

  const reloadSettings = useCallback(async () => {
    const s = await api.settings.get();
    setSettings(s);
    return s;
  }, []);

  useEffect(() => {
    if (auth?.unlocked) reloadSettings().catch((e) => setBootError(e.message));
  }, [auth?.unlocked, reloadSettings]);

  // ---- services
  const toast = useCallback((message, type = 'info', action = null) => {
    const id = ++toastSeq;
    setToasts((t) => [...t.slice(-4), { id, message, type, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 8000 : 4500);
  }, []);

  const confirm = useCallback((opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve })), []);
  const bump = useCallback(() => setDataVersion((v) => v + 1), []);

  const navigate = useCallback((name, params = {}) => {
    if (navGuard.current && navGuard.current()) {
      // eslint-disable-next-line no-alert
      if (!window.confirm('You have amounts that are not saved yet. Leave this screen without saving?')) return;
    }
    navGuard.current = null;
    setRoute((cur) => {
      history.current = [...history.current.slice(-20), cur];
      return { name, params };
    });
  }, []);

  const goBack = useCallback(() => {
    const prev = history.current.pop();
    if (prev) setRoute(prev);
    else setRoute({ name: 'dashboard', params: {} });
  }, []);

  const setNavGuard = useCallback((fn) => {
    navGuard.current = fn;
  }, []);

  const money = useMemo(() => makeMoney(settings || {}), [settings]);

  const toggleTheme = useCallback(() => {
    const next = effectiveTheme === 'dark' ? 'light' : 'dark';
    api.settings.set({ theme: next }).then(setSettings, (e) => toast(e.message, 'error'));
  }, [effectiveTheme, toast]);

  const lock = useCallback(async () => {
    if (!settings?.hasPin) {
      toast('Set a PIN in Settings → Security to use the lock.', 'info');
      return;
    }
    await api.auth.lock();
    setSearchOpen(false);
    setAuth((a) => ({ ...a, unlocked: false }));
  }, [settings?.hasPin, toast]);

  // Missed-days badge in the sidebar.
  useEffect(() => {
    if (!auth?.unlocked || !settings) return;
    api.missed().then(
      (list) => setMissedCount(list.filter((c) => !c.paidToday && c.daysWithout >= settings.missed_threshold).length),
      () => {}
    );
  }, [auth?.unlocked, settings, dataVersion, today]);

  // ---- global keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (!auth?.unlocked || !settings) return;
      const key = e.key.toLowerCase();
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
      if (isMod(e) && key === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
        return;
      }
      if (anyModalOpen() || searchOpen) return;
      if (isMod(e) && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        navigate(NAV[Number(e.key) - 1].id);
      } else if (isMod(e) && key === 'n') {
        e.preventDefault();
        if (e.shiftKey) setQuickCustomer(true);
        else setQuickEntry({});
      } else if (isMod(e) && key === 'b') {
        e.preventDefault();
        navigate('bulk');
      } else if (isMod(e) && key === 'l') {
        e.preventDefault();
        if (e.shiftKey) toggleTheme();
        else lock();
      } else if (isMod(e) && key === ',') {
        e.preventDefault();
        navigate('settings');
      } else if (e.key === 'F1' || (!typing && e.key === '?')) {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auth?.unlocked, settings, searchOpen, navigate, toggleTheme, lock]);

  const ctx = useMemo(
    () => ({
      settings: settings || {},
      reloadSettings,
      setSettings,
      money,
      today,
      route,
      navigate,
      goBack,
      toast,
      confirm,
      dataVersion,
      bump,
      setNavGuard,
      openQuickEntry: (opts = {}) => setQuickEntry(opts),
    }),
    [settings, reloadSettings, money, today, route, navigate, goBack, toast, confirm, dataVersion, bump, setNavGuard]
  );

  if (bootError) {
    return (
      <div className="fatal">
        <h2>DailyCollect could not start</h2>
        <pre>{bootError}</pre>
        <button className="btn primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
  if (!auth || !pub) return <div className="splash"><Loading label="Starting DailyCollect…" /></div>;
  if (!auth.unlocked) return <PinLock businessName={pub.business_name} onUnlocked={() => setAuth((a) => ({ ...a, unlocked: true }))} />;
  if (!settings) return <div className="splash"><Loading label="Loading…" /></div>;

  const Page = PAGES[route.name] || Dashboard;

  return (
    <AppContext.Provider value={ctx}>
      <div className="layout">
        <Sidebar current={route.name} onNavigate={navigate} businessName={settings.business_name} missedCount={missedCount} symbol={settings.currency_symbol} />
        <main className="main">
          <header className="topbar">
            <div>
              <h1 className="page-title">{TITLES[route.name] || ''}</h1>
              <div className="muted small">{fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
            <div className="topbar-actions">
              <button className="search-btn" onClick={() => setSearchOpen(true)} title="Quick search (Ctrl+K)">
                <Icon name="search" size={16} />
                <span>Search customers…</span>
                <Kbd>Ctrl K</Kbd>
              </button>
              <button className="btn primary" onClick={() => setQuickEntry({})} title="Add entry (Ctrl+N)">
                <Icon name="plus" size={16} /> Entry
              </button>
              <button className="icon-btn" onClick={toggleTheme} title="Toggle theme (Ctrl+Shift+L)">
                <Icon name={effectiveTheme === 'dark' ? 'sun' : 'moon'} />
              </button>
              {settings.hasPin && (
                <button className="icon-btn" onClick={lock} title="Lock (Ctrl+L)">
                  <Icon name="lock" />
                </button>
              )}
              <button className="icon-btn" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (F1)">
                <Icon name="help" />
              </button>
            </div>
          </header>
          <div className="content">
            <Page key={`${route.name}:${JSON.stringify(route.params)}`} params={route.params} />
          </div>
        </main>
      </div>

      {searchOpen && <QuickSearch onClose={() => setSearchOpen(false)} onAddPayment={(id) => setQuickEntry({ customerId: id })} />}
      {quickEntry && <EntryModal defaultCustomerId={quickEntry.customerId ?? null} defaultDate={quickEntry.date} onClose={() => setQuickEntry(null)} />}
      {quickCustomer && <CustomerForm onClose={() => setQuickCustomer(false)} onSaved={(c) => navigate('customer', { id: c.id })} />}
      {helpOpen && (
        <Modal title="Keyboard shortcuts" onClose={() => setHelpOpen(false)} width={600}>
          <table className="table compact">
            <tbody>
              {SHORTCUTS.map(([k, d]) => (
                <tr key={k}>
                  <td className="nowrap">
                    <Kbd>{k}</Kbd>
                  </td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
      {confirmState && (
        <Modal
          title={confirmState.title || 'Are you sure?'}
          width={460}
          onClose={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
          footer={
            <>
              <button
                className="btn"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
              >
                Cancel
              </button>
              <button
                className={`btn ${confirmState.danger ? 'danger' : 'primary'}`}
                data-autofocus
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
              >
                {confirmState.confirmText || 'Confirm'}
              </button>
            </>
          }
        >
          <p>{confirmState.message}</p>
        </Modal>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span className="grow">{t.message}</span>
            {t.action && (
              <button className="btn sm ghost" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
            <button className="icon-btn" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} aria-label="Dismiss">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
