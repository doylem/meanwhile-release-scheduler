/**
 * Entry point for the "Generate Gmail Draft" GitHub Actions workflow.
 *
 * Builds the email body from the release + any manually supplied or
 * Dropbox-discovered asset links, then creates a Gmail draft (it never
 * sends — sending is a separate explicit action triggered only after the
 * user reviews the preview in the app).
 */
import { generateEmailDraft } from '../src/lib/email';
import { createGmailDraft, sendGmailDraft } from '../src/lib/gmail';
import { buildRelease } from '../src/lib/release';
import { googleAuthFromEnv, isDryRun, optionalEnv, requireEnv } from './lib/env';
import { writeResult } from './lib/result';
import type { ReleaseInput } from '../src/lib/types';

interface GenerateEmailPayload {
  release: ReleaseInput;
  mastersLink?: string;
  artworkLink?: string;
  recipientOverride?: string;
  /** If set, this run only sends an already-created draft — it does not regenerate or recreate anything. */
  sendDraftId?: string;
}

async function main() {
  const requestId = requireEnv('REQUEST_ID');
  const payload: GenerateEmailPayload = JSON.parse(requireEnv('PAYLOAD_JSON'));
  const dryRun = isDryRun();

  if (payload.sendDraftId) {
    if (dryRun) {
      writeResult(requestId, { ok: true, dryRun: true, wouldSendDraftId: payload.sendDraftId });
      return;
    }
    const auth = googleAuthFromEnv();
    await sendGmailDraft(auth, payload.sendDraftId);
    writeResult(requestId, { ok: true, sent: true, draftId: payload.sendDraftId });
    return;
  }

  const release = buildRelease(payload.release);
  const recipient = payload.recipientOverride || optionalEnv('GMAIL_DRAFT_RECIPIENT', 'meanwhilerec@gmail.com');

  const draft = generateEmailDraft(
    { release, mastersLink: payload.mastersLink, artworkLink: payload.artworkLink },
    recipient
  );

  if (dryRun) {
    writeResult(requestId, { ok: true, dryRun: true, draft });
    console.log('[DRY RUN] Email draft body:\n', draft.body);
    return;
  }

  const auth = googleAuthFromEnv();
  const { draftId } = await createGmailDraft(auth, draft);

  writeResult(requestId, { ok: true, draftId, draft });
}

main().catch((err) => {
  console.error(err);
  const requestId = process.env.REQUEST_ID;
  if (requestId) {
    writeResult(requestId, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
  process.exitCode = 1;
});
