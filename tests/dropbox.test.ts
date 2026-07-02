import { describe, expect, it } from 'vitest';
import { matchReleaseFolderName, classifyFile, buildAssetStatus } from '../src/lib/dropbox';

describe('Dropbox folder matching by catalogue prefix', () => {
  const folders = [
    "MW089 - Alex Orion - Hartseer EP",
    "MW090 - Fran Garay - Some Title EP",
    "MWH012 - Other Artist - Title",
  ];

  it('matches by catalogue number prefix, not exact folder name', () => {
    expect(matchReleaseFolderName('MW089', folders)).toBe('MW089 - Alex Orion - Hartseer EP');
  });

  it('is case-insensitive', () => {
    expect(matchReleaseFolderName('mw089', folders)).toBe('MW089 - Alex Orion - Hartseer EP');
  });

  it('does not false-positive match a numeric prefix of another catalogue number', () => {
    // "MW09" should not accidentally match "MW090..." or "MW089..." results
    // beyond an exact boundary — only a real catalogue number matches.
    expect(matchReleaseFolderName('MW09', folders)).toBeUndefined();
  });

  it('returns undefined when no folder matches', () => {
    expect(matchReleaseFolderName('MW999', folders)).toBeUndefined();
  });
});

describe('asset classification', () => {
  it('treats .wav and .aiff under release pack/masters as masters', () => {
    expect(classifyFile("release pack/masters/Alex O'Rion - Flow MASTERED.wav")).toBe('masters');
    expect(classifyFile('release pack/masters/Track.aiff')).toBe('masters');
  });

  it('ignores Ableton metadata files like .asd when deciding masters presence', () => {
    expect(classifyFile("release pack/masters/Alex O'Rion - Flow MASTERED.wav.asd")).toBeNull();
  });

  it('treats image formats under release pack/artwork or assets as artwork/assets', () => {
    expect(classifyFile('release pack/artwork/Meanwhile Release Cover.jpg')).toBe('artwork');
    expect(classifyFile('assets/MW089 - Meanwhile Release Assets.tif')).toBe('assets');
  });

  it('treats .mp4 and .mov under release pack/videos as promo videos', () => {
    expect(classifyFile('release pack/videos/MW089_promo_video_square-flow.mp4')).toBe('videos');
  });

  it('classifies files under premasters and remix packs by folder alone', () => {
    expect(classifyFile('premasters/flow_premaster.wav')).toBe('premasters');
    expect(classifyFile('remix packs/remix_pack.zip')).toBe('remixPacks');
  });

  it('returns null for unrecognized files', () => {
    expect(classifyFile('readme.txt')).toBeNull();
  });
});

describe('buildAssetStatus', () => {
  it('reports folder missing when no folder was matched', () => {
    const status = buildAssetStatus(undefined, []);
    expect(status.folderFound).toBe(false);
    expect(status.categories.masters.found).toBe(false);
  });

  it('reports each category found/missing independently based on file paths', () => {
    const status = buildAssetStatus('/Meanwhile/Releases/MW089 - Alex Orion - Hartseer EP', [
      "release pack/masters/Alex O'Rion - Flow MASTERED.wav",
      "release pack/masters/Alex O'Rion - Flow MASTERED.wav.asd",
      'release pack/artwork/Meanwhile Release Cover.jpg',
    ]);
    expect(status.folderFound).toBe(true);
    expect(status.categories.masters.found).toBe(true);
    expect(status.categories.masters.fileCount).toBe(1); // .asd ignored
    expect(status.categories.artwork.found).toBe(true);
    expect(status.categories.videos.found).toBe(false);
    expect(status.categories.remixPacks.found).toBe(false);
  });
});
