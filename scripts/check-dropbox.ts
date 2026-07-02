/**
 * Entry point for the "Check Dropbox Assets" GitHub Actions workflow.
 *
 * Given a catalogue number, finds the matching release folder (by prefix,
 * not exact name), inspects masters/artwork/videos/assets/premasters/remix
 * packs, and fetches shared links for whatever is found. Missing assets
 * never fail the run — they're just reported as missing.
 */
import { checkReleaseAssets } from '../src/lib/dropbox';
import { getDropboxAccessToken } from './lib/dropboxAuth';
import { isDryRun, requireEnv } from './lib/env';
import { writeResult } from './lib/result';

interface CheckDropboxPayload {
  catalogueNumber: string;
}

async function main() {
  const requestId = requireEnv('REQUEST_ID');
  const payload: CheckDropboxPayload = JSON.parse(requireEnv('PAYLOAD_JSON'));
  const basePath = requireEnv('DROPBOX_BASE_PATH');
  const dryRun = isDryRun();

  if (dryRun) {
    writeResult(requestId, {
      ok: true,
      dryRun: true,
      catalogueNumber: payload.catalogueNumber,
      pathsSearched: [
        basePath,
        `${basePath}/<matched folder>/release pack/masters`,
        `${basePath}/<matched folder>/release pack/artwork`,
        `${basePath}/<matched folder>/release pack/videos`,
        `${basePath}/<matched folder>/assets`,
        `${basePath}/<matched folder>/premasters`,
        `${basePath}/<matched folder>/remix packs`,
      ],
    });
    return;
  }

  const accessToken = await getDropboxAccessToken();
  const status = await checkReleaseAssets({ accessToken, basePath }, payload.catalogueNumber);

  writeResult(requestId, {
    ok: true,
    catalogueNumber: payload.catalogueNumber,
    ...status,
  });
}

main().catch((err) => {
  console.error(err);
  const requestId = process.env.REQUEST_ID;
  if (requestId) {
    writeResult(requestId, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
  process.exitCode = 1;
});
