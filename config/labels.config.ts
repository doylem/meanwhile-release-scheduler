/**
 * Central config for the Meanwhile Release Scheduler.
 *
 * Non-secret settings (label names, short codes, task rules, starting
 * catalogue numbers) live here in version control.
 *
 * Secrets (API keys, tokens, calendar IDs you'd rather not publish, etc.)
 * are read from environment variables / GitHub Secrets — see README.md.
 */

export type LabelKey = 'meanwhile-recordings' | 'meanwhile-horizons';

export interface LabelConfig {
  key: LabelKey;
  name: string;
  shortCode: string; // used in calendar titles, e.g. "MW"
  /**
   * Latest catalogue number issued for this label. The app suggests the
   * next number (e.g. MW089 -> MW090) but always allows manual override.
   * Update this as releases are catalogued, or override per-release in the UI.
   */
  latestCatalogueNumber: string;
}

export const LABELS: Record<LabelKey, LabelConfig> = {
  'meanwhile-recordings': {
    key: 'meanwhile-recordings',
    name: 'Meanwhile Recordings',
    shortCode: 'MW',
    latestCatalogueNumber: 'MW089',
  },
  'meanwhile-horizons': {
    key: 'meanwhile-horizons',
    name: 'Meanwhile Horizons',
    shortCode: 'MWH',
    latestCatalogueNumber: 'MWH012',
  },
};

export type TaskOwner = 'Gavin' | 'Matty' | 'James';

export interface TaskRule {
  /** Identifier used for stable diffing when releases are moved/recreated. */
  id: string;
  /** Days before the release date. 0 = day of release, -1 = day after. */
  daysBeforeRelease: number;
  title: string;
  owner: TaskOwner;
  /** Override the calendar event start hour (24h). Defaults to EVENT_TIME.startHour. */
  startHour?: number;
  /** Override the calendar event start minute. Defaults to EVENT_TIME.startMinute. */
  startMinute?: number;
}

/**
 * Task schedule applied to every release, regardless of label.
 * Edit here to change due dates/owners for the whole catalogue.
 */
export const TASK_RULES: TaskRule[] = [
  { id: 'prepare-masters', daysBeforeRelease: 21, title: 'Prepare masters for release', owner: 'Gavin' },
  { id: 'artwork-ideation', daysBeforeRelease: 21, title: 'Artwork ideation starts', owner: 'Matty' },
  { id: 'artwork-due', daysBeforeRelease: 19, title: 'Artwork due', owner: 'Matty' },
  { id: 'liner-notes-due', daysBeforeRelease: 16, title: 'Liner notes due', owner: 'James' },
  { id: 'inflyte-upload', daysBeforeRelease: 15, title: 'Upload Promo to Inflyte', owner: 'James' },
  { id: 'video-promos-due', daysBeforeRelease: 5, title: 'Video promos due', owner: 'Matty' },
  { id: 'teaser-1', daysBeforeRelease: 3, title: 'Post 1st video teaser', owner: 'Gavin' },
  { id: 'teaser-2', daysBeforeRelease: 1, title: 'Post 2nd video teaser', owner: 'Gavin' },
  { id: 'release-announcement', daysBeforeRelease: -1, title: 'Post Banner / release announcement', owner: 'Gavin', startHour: 12 },
  { id: 'soundcloud-upload', daysBeforeRelease: -1, title: 'Upload release to Soundcloud', owner: 'Gavin', startHour: 12, startMinute: 15 },
];

/** Default timezone for all date math. Respects AEST/AEDT automatically. */
export const DEFAULT_TIMEZONE = 'Australia/Melbourne';

/** Default timed window used for every generated calendar event. */
export const EVENT_TIME = { startHour: 9, startMinute: 0, endHour: 9, endMinute: 15 };

/**
 * Dropbox sub-paths (relative to the matched release folder) the app
 * inspects for assets. Folder name matching is by catalogue-number prefix,
 * not exact match — see src/lib/dropbox.ts.
 */
export const DROPBOX_ASSET_PATHS = {
  artwork: ['release pack/artwork', 'assets'],
  masters: ['release pack/masters'],
  videos: ['release pack/videos'],
  assets: ['assets'],
  premasters: ['premasters'],
  remixPacks: ['remix packs'],
};

export const ASSET_EXTENSIONS = {
  masters: ['.wav', '.aiff'],
  artwork: ['.jpg', '.jpeg', '.png', '.tif', '.tiff'],
  videos: ['.mp4', '.mov'],
};

/** Files to ignore entirely when scanning for masters (Ableton metadata, etc). */
export const IGNORED_FILE_SUFFIXES = ['.asd'];

export interface SeedRelease {
  label: LabelKey;
  artist: string;
  releaseDateISO: string; // YYYY-MM-DD, Australia/Melbourne local date
}

/** Upcoming releases to pre-populate the app with for convenience. */
export const SEED_RELEASES: SeedRelease[] = [
  { label: 'meanwhile-recordings', artist: 'Fran Garay', releaseDateISO: '2026-07-17' },
  { label: 'meanwhile-recordings', artist: 'Maze 28', releaseDateISO: '2026-08-07' },
  { label: 'meanwhile-recordings', artist: 'Juan & Casnik', releaseDateISO: '2026-08-28' },
];
