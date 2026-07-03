import type { LabelKey, TaskOwner } from '../../config/labels.config';

export interface Track {
  title: string;
  artist?: string;       // overrides release artist for this track (e.g. collab)
  remixArtist?: string;  // set when this track is a remix (e.g. "Diego R")
}

export interface ReleaseInput {
  label: LabelKey;
  catalogueNumber: string;
  artist: string;
  releaseTitle: string;
  tracks: Track[];
  /** ISO date string YYYY-MM-DD, interpreted as a local date in Australia/Melbourne. */
  releaseDateISO: string;
  royaltyRate: string; // e.g. "70%"
  royaltyNotes: string; // e.g. "70% royalties to Alex"
  genre: string; // e.g. "Progressive House"
  notes?: string;
}

export interface ScheduledTask {
  id: string; // task rule id, stable across recalculation
  title: string;
  owner: TaskOwner;
  /** ISO date string YYYY-MM-DD in Australia/Melbourne local time. */
  dueDateISO: string;
  daysBeforeRelease: number;
}

export interface CalendarEventPlan {
  taskId: string;
  title: string;
  description: string;
  /** ISO 8601 datetime with offset, ready for the Google Calendar API. */
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
}

export interface Release extends ReleaseInput {
  /** Stable, deterministic ID derived from label + catalogue + artist + date. */
  releaseId: string;
  tasks: ScheduledTask[];
}

export type DropboxAssetCategory =
  | 'masters'
  | 'artwork'
  | 'videos'
  | 'assets'
  | 'premasters'
  | 'remixPacks';

export interface DropboxAssetStatus {
  folderFound: boolean;
  folderPath?: string;
  categories: Record<DropboxAssetCategory, { found: boolean; sharedLink?: string; fileCount: number }>;
}

export interface EmailDraftInput {
  release: Release;
  mastersLink?: string; // explicit override; falls back to Dropbox-discovered link
  artworkLink?: string;
}

export interface EmailDraft {
  recipient: string;
  subject: string;
  body: string;
  mastersLink?: string;
  artworkLink?: string;
  missingAssets: string[];
}

export interface ManifestEntry {
  releaseId: string;
  label: LabelKey;
  artist: string;
  releaseTitle: string;
  catalogueNumber: string;
  releaseDateISO: string;
  scheduledAt: string;
}
