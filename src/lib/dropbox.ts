import { Dropbox, type files } from 'dropbox';
import {
  ASSET_EXTENSIONS,
  DROPBOX_ASSET_PATHS,
  IGNORED_FILE_SUFFIXES,
} from '../../config/labels.config';
import type { DropboxAssetCategory, DropboxAssetStatus } from './types';

/* ---------------------------------------------------------------------- */
/*  Pure logic — no network calls, fully unit-testable                    */
/* ---------------------------------------------------------------------- */

/**
 * Finds the release folder matching a catalogue number by *prefix*, not
 * exact name. Folder names look like "MW089 - Alex Orion - Hartseer EP";
 * we only need the leading catalogue number to match.
 */
export function matchReleaseFolderName(catalogueNumber: string, folderNames: string[]): string | undefined {
  const wanted = catalogueNumber.trim().toLowerCase();
  return folderNames.find((name) => {
    const candidate = name.trim().toLowerCase();
    // Must start with the catalogue number, followed by a non-alphanumeric
    // separator (or end of string) so "MW8" doesn't match "MW89...".
    if (!candidate.startsWith(wanted)) return false;
    const next = candidate.charAt(wanted.length);
    return next === '' || /[^a-z0-9]/.test(next);
  });
}

function isIgnored(path: string): boolean {
  const lower = path.toLowerCase();
  return IGNORED_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function hasExtension(path: string, extensions: string[]): boolean {
  const lower = path.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

function isUnderAnyPath(path: string, candidatePaths: string[]): boolean {
  const lower = path.toLowerCase();
  return candidatePaths.some((p) => lower.includes(`/${p.toLowerCase()}/`) || lower.includes(`${p.toLowerCase()}/`));
}

/**
 * Classifies a single file path (relative to the release folder) into an
 * asset category, or null if it doesn't match any rule. Ableton metadata
 * files (.asd etc.) are ignored entirely, even if they live in a masters folder.
 */
export function classifyFile(relativePath: string): DropboxAssetCategory | null {
  if (isIgnored(relativePath)) return null;

  if (isUnderAnyPath(relativePath, DROPBOX_ASSET_PATHS.masters) && hasExtension(relativePath, ASSET_EXTENSIONS.masters)) {
    return 'masters';
  }
  if (
    isUnderAnyPath(relativePath, DROPBOX_ASSET_PATHS.videos) &&
    hasExtension(relativePath, ASSET_EXTENSIONS.videos)
  ) {
    return 'videos';
  }
  if (
    isUnderAnyPath(relativePath, ['release pack/artwork']) &&
    hasExtension(relativePath, ASSET_EXTENSIONS.artwork)
  ) {
    return 'artwork';
  }
  if (isUnderAnyPath(relativePath, ['assets']) && hasExtension(relativePath, ASSET_EXTENSIONS.artwork)) {
    return 'assets';
  }
  if (isUnderAnyPath(relativePath, DROPBOX_ASSET_PATHS.premasters)) {
    return 'premasters';
  }
  if (isUnderAnyPath(relativePath, DROPBOX_ASSET_PATHS.remixPacks)) {
    return 'remixPacks';
  }
  return null;
}

const EMPTY_CATEGORIES = (): DropboxAssetStatus['categories'] => ({
  masters: { found: false, fileCount: 0 },
  artwork: { found: false, fileCount: 0 },
  videos: { found: false, fileCount: 0 },
  assets: { found: false, fileCount: 0 },
  premasters: { found: false, fileCount: 0 },
  remixPacks: { found: false, fileCount: 0 },
});

/**
 * Builds an asset status report from a flat list of file paths relative to
 * the matched release folder. Pure function — the network listing step
 * happens separately in checkReleaseAssets() below.
 */
export function buildAssetStatus(
  folderPath: string | undefined,
  relativeFilePaths: string[]
): DropboxAssetStatus {
  const categories = EMPTY_CATEGORIES();

  for (const path of relativeFilePaths) {
    const category = classifyFile(path);
    if (!category) continue;
    categories[category].found = true;
    categories[category].fileCount += 1;
  }

  return {
    folderFound: Boolean(folderPath),
    folderPath,
    categories,
  };
}

/* ---------------------------------------------------------------------- */
/*  SDK client wrapper — used by GitHub Actions scripts (server-side only) */
/* ---------------------------------------------------------------------- */

export interface DropboxClientConfig {
  accessToken: string; // short-lived token obtained from refresh token, see scripts/lib/dropboxAuth.ts
  basePath: string; // e.g. "/Meanwhile/Releases"
}

function createClient(config: DropboxClientConfig): Dropbox {
  return new Dropbox({ accessToken: config.accessToken });
}

/** Lists immediate subfolder names directly under the configured base path. */
export async function listReleaseFolderNames(config: DropboxClientConfig): Promise<string[]> {
  const dbx = createClient(config);
  const names: string[] = [];
  let result = await dbx.filesListFolder({ path: config.basePath });
  collectFolderNames(result.result.entries, names);
  while (result.result.has_more) {
    result = await dbx.filesListFolderContinue({ cursor: result.result.cursor });
    collectFolderNames(result.result.entries, names);
  }
  return names;
}

function collectFolderNames(entries: files.MetadataReference[], out: string[]) {
  for (const entry of entries) {
    if (entry['.tag'] === 'folder') out.push(entry.name);
  }
}

/** Recursively lists all file paths under a folder, relative to that folder. */
export async function listAllFilesUnder(config: DropboxClientConfig, folderPath: string): Promise<string[]> {
  const dbx = createClient(config);
  const paths: string[] = [];
  let result = await dbx.filesListFolder({ path: folderPath, recursive: true });
  collectFilePaths(result.result.entries, folderPath, paths);
  while (result.result.has_more) {
    result = await dbx.filesListFolderContinue({ cursor: result.result.cursor });
    collectFilePaths(result.result.entries, folderPath, paths);
  }
  return paths;
}

function collectFilePaths(entries: files.MetadataReference[], folderPath: string, out: string[]) {
  const prefix = folderPath.toLowerCase();
  for (const entry of entries) {
    if (entry['.tag'] === 'file' && entry.path_lower) {
      out.push(entry.path_lower.replace(prefix, '').replace(/^\//, ''));
    }
  }
}

/** Creates a shared link for a path, or returns an existing one if already shared. */
export async function getOrCreateSharedLink(config: DropboxClientConfig, path: string): Promise<string> {
  const dbx = createClient(config);
  try {
    const created = await dbx.sharingCreateSharedLinkWithSettings({ path });
    return created.result.url;
  } catch (err: unknown) {
    // Dropbox returns a 409 with shared_link_already_exists if one exists already.
    const existing = await dbx.sharingListSharedLinks({ path, direct_only: true });
    const link = existing.result.links[0];
    if (link) return link.url;
    throw err;
  }
}

/**
 * Full check for one catalogue number: find the folder, list its contents,
 * classify assets, and fetch shared links for any category that has files.
 * This is the function the "Check Dropbox Assets" GitHub Action script calls.
 */
export async function checkReleaseAssets(
  config: DropboxClientConfig,
  catalogueNumber: string
): Promise<DropboxAssetStatus & { sharedLinks: Partial<Record<DropboxAssetCategory, string>> }> {
  const folderNames = await listReleaseFolderNames(config);
  const matchedName = matchReleaseFolderName(catalogueNumber, folderNames);

  if (!matchedName) {
    return { ...buildAssetStatus(undefined, []), sharedLinks: {} };
  }

  const folderPath = `${config.basePath}/${matchedName}`;
  const relativePaths = await listAllFilesUnder(config, folderPath);
  const status = buildAssetStatus(folderPath, relativePaths);

  const sharedLinks: Partial<Record<DropboxAssetCategory, string>> = {};
  for (const [category, info] of Object.entries(status.categories) as [DropboxAssetCategory, { found: boolean }][]) {
    if (!info.found) continue;
    const subdirCandidates =
      category === 'masters'
        ? DROPBOX_ASSET_PATHS.masters
        : category === 'artwork'
        ? ['release pack/artwork']
        : category === 'videos'
        ? DROPBOX_ASSET_PATHS.videos
        : category === 'assets'
        ? ['assets']
        : category === 'premasters'
        ? DROPBOX_ASSET_PATHS.premasters
        : DROPBOX_ASSET_PATHS.remixPacks;
    const dirPath = `${folderPath}/${subdirCandidates[0]}`;
    try {
      sharedLinks[category] = await getOrCreateSharedLink(config, dirPath);
    } catch {
      // Non-fatal — missing shared link must never block release creation or email drafts.
    }
  }

  return { ...status, sharedLinks };
}
