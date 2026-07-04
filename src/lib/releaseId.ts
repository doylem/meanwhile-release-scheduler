import { createHash } from 'crypto';

/**
 * Generates a stable, deterministic release ID from label, catalogue
 * number, artist and release date. Same inputs always produce the same ID,
 * which is what lets us detect "does this release already have calendar
 * events?" without a database — we store this ID in Google Calendar
 * extendedProperties.private.releaseId and search for it.
 */
export function generateReleaseId(input: {
  label: string;
  catalogueNumber: string;
  artist: string;
  releaseDateISO: string;
}): string {
  const normalized = [
    input.label,
    normalize(input.catalogueNumber),
    normalize(input.artist),
    input.releaseDateISO.trim(),
  ].join('|');

  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  // Prefix with the catalogue number (normalized) for human readability in
  // calendar search / logs, suffix with the hash for uniqueness.
  return `${normalize(input.catalogueNumber)}-${hash}`;
}

/**
 * Date-independent lookup key (label + catalogue number + artist). The
 * releaseId above intentionally includes the release date, so it changes
 * whenever the date changes — which is exactly what "move release date"
 * needs to detect as a change. To find a release's *existing* events when
 * moving its date, search Google Calendar extendedProperties by this key
 * instead, then recompute and store a fresh releaseId alongside the new date.
 */
export function generateCatalogueKey(input: { label: string; catalogueNumber: string; artist: string }): string {
  return [input.label, normalize(input.catalogueNumber), normalize(input.artist)].join('|');
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}
