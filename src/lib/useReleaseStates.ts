import { useCallback, useEffect, useRef, useState } from 'react';
import { GITHUB_OWNER, GITHUB_REPO } from './clientConfig';
import { useGithubConnection } from './githubConnection';
import { setTaskCompletions } from './taskCompletion';
import type { ReleaseState } from './types';

/**
 * How long to wait after the last checkbox click before writing to GitHub.
 * Coalesces a burst of clicks into a single request instead of racing
 * several read-modify-write cycles against the same file.
 */
const WRITE_DEBOUNCE_MS = 700;

/**
 * Fetches state/{catalogueNumber}.json from the results branch for each
 * given catalogue number, in parallel. Returns a map from catalogueNumber
 * to ReleaseState, plus a refresh() function.
 *
 * Uses raw.githubusercontent.com (unauthenticated, public repos). Missing
 * state files return nothing for that key — they just haven't been checked yet.
 */
export function useReleaseStates(catalogueNumbers: string[]): {
  states: Record<string, ReleaseState>;
  refresh: () => void;
  toggleTask: (catalogueNumber: string, taskId: string, done: boolean) => void;
  taskError: string | null;
} {
  const { connection } = useGithubConnection();
  const connectionRef = useRef(connection);
  useEffect(() => {
    connectionRef.current = connection;
  });

  const [states, setStates] = useState<Record<string, ReleaseState>>({});
  const [tick, setTick] = useState(0);
  const [taskError, setTaskError] = useState<string | null>(null);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const catKey = catalogueNumbers.join(',');

  useEffect(() => {
    if (!GITHUB_OWNER || !GITHUB_REPO || !catKey) return;
    let cancelled = false;

    async function fetchOne(cat: string): Promise<[string, ReleaseState | null]> {
      const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/results/state/${cat}.json`;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return [cat, null];
        return [cat, (await res.json()) as ReleaseState];
      } catch {
        return [cat, null];
      }
    }

    async function load() {
      const cats = catKey ? catKey.split(',').filter(Boolean) : [];
      const results = await Promise.all(cats.map(fetchOne));
      if (cancelled) return;
      const map: Record<string, ReleaseState> = {};
      for (const [cat, state] of results) {
        if (state) map[cat] = state;
      }
      setStates(map);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [catKey, tick]);

  // Per-catalogue debounce timer + in-flight flag + accumulated (not yet
  // written) task changes. Ensures at most one write is ever in flight for
  // a given release, so a burst of clicks can never race two overlapping
  // read-modify-write cycles against the same state file.
  const pendingRef = useRef<Record<string, Record<string, boolean>>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlightRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  const flush = useCallback(
    (cat: string) => {
      if (inFlightRef.current[cat]) return; // a write is already running for this release
      const changes = pendingRef.current[cat];
      if (!changes || Object.keys(changes).length === 0) return;
      const token = connectionRef.current?.token;
      if (!token) return;

      pendingRef.current[cat] = {};
      inFlightRef.current[cat] = true;

      setTaskCompletions(cat, changes, token)
        .then((updated) => {
          setStates((prev) => ({ ...prev, [cat]: updated }));
        })
        .catch((err) => {
          setTaskError(err instanceof Error ? err.message : String(err));
          refresh(); // roll back to server truth
        })
        .finally(() => {
          inFlightRef.current[cat] = false;
          // More toggles may have arrived while this write was in flight.
          if (Object.keys(pendingRef.current[cat] ?? {}).length > 0) flush(cat);
        });
    },
    [refresh]
  );

  const toggleTask = useCallback(
    (cat: string, taskId: string, done: boolean) => {
      if (!connectionRef.current) {
        setTaskError('Connect GitHub before tracking task completion.');
        return;
      }
      setTaskError(null);
      // Optimistic update — reflect the click immediately, reconcile with the
      // server response (or roll back via refresh) once the debounced write settles.
      setStates((prev) => {
        const existing = prev[cat] ?? { catalogueNumber: cat };
        const set = new Set(existing.completedTasks ?? []);
        if (done) set.add(taskId);
        else set.delete(taskId);
        return { ...prev, [cat]: { ...existing, completedTasks: [...set] } };
      });

      pendingRef.current[cat] = { ...pendingRef.current[cat], [taskId]: done };
      if (timersRef.current[cat]) clearTimeout(timersRef.current[cat]);
      timersRef.current[cat] = setTimeout(() => flush(cat), WRITE_DEBOUNCE_MS);
    },
    [flush]
  );

  return { states, refresh, toggleTask, taskError };
}
