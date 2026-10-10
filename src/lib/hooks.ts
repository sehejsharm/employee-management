"use client";

import * as React from "react";

const noopSubscribe = () => () => {};

/** False during server render and hydration, true afterwards — without an effect or a re-render loop. */
export function useMounted() {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * The current time, refreshed on an interval. Starts as `initial` (null by
 * default) so server and client agree during hydration, then ticks.
 */
export function useNow(intervalMs = 30_000, initial: Date | null = null) {
  const [now, setNow] = React.useState<Date | null>(initial);
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

/**
 * Keeps a piece of local state in step with a prop that can change (e.g. a
 * list re-fetched by the server) while still allowing local, optimistic edits
 * in between. Uses React's "adjust state while rendering" pattern instead of
 * an effect, so there is no flash of stale data.
 */
export function useSyncedState<T>(source: T) {
  const [state, setState] = React.useState(source);
  const [seen, setSeen] = React.useState(source);
  if (source !== seen) {
    setSeen(source);
    setState(source);
  }
  return [state, setState] as const;
}

/** The rendered size of an element, kept current with a ResizeObserver. Zero until measured. */
export function useElementSize<T extends HTMLElement>() {
  const [node, setNode] = React.useState<T | null>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.round(s.width) === Math.round(width) && Math.round(s.height) === Math.round(height) ? s : { width, height }));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, size] as const;
}
