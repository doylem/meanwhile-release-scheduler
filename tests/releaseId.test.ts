import { describe, expect, it } from 'vitest';
import { generateReleaseId, generateCatalogueKey } from '../src/lib/releaseId';

const base = {
  label: 'meanwhile-recordings' as const,
  catalogueNumber: 'MW089',
  artist: 'Alex O\'Rion',
  releaseDateISO: '2026-07-17',
};

describe('release ID generation', () => {
  it('is deterministic for identical inputs', () => {
    expect(generateReleaseId(base)).toBe(generateReleaseId({ ...base }));
  });

  it('changes when the release date changes (by design — see catalogueKey for stable lookup)', () => {
    const moved = { ...base, releaseDateISO: '2026-07-24' };
    expect(generateReleaseId(moved)).not.toBe(generateReleaseId(base));
  });

  it('changes when the artist changes', () => {
    const other = { ...base, artist: 'Someone Else' };
    expect(generateReleaseId(other)).not.toBe(generateReleaseId(base));
  });

  it('is case- and whitespace-insensitive for the same logical release', () => {
    const messy = { ...base, artist: "  alex o'rion  ", catalogueNumber: ' mw089 ' };
    expect(generateReleaseId(messy)).toBe(generateReleaseId(base));
  });

  it('differs between labels with the same catalogue number and artist', () => {
    const otherLabel = { ...base, label: 'meanwhile-horizons' as const };
    expect(generateReleaseId(otherLabel)).not.toBe(generateReleaseId(base));
  });
});

describe('catalogue key (date-independent lookup for move-release-date)', () => {
  it('stays the same when only the release date changes', () => {
    const moved = { ...base, releaseDateISO: '2026-07-24' };
    expect(generateCatalogueKey(moved)).toBe(generateCatalogueKey(base));
  });

  it('changes when the catalogue number changes', () => {
    const other = { ...base, catalogueNumber: 'MW090' };
    expect(generateCatalogueKey(other)).not.toBe(generateCatalogueKey(base));
  });
});
