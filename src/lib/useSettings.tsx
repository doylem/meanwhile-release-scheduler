import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { GITHUB_OWNER, GITHUB_REPO } from './clientConfig';
import { useGithubConnection } from './githubConnection';
import { DEFAULT_SETTINGS, type AppSettings } from './settings';

const SETTINGS_PATH = 'settings.json';
const RESULTS_BRANCH = 'results';

async function fetchSettings(): Promise<AppSettings | null> {
  if (!GITHUB_OWNER || !GITHUB_REPO) return null;
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${RESULTS_BRANCH}/${SETTINGS_PATH}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    return (await res.json()) as AppSettings;
  } catch {
    return null;
  }
}

function mergeWithDefaults(loaded: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    features: { ...DEFAULT_SETTINGS.features, ...loaded.features },
  };
}

function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

async function getFileSha(token: string): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${SETTINGS_PATH}?ref=${RESULTS_BRANCH}`,
    {
      headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store',
    }
  );
  if (!res.ok) return null;
  return ((await res.json()) as { sha: string }).sha ?? null;
}

async function persistSettings(s: AppSettings, token: string): Promise<void> {
  const sha = await getFileSha(token);
  const content = toBase64(JSON.stringify(s, null, 2));
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${SETTINGS_PATH}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        message: 'Update app settings',
        content,
        branch: RESULTS_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? `GitHub API error ${res.status}`);
  }
}

interface SettingsContextValue {
  settings: AppSettings;
  loading: boolean;
  saving: boolean;
  save: (s: AppSettings) => Promise<void>;
  refresh: () => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loading: true,
  saving: false,
  save: async () => {},
  refresh: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { connection } = useGithubConnection();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const loaded = await fetchSettings();
    setSettings(loaded ? mergeWithDefaults(loaded) : DEFAULT_SETTINGS);
    setLoading(false);
    loadedRef.current = true;
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (s: AppSettings) => {
      if (!connection) return;
      setSaving(true);
      try {
        await persistSettings(s, connection.token);
        setSettings(s);
      } finally {
        setSaving(false);
      }
    },
    [connection]
  );

  return (
    <SettingsContext.Provider value={{ settings, loading, saving, save, refresh: load }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
