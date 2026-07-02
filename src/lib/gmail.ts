import { google } from 'googleapis';
import type { GoogleAuthConfig } from './calendar';
import type { EmailDraft } from './types';

function createGmailClient(config: GoogleAuthConfig) {
  const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret);
  oauth2Client.setCredentials({ refresh_token: config.refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function encodeMimeMessage(draft: EmailDraft): string {
  const lines = [
    `To: ${draft.recipient}`,
    `Subject: ${draft.subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    draft.body,
  ];
  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Creates a Gmail draft (does NOT send). The app always shows a preview
 * and requires an explicit Send action separately — see scripts/generate-email.ts.
 *
 * Required scope: https://www.googleapis.com/auth/gmail.compose
 * (compose covers creating/updating drafts; it deliberately does not grant
 * read access to the rest of the mailbox.)
 */
export async function createGmailDraft(config: GoogleAuthConfig, draft: EmailDraft): Promise<{ draftId: string }> {
  const gmail = createGmailClient(config);
  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: { raw: encodeMimeMessage(draft) },
    },
  });
  return { draftId: res.data.id ?? '' };
}

/** Sends an existing draft. Only ever called after explicit user confirmation in the UI. */
export async function sendGmailDraft(config: GoogleAuthConfig, draftId: string): Promise<void> {
  const gmail = createGmailClient(config);
  await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
}
