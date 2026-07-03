import type { ReleaseInput } from './types';

const STORAGE_KEY = 'meanwhile-local-releases';

export interface LocalRelease {
  id: string;
  savedAt: string;
  input: ReleaseInput;
  isScheduled: boolean;
}

export function generateLocalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as { randomUUID: () => string }).randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getLocalReleases(): LocalRelease[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveLocalRelease(release: LocalRelease): void {
  const all = getLocalReleases();
  const idx = all.findIndex((r) => r.id === release.id);
  const updated = { ...release, savedAt: new Date().toISOString() };
  if (idx >= 0) { all[idx] = updated; } else { all.push(updated); }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteLocalRelease(id: string): void {
  const all = getLocalReleases().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function markLocalReleaseScheduled(id: string): void {
  const all = getLocalReleases();
  const r = all.find((r) => r.id === id);
  if (r) {
    r.isScheduled = true;
    r.savedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}
