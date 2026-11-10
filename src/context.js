import { createContext, useContext } from 'react';

export const AppContext = createContext(null);

/**
 * App-wide services:
 *  settings, money(n), today, navigate(name, params), goBack(), route,
 *  toast(message, type?, action?), confirm({title, message, confirmText, danger}) => Promise<boolean>,
 *  dataVersion / bump() to refresh pages after a change, setNavGuard(fn), reloadSettings()
 */
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppContext');
  return ctx;
}
