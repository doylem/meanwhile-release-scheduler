import { describe, expect, it } from 'vitest';
import { suggestNextCatalogueNumber } from '../src/lib/catalogue';

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
