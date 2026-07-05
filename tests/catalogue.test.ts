import { describe, expect, it } from 'vitest';
import { suggestNextCatalogueNumber, latestFromReleases, suggestForLabel } from '../src/lib/catalogue';

describe('catalogue number auto-increment', () => {
  it('increments a standard 3-digit catalogue number', () => {
    expect(suggestNextCatalogueNumber('MW089')).toBe('MW090');
  });

  it('increments a longer label short code', () => {
    expect(suggestNextCatalogueNumber('MWH012')).toBe('MWH013');
  });

  it('grows the digit width naturally when crossing a power of ten', () => {
    expect(suggestNextCatalogueNumber('MW099')).toBe('MW100');
  });

  it('throws a clear error for unparseable catalogue numbers', () => {
    expect(() => suggestNextCatalogueNumber('not-a-cat-number')).toThrow();
  });
});

describe('latestFromReleases', () => {
  const releases = [
    { label: 'meanwhile-recordings', catalogueNumber: 'MW089' },
    { label: 'meanwhile-recordings', catalogueNumber: 'MW091' },
    { label: 'meanwhile-recordings', catalogueNumber: 'MW090' },
    { label: 'meanwhile-horizons', catalogueNumber: 'MWH012' },
  ];

  it('returns the highest catalogue number for a label', () => {
    expect(latestFromReleases(releases, 'meanwhile-recordings')).toBe('MW091');
  });

  it('works for a different label in the same list', () => {
    expect(latestFromReleases(releases, 'meanwhile-horizons')).toBe('MWH012');
  });

  it('returns null when no releases exist for that label', () => {
    expect(latestFromReleases(releases, 'unknown-label')).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(latestFromReleases([], 'meanwhile-recordings')).toBeNull();
  });
});

describe('suggestForLabel', () => {
  const releases = [
    { label: 'meanwhile-recordings', catalogueNumber: 'MW091' },
  ];

  it('suggests the next number after the highest existing one', () => {
    expect(suggestForLabel(releases, 'meanwhile-recordings', 'MW')).toBe('MW092');
  });

  it('starts from 001 when no releases exist for the label', () => {
    expect(suggestForLabel([], 'meanwhile-recordings', 'MW')).toBe('MW001');
  });

  it('uses the provided short code for the fallback', () => {
    expect(suggestForLabel([], 'my-label', 'XYZ')).toBe('XYZ001');
  });
});
