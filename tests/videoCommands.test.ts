import { describe, expect, it } from 'vitest';
import { buildRelease } from '../src/lib/release';
import { isCompilation, shellQuote, videoAssetsCommand } from '../src/lib/videoCommands';
import type { ReleaseInput } from '../src/lib/types';

const base: ReleaseInput = {
  label: 'meanwhile-recordings',
  catalogueNumber: 'MW094',
  artist: 'VA',
  releaseTitle: 'Meanwhile Excursion Vol 6',
  tracks: [],
  releaseDateISO: '2026-11-06',
  royaltyRate: '70%',
  royaltyNotes: '',
  genre: 'Progressive House',
};

describe('video assets command', () => {
  it('uses export-video-assets.sh for EPs (4 tracks or fewer)', () => {
    const release = buildRelease({ ...base, artist: 'Maze 28', tracks: [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }] });
    expect(isCompilation(release)).toBe(false);
    expect(videoAssetsCommand(release, 'MW')).toBe('./scripts/export-video-assets.sh MW "MW094"');
  });

  it('uses make-compilation-videos.sh with one "Artist - Title" arg per track for 5+ tracks', () => {
    const release = buildRelease({
      ...base,
      tracks: [
        { title: 'Breakups', artist: 'Graziano Raffa, Lonya' },
        { title: 'Flow', artist: "Alex O'Rion" },
        { title: 'Hartseer', artist: 'Alex O\'Rion', remixArtist: 'Diego R' },
        { title: 'No Artist' },
        { title: 'E', artist: 'Ke$ha' },
      ],
    });
    expect(isCompilation(release)).toBe(true);
    expect(videoAssetsCommand(release, 'MW')).toBe(
      "./scripts/make-compilation-videos.sh MW 'MW094' " +
        "'Graziano Raffa, Lonya - Breakups' " +
        "'Alex O'\\''Rion - Flow' " +
        "'Alex O'\\''Rion - Hartseer (Diego R Remix)' " +
        "'VA - No Artist' " +
        "'Ke$ha - E'",
    );
  });

  it('single-quotes for the shell', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
});
