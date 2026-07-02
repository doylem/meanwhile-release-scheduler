import { formatFridayLong } from './scheduling';
import type { EmailDraft, EmailDraftInput } from './types';

const DEFAULT_RECIPIENT = process.env.GMAIL_DRAFT_RECIPIENT || 'meanwhilerec@gmail.com';

export function generateEmailDraft(input: EmailDraftInput, recipient: string = DEFAULT_RECIPIENT): EmailDraft {
  const { release } = input;

  const subject = `${release.catalogueNumber} - ${release.artist} - Release assets`;

  const tracklist = release.tracks.map((t, i) => `${i + 1}. ${release.artist} - ${t.title}`).join('\n');

  const mastersLink = input.mastersLink;
  const artworkLink = input.artworkLink;
  const missingAssets: string[] = [];

  const mastersLine = mastersLink ? mastersLink : 'Coming from Gavin';
  const artworkLine = artworkLink ? artworkLink : 'Coming from Matty';
  if (!mastersLink) missingAssets.push('masters');
  if (!artworkLink) missingAssets.push('artwork');

  const body = [
    `Hi James!`,
    ``,
    `Our next release is here, ${release.tracks.length} tracks from ${release.artist}.`,
    ``,
    `As semi usual we are racing the clock a bit and appreciate you pulling this together!`,
    ``,
    tracklist,
    ``,
    `Release Date: ${formatFridayLong(release.releaseDateISO)}`,
    ``,
    `${release.genre}, ${release.royaltyNotes}`,
    ``,
    `MASTERS - ${mastersLine}`,
    ``,
    `ARTWORK - ${artworkLine}`,
    ``,
    `As usual a big thanks for helping us getting this one together!`,
    ``,
    `G&M`,
  ].join('\n');

  return {
    recipient,
    subject,
    body,
    mastersLink,
    artworkLink,
    missingAssets,
  };
}
