import type { Release, Track } from './types';

/** Compilations (e.g. "Meanwhile Excursions") usually have 6, 8 or 10 tracks; EPs have 2–4. */
export const COMPILATION_MIN_TRACKS = 5;

export function isCompilation(release: Pick<Release, 'tracks'>): boolean {
  return release.tracks.length >= COMPILATION_MIN_TRACKS;
}

/** Single-quote for zsh — safe for $, `, ! and " in artist/track names. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function trackTitle(t: Track): string {
  return t.remixArtist ? `${t.title} (${t.remixArtist} Remix)` : t.title;
}

/**
 * "Artist - Title" for make-compilation-videos.sh, which splits on the first " - ".
 * A per-track artist overrides the release artist (which is usually "VA" on compilations).
 */
export function compilationTrackArg(t: Track, releaseArtist: string): string {
  return `${t.artist?.trim() || releaseArtist} - ${trackTitle(t)}`;
}

export function videoAssetsCommand(release: Release, labelShortCode: string): string {
  if (isCompilation(release)) {
    return [
      './scripts/make-compilation-videos.sh',
      labelShortCode,
      shellQuote(release.catalogueNumber),
      ...release.tracks.map((t) => shellQuote(compilationTrackArg(t, release.artist))),
    ].join(' ');
  }
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return ['./scripts/export-video-assets.sh', labelShortCode, `"${esc(release.catalogueNumber)}"`].join(' ');
}
