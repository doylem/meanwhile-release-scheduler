import { useCallback, useEffect, useState } from 'react';
import { GITHUB_OWNER, GITHUB_REPO } from './clientConfig';
import { useGithubConnection } from './githubConnection';
import type { ManifestEntry } from './types';

export type { ManifestEntry };

/**
 * Fetches releases/manifest.json from the `results` branch on load.
 *
 * Tries unauthenticated raw.githubusercontent.com first (works for public repos,
 * avoids rate limits). Falls back to the GitHub Contents API with the stored
 * PAT for private repos. Returns null while loading, [] when no releases have
 * been scheduled yet (file not found), or the sorted array of entries.
 */
export function useReleaseManifest() {
  const { connection } = useGithubConnection();
  const [entries, setEntries] = useState<ManifestEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!GITHUB_OWNER || !GITHUB_REPO) return;

    let cancelled = false;

    async function load() {
      if (cancelled) return;
      setLoading(true);
      setError(null);

      const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/results/releases/manifest.json`;
      const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/releases/manifest.json?ref=results`;

      try {
        // Unauthenticated first — fast path for public repos
        const rawRes = await fetch(rawUrl, { cache: 'no-store' });

        if (rawRes.ok) {
          const data = (await rawRes.json()) as ManifestEntry[];
          if (!cancelled) {
            setEntries(data.sort((a, b) => a.releaseDateISO.localeCompare(b.releaseDateISO)));
          }
          return;
        }

        if (rawRes.status === 404) {
          // No manifest yet — no releases scheduled
          if (!cancelled) setEntries([]);
          return;
        }

        // Non-404 failure (private repo, rate limit, etc.) — try with token
        if (connection) {
          const apiRes = await fetch(apiUrl, {
            cache: 'no-store',
            headers: {
              Authorization: `Bearer ${connection.token}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          });

          if (apiRes.ok) {
            const body = await apiRes.json();
            const decoded = atob((body.content as string).replace(/\n/g, ''));
            const data = JSON.parse(decoded) as ManifestEntry[];
            if (!cancelled) {
              setEntries(data.sort((a, b) => a.releaseDateISO.localeCompare(b.releaseDateISO)));
            }
            return;
          }

          if (apiRes.status === 404) {
            if (!cancelled) setEntries([]);
            return;
          }
        }

        if (!cancelled) setError('Could not load release manifest.');
      } catch {
        if (!cancelled) setError('Could not load release manifest.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [connection, tick]);

  return { entries, loading, error, refresh };
}
