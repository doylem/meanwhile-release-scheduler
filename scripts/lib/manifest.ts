import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ManifestEntry, Release } from '../../src/lib/types';

export type { ManifestEntry };

export function buildManifestEntry(release: Release): ManifestEntry {
  return {
    releaseId: release.releaseId,
    label: release.label,
    artist: release.artist,
    releaseTitle: release.releaseTitle,
    catalogueNumber: release.catalogueNumber,
    releaseDateISO: release.releaseDateISO,
    scheduledAt: new Date().toISOString(),
  };
}

/**
 * Writes a single-entry pending file to releases/pending.json in the
 * working directory. The publish-result action reads and merges this into
 * releases/manifest.json on the results branch.
 */
export function writePendingManifestEntry(release: Release): void {
  const entry = buildManifestEntry(release);
  const dir = join(process.cwd(), 'releases');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'pending.json'), JSON.stringify(entry, null, 2) + '\n');
}
