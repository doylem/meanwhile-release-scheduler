import { useCallback, useEffect, useRef, useState } from 'react';
import { GITHUB_OWNER, GITHUB_REPO } from './clientConfig';
import { useGithubConnection } from './githubConnection';
import { deleteLocalRelease, getLocalReleases, saveLocalRelease } from './localReleases';
import type { LocalRelease } from './localReleases';

function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function dataPath(cat: string): string {
  return `releases/data/${cat}.json`;
}

async function getFileSha(token: string, path: string): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=results`,
    {
      headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store',
    }
  );
  if (!res.ok) return null;
  return ((await res.json()) as { sha: string }).sha ?? null;
}

async function writeToGitHub(release: LocalRelease, token: string): Promise<void> {
  const cat = release.input.catalogueNumber;
  if (!cat) return;
  const path = dataPath(cat);
  const content = toBase64(JSON.stringify(release, null, 2));
  const sha = await getFileSha(token, path);
  await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        message: `Save release ${cat}`,
        content,
        branch: 'results',
        ...(sha ? { sha } : {}),
      }),
    }
  );
}

async function deleteFromGitHub(cat: string, token: string): Promise<void> {
  const path = dataPath(cat);
  const sha = await getFileSha(token, path);
  if (!sha) return;
  await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        message: `Delete release ${cat}`,
        sha,
        branch: 'results',
      }),
    }
  );
}

export function useSharedReleases(): {
  releases: LocalRelease[];
  loading: boolean;
  syncing: boolean;
  save: (release: LocalRelease) => void;
  remove: (id: string) => void;
  refresh: () => void;
} {
  const { connection } = useGithubConnection();
  const [releases, setReleases] = useState<LocalRelease[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const migrationDoneRef = useRef(false);
  const releasesRef = useRef<LocalRelease[]>([]);

  const token = connection?.token ?? null;

  useEffect(() => {
    releasesRef.current = releases;
  });

  const load = useCallback(async () => {
    if (!GITHUB_OWNER || !GITHUB_REPO) {
      setReleases(getLocalReleases());
      return;
    }
    setLoading(true);
    try {
      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
        : { 'X-GitHub-Api-Version': '2022-11-28' };

      const listRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/releases/data?ref=results`,
        { headers, cache: 'no-store' }
      );

      let fromGitHub: LocalRelease[] = [];

      if (listRes.ok) {
        const files = (await listRes.json()) as Array<{ name: string }>;
        const cats = files.filter((f) => f.name.endsWith('.json')).map((f) => f.name.replace('.json', ''));
        const results = await Promise.all(
          cats.map(async (cat) => {
            try {
              const r = await fetch(
                `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/results/releases/data/${cat}.json`,
                { cache: 'no-store' }
              );
              if (!r.ok) return null;
              return (await r.json()) as LocalRelease;
            } catch {
              return null;
            }
          })
        );
        fromGitHub = results.filter((r): r is LocalRelease => r !== null);
      }

      // One-time migration: push localStorage entries with catalogue numbers not yet on GitHub
      if (token && !migrationDoneRef.current) {
        migrationDoneRef.current = true;
        const onGitHub = new Set(fromGitHub.map((r) => r.input.catalogueNumber).filter(Boolean));
        const toMigrate = getLocalReleases().filter(
          (r) => r.input.catalogueNumber && !onGitHub.has(r.input.catalogueNumber)
        );
        for (const release of toMigrate) {
          try {
            await writeToGitHub(release, token);
          } catch {
            // Non-fatal — include anyway so the user still sees it
          }
          fromGitHub.push(release);
        }
      }

      setReleases(fromGitHub);
    } catch {
      // GitHub unavailable — fall back to localStorage
      setReleases(getLocalReleases());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    (release: LocalRelease) => {
      // Optimistic update
      setReleases((prev) => {
        const others = prev.filter((r) => r.id !== release.id);
        return [...others, release];
      });
      // localStorage cache (fallback + offline)
      saveLocalRelease(release);
      // GitHub sync — fire and forget
      if (token && release.input.catalogueNumber) {
        setSyncing(true);
        writeToGitHub(release, token).finally(() => setSyncing(false));
      }
    },
    [token]
  );

  const remove = useCallback(
    (id: string) => {
      const release = releasesRef.current.find((r) => r.id === id);
      setReleases((prev) => prev.filter((r) => r.id !== id));
      deleteLocalRelease(id);
      if (token && release?.input.catalogueNumber) {
        setSyncing(true);
        deleteFromGitHub(release.input.catalogueNumber, token).finally(() => setSyncing(false));
      }
    },
    [token]
  );

  return { releases, loading, syncing, save, remove, refresh: load };
}
