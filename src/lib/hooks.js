import { useCallback, useEffect, useRef, useState } from 'react';

/** Runs an async loader whenever deps change; keeps the previous data while reloading. */
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(() => fnRef.current())
      .then(
        (data) => alive && setState({ data, loading: false, error: null }),
        (err) => alive && setState({ data: null, loading: false, error: err.message || String(err) })
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Registers a window keydown handler for the component's lifetime. */
export function useKey(handler, deps = []) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h = (e) => ref.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export const isMod = (e) => e.ctrlKey || e.metaKey;
