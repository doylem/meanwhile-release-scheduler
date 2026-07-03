import { formatFridayLong } from './scheduling';
import type { EmailDraft, EmailDraftInput, Release } from './types';

const DEFAULT_RECIPIENT = process.env.GMAIL_DRAFT_RECIPIENT || 'meanwhilerec@gmail.com';

function buildRoyaltyLines(release: Release): string[] {
  const genreLine = release.genre || '';
  const royaltyLine = release.royaltyNotes || '';
  if (genreLine && royaltyLine) return [`${genreLine}, ${royaltyLine}`];
  if (genreLine) return [genreLine];
  if (royaltyLine) return [royaltyLine];
  return [];
}

function trackTitle(t: Release['tracks'][number]): string {
  return t.remixArtist ? `${t.title} (${t.remixArtist} Remix)` : t.title;
}

export function generateEmailDraft(input: EmailDraftInput, recipient: string = DEFAULT_RECIPIENT): EmailDraft {
  const { release } = input;

  const subject = `${release.catalogueNumber} - ${release.artist} - Release assets`;

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
    ...buildRoyaltyLines(release),
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
