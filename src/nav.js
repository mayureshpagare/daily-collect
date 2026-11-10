export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', key: '1' },
  { id: 'entry', label: 'New entry', icon: 'plusCircle', key: '2' },
  { id: 'bulk', label: 'Bulk entry', icon: 'bulk', key: '3' },
  { id: 'customers', label: 'Customers', icon: 'users', key: '4' },
  { id: 'history', label: 'History', icon: 'history', key: '5' },
  { id: 'missed', label: 'Missed days', icon: 'alert', key: '6' },
  { id: 'closing', label: 'Day closing', icon: 'closing', key: '7' },
  { id: 'audit', label: 'Audit log', icon: 'shield', key: '8' },
  { id: 'settings', label: 'Settings', icon: 'settings', key: '9' },
];

export const TITLES = Object.fromEntries(NAV.map((n) => [n.id, n.label]));
TITLES.customer = 'Customer';

const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl';

export const SHORTCUTS = [
  [`${mod}+K`, 'Quick search — jump to any customer or page'],
  [`${mod}+1 … ${mod}+9`, 'Go to Dashboard, New entry, Bulk entry, Customers, History, Missed, Day closing, Audit, Settings'],
  [`${mod}+N`, 'Add a collection entry'],
  [`${mod}+Shift+N`, 'Add a customer'],
  [`${mod}+B`, 'Bulk entry for today'],
  [`${mod}+S`, 'Save (bulk entry, day closing)'],
  ['Enter / Shift+Enter', 'Bulk entry: next / previous customer'],
  ['↑ / ↓', 'Move in lists and search results'],
  [`${mod}+L`, 'Lock the app (when a PIN is set)'],
  [`${mod}+Shift+L`, 'Switch dark / light theme'],
  ['F1 or ?', 'Show this help'],
  ['Esc', 'Close a dialog'],
];
