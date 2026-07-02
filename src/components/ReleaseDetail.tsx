import { useState } from 'react';
import { LABELS } from '../../config/labels.config';
import { generateEmailDraft } from '../lib/email';
import { useWorkflowAction } from '../lib/useWorkflowAction';
import { isFriday, nextFriday } from '../lib/scheduling';
import type { DropboxAssetCategory, DropboxAssetStatus, Release } from '../lib/types';

type DuplicateMode = 'cancel' | 'create-missing' | 'recreate-all' | 'update-existing';

interface CreateReleaseResult {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  cancelled?: boolean;
  existingEventCountBeforeRun?: number;
  events?: { taskId: string; eventId: string; htmlLink?: string }[];
}

interface DropboxResult extends DropboxAssetStatus {
  ok: boolean;
  error?: string;
  sharedLinks?: Partial<Record<DropboxAssetCategory, string>>;
}

interface EmailResult {
  ok: boolean;
  error?: string;
  draftId?: string;
  sent?: boolean;
  draft?: { subject: string; body: string; recipient: string };
}

interface MoveResult {
  ok: boolean;
  error?: string;
  newReleaseId?: string;
  updatedEvents?: { taskId: string; eventId: string }[];
  createdEvents?: { taskId: string; eventId: string }[];
}

const CATEGORY_LABELS: Record<DropboxAssetCategory, string> = {
  masters: 'Masters',
  artwork: 'Artwork',
  videos: 'Videos',
  assets: 'Assets',
  premasters: 'Premasters',
  remixPacks: 'Remix packs',
};

export function ReleaseDetail({
  release,
  onReleaseMoved,
  dryRun,
}: {
  release: Release;
  onReleaseMoved: (r: Release) => void;
  dryRun: boolean;
}) {
  const label = LABELS[release.label];

  const dropbox = useWorkflowAction<DropboxResult>('check-dropbox-assets.yml');
  const calendar = useWorkflowAction<CreateReleaseResult>('create-release.yml');
  const email = useWorkflowAction<EmailResult>('generate-gmail-draft.yml');
  const move = useWorkflowAction<MoveResult>('move-release.yml');

  const [mode, setMode] = useState<DuplicateMode>('create-missing');
  const [mastersLinkOverride, setMastersLinkOverride] = useState('');
  const [artworkLinkOverride, setArtworkLinkOverride] = useState('');
  const [newDate, setNewDate] = useState('');
  const [moveDateError, setMoveDateError] = useState<string | null>(null);

  const mastersLink = mastersLinkOverride || dropbox.result?.sharedLinks?.masters;
  const artworkLink = artworkLinkOverride || dropbox.result?.sharedLinks?.artwork;
  const emailPreview = generateEmailDraft({ release, mastersLink, artworkLink });

  function submitMove() {
    if (!newDate) {
      setMoveDateError('Pick a new release date.');
      return;
    }
    if (!isFriday(newDate)) {
      setMoveDateError(`Not a Friday. Did you mean ${nextFriday(newDate)}?`);
      return;
    }
    setMoveDateError(null);
    move.run({ currentRelease: release, newReleaseDateISO: newDate }, { dryRun }).then(() => {
      if (move.result?.ok) {
        onReleaseMoved({
          ...release,
          releaseDateISO: newDate,
          releaseId: move.result.newReleaseId ?? release.releaseId,
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-wire/20 bg-elevated/40 px-6 py-5">
        <p className="font-mono font-semibold text-snow text-lg">
          {label.shortCode} {release.catalogueNumber} — {release.artist}
        </p>
        <p className="text-sm font-mono text-muted mt-1">
          {release.releaseTitle} · {release.releaseDateISO} · ID{' '}
          <span className="text-ghost">{release.releaseId}</span>
        </p>
      </div>

      {/* Dropbox assets */}
      <Section title="Dropbox assets">
        <div className="flex items-center gap-3">
          <SecondaryButton
            onClick={() => dropbox.run({ catalogueNumber: release.catalogueNumber }, { dryRun })}
          >
            {dropbox.status === 'waiting' || dropbox.status === 'dispatching'
              ? 'Checking…'
              : 'Check Dropbox assets'}
          </SecondaryButton>
        </div>

        {dropbox.error && <ErrorLine>{dropbox.error}</ErrorLine>}

        {dropbox.result && (
          <div className="space-y-3 mt-2">
            <p className="text-xs font-mono text-muted">
              Folder:{' '}
              <span className={dropbox.result.folderFound ? 'text-cyan' : 'text-signal'}>
                {dropbox.result.folderFound ? dropbox.result.folderPath : 'Missing'}
              </span>
            </p>
            <ul className="grid grid-cols-2 gap-1.5">
              {Object.entries(dropbox.result.categories).map(([key, info]) => (
                <li key={key} className="text-xs font-mono">
                  <span className="text-muted">{CATEGORY_LABELS[key as DropboxAssetCategory]}: </span>
                  <span className={info.found ? 'text-cyan' : 'text-signal'}>
                    {info.found ? `✓ ${info.fileCount} file${info.fileCount === 1 ? '' : 's'}` : 'Missing'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-3">
          <MiniField label="Masters link override">
            <input
              value={mastersLinkOverride}
              onChange={(e) => setMastersLinkOverride(e.target.value)}
              placeholder="Paste a Dropbox link"
              className={miniInputClass}
            />
          </MiniField>
          <MiniField label="Artwork link override">
            <input
              value={artworkLinkOverride}
              onChange={(e) => setArtworkLinkOverride(e.target.value)}
              placeholder="Paste a Dropbox link"
              className={miniInputClass}
            />
          </MiniField>
        </div>
      </Section>

      {/* Calendar events */}
      <Section title="Calendar events">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as DuplicateMode)}
            className={miniInputClass + ' w-auto'}
          >
            <option value="create-missing">Create missing only</option>
            <option value="recreate-all">Recreate all events</option>
            <option value="update-existing">Update existing events</option>
            <option value="cancel">Cancel (check first)</option>
          </select>
          <PrimaryButton onClick={() => calendar.run({ release, mode }, { dryRun })}>
            {calendar.status === 'waiting' || calendar.status === 'dispatching'
              ? 'Working…'
              : 'Create calendar events'}
          </PrimaryButton>
        </div>
        {calendar.error && <ErrorLine>{calendar.error}</ErrorLine>}
        {calendar.result && (
          <p className="text-xs font-mono text-muted mt-1">
            {calendar.result.cancelled
              ? `Found ${calendar.result.existingEventCountBeforeRun} existing event(s) — nothing changed. Choose a different mode to act.`
              : `${calendar.result.events?.length ?? 0} event(s) created/updated.${
                  calendar.result.existingEventCountBeforeRun
                    ? ` (${calendar.result.existingEventCountBeforeRun} already existed)`
                    : ''
                }`}
          </p>
        )}
      </Section>

      {/* Email draft */}
      <Section title="Release email">
        <div className="rounded-lg border border-wire/10 bg-void/40 p-4 space-y-1.5 font-mono text-xs">
          <p>
            <span className="text-muted">To: </span>
            <span className="text-snow/80">{emailPreview.recipient}</span>
          </p>
          <p>
            <span className="text-muted">Subject: </span>
            <span className="text-snow/80">{emailPreview.subject}</span>
          </p>
          <pre className="whitespace-pre-wrap text-snow/55 mt-2 leading-relaxed">{emailPreview.body}</pre>
          {emailPreview.missingAssets.length > 0 && (
            <p className="text-gold">Missing: {emailPreview.missingAssets.join(', ')}</p>
          )}
        </div>
        <div className="flex gap-3 mt-3 flex-wrap">
          <PrimaryButton onClick={() => email.run({ release, mastersLink, artworkLink }, { dryRun })}>
            {email.status === 'waiting' || email.status === 'dispatching'
              ? 'Creating draft…'
              : 'Generate email draft'}
          </PrimaryButton>
          {email.result?.draftId && (
            <SecondaryButton
              onClick={() => email.run({ release, sendDraftId: email.result!.draftId }, { dryRun })}
            >
              Send draft
            </SecondaryButton>
          )}
        </div>
        {email.error && <ErrorLine>{email.error}</ErrorLine>}
        {email.result?.draftId && (
          <p className="text-xs font-mono text-muted mt-1">Gmail draft created (id: {email.result.draftId})</p>
        )}
        {email.result?.sent && <p className="text-xs font-mono text-cyan mt-1">✓ Sent.</p>}
      </Section>

      {/* Move release date */}
      <Section title="Move release date">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className={miniInputClass + ' w-auto'}
          />
          <SecondaryButton onClick={submitMove}>
            {move.status === 'waiting' || move.status === 'dispatching' ? 'Updating…' : 'Move & update events'}
          </SecondaryButton>
        </div>
        {moveDateError && <ErrorLine>{moveDateError}</ErrorLine>}
        {move.error && <ErrorLine>{move.error}</ErrorLine>}
        {move.result?.ok && (
          <p className="text-xs font-mono text-muted mt-1">
            Moved to {newDate}. Updated {move.result.updatedEvents?.length ?? 0}, created{' '}
            {move.result.createdEvents?.length ?? 0} new event(s).
          </p>
        )}
      </Section>
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-4 py-2 text-sm font-mono font-medium text-depth hover:opacity-90 transition-opacity"
      style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #4a8cf7 100%)' }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-wire/25 px-4 py-2 text-sm font-mono text-snow hover:bg-wire/10 hover:border-wire/40 transition-all"
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-wire/20 bg-elevated/30 p-6 space-y-4">
      <p className="text-xs font-mono uppercase tracking-wider text-muted">{title}</p>
      {children}
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-mono uppercase tracking-wider text-muted mb-2">{label}</span>
      {children}
    </label>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-signal text-sm font-mono bg-signal/10 border border-signal/20 rounded-lg px-4 py-2.5 mt-1">
      {children}
    </p>
  );
}

const miniInputClass =
  'rounded-lg bg-depth/80 border border-wire/20 px-3 py-2 text-sm font-mono text-snow placeholder:text-ghost focus:outline-none focus:border-cyan/50 transition-colors w-full';
