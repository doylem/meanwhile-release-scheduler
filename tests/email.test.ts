import { describe, expect, it } from 'vitest';
import { generateEmailDraft } from '../src/lib/email';
import { buildRelease } from '../src/lib/release';
import type { ReleaseInput } from '../src/lib/types';

const input: ReleaseInput = {
  label: 'meanwhile-recordings',
  catalogueNumber: 'MW089',
  artist: "Alex O'Rion",
  releaseTitle: 'Hartseer EP',
  tracks: [{ title: 'Hartseer' }, { title: 'Flow' }],
  releaseDateISO: '2026-06-26', // Friday
  royaltyRate: '70%',
  royaltyNotes: "70% royalties to Alex",
  genre: 'Progressive House',
};

describe('email draft generation', () => {
  const release = buildRelease(input);

  it('builds the subject line as CATALOGUE - Artist - Release assets', () => {
    const draft = generateEmailDraft({ release });
    expect(draft.subject).toBe("MW089 - Alex O'Rion - Release assets");
  });

  it('greets James, states track count and artist, and signs off G&M', () => {
    const draft = generateEmailDraft({ release });
    expect(draft.body).toContain('Hi James!');
    expect(draft.body).toContain("Our next release is here, 2 tracks from Alex O'Rion.");
    expect(draft.body.trim().endsWith('G&M')).toBe(true);
  });

  it('numbers the tracklist in order', () => {
    const draft = generateEmailDraft({ release });
    expect(draft.body).toContain("1. Alex O'Rion - Hartseer");
    expect(draft.body).toContain("2. Alex O'Rion - Flow");
  });

  it('formats the release date as "Friday Month Day(st/nd/rd/th)"', () => {
    const draft = generateEmailDraft({ release });
    expect(draft.body).toContain('Release Date: Friday June 26th');
  });

  it('includes genre and royalty notes on one line', () => {
    const draft = generateEmailDraft({ release });
    expect(draft.body).toContain('Progressive House, 70% royalties to Alex');
  });

  it('falls back to "Coming from Gavin/Matty" when links are missing, and flags them', () => {
    const draft = generateEmailDraft({ release });
    expect(draft.body).toContain('MASTERS - Coming from Gavin');
    expect(draft.body).toContain('ARTWORK - Coming from Matty');
    expect(draft.missingAssets).toEqual(['masters', 'artwork']);
  });

  it('uses provided Dropbox links when available and reports no missing assets', () => {
    const draft = generateEmailDraft({
      release,
      mastersLink: 'https://dropbox.com/masters-link',
      artworkLink: 'https://dropbox.com/artwork-link',
    });
    expect(draft.body).toContain('MASTERS - https://dropbox.com/masters-link');
    expect(draft.body).toContain('ARTWORK - https://dropbox.com/artwork-link');
    expect(draft.missingAssets).toEqual([]);
  });

  it('defaults the recipient to the configured Gmail draft recipient', () => {
    const draft = generateEmailDraft({ release });
    expect(draft.recipient).toBe('meanwhilerec@gmail.com');
  });
});
