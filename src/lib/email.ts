import { formatFridayLong } from './scheduling';
import type { EmailDraft, EmailDraftInput, Release } from './types';

const DEFAULT_RECIPIENT = process.env.GMAIL_DRAFT_RECIPIENT || 'meanwhilerec@gmail.com';

function buildRoyaltyLines(release: Release): string[] {
  const allSameRate = release.tracks.every((t) => !t.royaltyRate || t.royaltyRate === release.royaltyRate);
  if (allSameRate) {
    return [`${release.genre}, ${release.royaltyNotes}`];
  }
  return [
    `${release.genre}`,
    ``,
    `Royalties:`,
    ...release.tracks.map((t, i) => {
      const rate = t.royaltyRate || release.royaltyRate;
      const artist = t.artist || release.artist;
      return `${i + 1}. ${artist} - ${t.title}: ${rate}`;
    }),
  ];
}

export function generateEmailDraft(input: EmailDraftInput, recipient: string = DEFAULT_RECIPIENT): EmailDraft {
  const { release } = input;

  const subject = `${release.catalogueNumber} - ${release.artist} - Release assets`;

  const tracklist = release.tracks
    .map((t, i) => `${i + 1}. ${t.artist || release.artist} - ${t.title}`)
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
