import { formatFridayLong } from './scheduling';
import type { EmailDraft, EmailDraftInput, Release } from './types';

const DEFAULT_RECIPIENT = process.env.GMAIL_DRAFT_RECIPIENT || '';

function trackTitle(t: Release['tracks'][number]): string {
  return t.remixArtist ? `${t.title} (${t.remixArtist} Remix)` : t.title;
}

export function generateEmailDraft(input: EmailDraftInput, recipient: string = DEFAULT_RECIPIENT): EmailDraft {
  const { release } = input;

  const subject = `${release.catalogueNumber} - ${release.artist} - ${release.releaseTitle}`;

  const tracklist = release.tracks
    .map((t, i) => `${i + 1}. ${t.artist || release.artist} - ${trackTitle(t)}`)
    .join('\n');

  const mastersLink = input.mastersLink;
  const artworkLink = input.artworkLink;
  const missingAssets: string[] = [];

  const mastersLine = mastersLink ? mastersLink : 'Coming from Gavin';
  const artworkLine = artworkLink ? artworkLink : 'Coming from Matty';
  if (!mastersLink) missingAssets.push('masters');
  if (!artworkLink) missingAssets.push('artwork');

  const bodyParts = [
    `Hi James!`,
    ``,
    `Our next release is here, ${release.tracks.length} track${release.tracks.length === 1 ? '' : 's'} from ${release.artist}.`,
    ``,
    tracklist,
    ``,
    `Release Date: ${formatFridayLong(release.releaseDateISO)}`,
    ``,
  ];

  if (release.genre) {
    bodyParts.push(`Genre: ${release.genre}`, ``);
  }

  bodyParts.push(
    `MASTERS - ${mastersLine}`,
    ``,
    `ARTWORK - ${artworkLine}`,
    ``,
    `As usual a big thanks for helping us getting this one together!`,
    ``,
    `G&M`,
  );

  return {
    recipient,
    subject,
    body: bodyParts.join('\n'),
    mastersLink,
    artworkLink,
    missingAssets,
  };
}
