import { useCallback, useEffect, useState } from 'react';
import { GITHUB_OWNER, GITHUB_REPO } from './clientConfig';
import type { ReleaseState } from './types';

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
} {
  const [states, setStates] = useState<Record<string, ReleaseState>>({});
  const [tick, setTick] = useState(0);
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

  return { states, refresh };
}
