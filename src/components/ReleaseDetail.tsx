import { useEffect, useState } from 'react';
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

type SectionKey = 'dropbox' | 'calendar' | 'email' | 'move';

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
  const [openSection, setOpenSection] = useState<SectionKey>('dropbox');
  const [confirmSend, setConfirmSend] = useState(false);

  const mastersLink = mastersLinkOverride || dropbox.result?.sharedLinks?.masters;
  const artworkLink = artworkLinkOverride || dropbox.result?.sharedLinks?.artwork;
  const emailPreview = generateEmailDraft({ release, mastersLink, artworkLink });

  const dropboxDone = Boolean(dropbox.result?.ok);
  const calendarDone = Boolean(calendar.result?.ok && !calendar.result.cancelled);
  const emailDone = Boolean(email.result?.sent);

  // Auto-progress: Dropbox done → open calendar
  useEffect(() => {
    if (dropbox.result?.ok) setOpenSection('calendar');
  }, [dropbox.result]);

  // Auto-progress: Calendar events created → open email
  useEffect(() => {
    if (calendar.result?.ok && !calendar.result.cancelled) setOpenSection('email');
  }, [calendar.result]);

  function toggle(section: SectionKey) {
    setOpenSection((prev) => (prev === section ? 'dropbox' : section));
  }

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
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-wire/20 bg-elevated/40 px-6 py-5">
        <p className="font-mono font-semibold text-snow text-lg">
          {label.shortCode} {release.catalogueNumber} — {release.artist}
        </p>
        <p className="text-sm font-mono text-muted mt-1">
          {release.releaseTitle} · {formatDate(release.releaseDateISO)}
        </p>
      </div>

      {/* Step progress */}
      <div className="flex items-center px-1">
        {[
          { label: 'Check files', done: dropboxDone },
          { label: 'Calendar events', done: calendarDone },
          { label: 'Send email', done: emailDone },
        ].map((step, i, arr) => (
          <div key={step.label} className="flex items-center flex-1 min-w-0">
            <div className={`flex items-center gap-2 text-xs font-mono ${step.done ? 'text-cyan' : 'text-muted'}`}>
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                  step.done ? 'bg-cyan/20 text-cyan' : 'border border-wire/25 text-ghost'
                }`}
              >
                {step.done ? '✓' : i + 1}
              </span>
              <span className="whitespace-nowrap">{step.label}</span>
            </div>
            {i < arr.length - 1 && <div className="flex-1 h-px bg-wire/15 mx-3 min-w-[12px]" />}
          </div>
        ))}
      </div>

      {/* 1. Check release files */}
      <CollapsibleSection
        number={1}
        title="Check release files"
        done={dropboxDone}
        open={openSection === 'dropbox'}
        onToggle={() => toggle('dropbox')}
      >
        <SecondaryButton
          loading={dropbox.status === 'waiting' || dropbox.status === 'dispatching'}
          onClick={() => dropbox.run({ catalogueNumber: release.catalogueNumber }, { dryRun })}
        >
          {dropbox.status === 'waiting' || dropbox.status === 'dispatching'
            ? 'Checking…'
            : dropboxDone
            ? 'Re-check files'
            : 'Check release files'}
        </SecondaryButton>

        {dropbox.error && <ErrorLine>{dropbox.error}</ErrorLine>}

        {dropbox.result && (
          <div className="space-y-3 mt-1">
            {dropbox.result.folderFound ? (
              <details>
                <summary className="text-xs font-mono text-cyan cursor-pointer select-none">
                  ✓ Release folder found
                </summary>
                <p className="text-xs font-mono text-ghost mt-1 pl-4">{dropbox.result.folderPath}</p>
              </details>
            ) : (
              <p className="text-xs font-mono text-signal">✗ Release folder not found</p>
            )}

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

            <div className="grid grid-cols-2 gap-3 pt-1">
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
          </div>
        )}
      </CollapsibleSection>

      {/* 2. Create calendar events */}
      <CollapsibleSection
        number={2}
        title="Create calendar events"
        done={calendarDone}
        open={openSection === 'calendar'}
        onToggle={() => toggle('calendar')}
      >
        <div className="space-y-3">
          <MiniField label="If events already exist:">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as DuplicateMode)}
              className={miniInputClass}
            >
              <option value="create-missing">Only add what's missing</option>
              <option value="recreate-all">Delete and recreate everything</option>
              <option value="update-existing">Update times on existing events</option>
              <option value="cancel">Don't change anything — just check</option>
            </select>
          </MiniField>
          <PrimaryButton
            loading={calendar.status === 'waiting' || calendar.status === 'dispatching'}
            onClick={() => calendar.run({ release, mode }, { dryRun })}
          >
            {calendar.status === 'waiting' || calendar.status === 'dispatching'
              ? 'Working…'
              : 'Create calendar events'}
          </PrimaryButton>
        </div>

        {calendar.error && <ErrorLine>{calendar.error}</ErrorLine>}

        {calendar.result?.cancelled && (
          <div className="rounded-lg border border-gold/30 bg-gold/8 px-4 py-3 mt-2">
            <p className="text-sm font-mono font-semibold text-gold">
              Found {calendar.result.existingEventCountBeforeRun} existing event
              {calendar.result.existingEventCountBeforeRun === 1 ? '' : 's'} — nothing changed.
            </p>
            <p className="text-xs font-mono text-gold/70 mt-1">
              To update them, change the setting above to "Update times on existing events" or "Delete and recreate
              everything".
            </p>
          </div>
        )}

        {calendarDone && (
          <div className="rounded-lg border border-cyan/25 bg-cyan/8 px-4 py-3 mt-2 flex items-center justify-between gap-4">
            <p className="text-sm font-mono text-cyan">
              ✓ {calendar.result?.events?.length ?? 0} event
              {(calendar.result?.events?.length ?? 0) === 1 ? '' : 's'} added to your calendar
              {calendar.result?.existingEventCountBeforeRun
                ? ` (${calendar.result.existingEventCountBeforeRun} already existed)`
                : ''}
            </p>
            <button
              onClick={() => setOpenSection('email')}
              className="text-xs font-mono text-cyan border border-cyan/30 rounded-lg px-3 py-1.5 hover:bg-cyan/10 transition-colors whitespace-nowrap flex-shrink-0"
            >
              Next: send release email →
            </button>
          </div>
        )}
      </CollapsibleSection>

      {/* 3. Send release email */}
      <CollapsibleSection
        number={3}
        title="Send release email"
        done={emailDone}
        open={openSection === 'email'}
        onToggle={() => toggle('email')}
      >
        <div className="space-y-4">
          <PrimaryButton
            loading={email.status === 'waiting' || email.status === 'dispatching'}
            onClick={() => {
              setConfirmSend(false);
              email.run({ release, mastersLink, artworkLink }, { dryRun });
            }}
          >
            {email.status === 'waiting' || email.status === 'dispatching'
              ? 'Creating draft…'
              : email.result?.draftId
              ? 'Regenerate draft'
              : 'Generate email draft'}
          </PrimaryButton>

          {email.result?.draftId && (
            <div className="rounded-lg border border-wire/15 bg-void/40 p-4 space-y-2 font-mono text-xs">
              <p className="text-xs font-mono uppercase tracking-wider text-muted mb-3">
                Email preview — not sent yet
              </p>
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
          )}

          {email.result?.draftId && !email.result.sent && (
            <div>
              {!confirmSend ? (
                <SecondaryButton loading={false} onClick={() => setConfirmSend(true)}>
                  Send email
                </SecondaryButton>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-signal/20 bg-signal/8 px-4 py-3 flex-wrap">
                  <p className="text-sm font-mono text-snow/80 flex-1 min-w-0">
                    Send to <span className="text-snow font-semibold">{emailPreview.recipient}</span>? This cannot be
                    undone.
                  </p>
                  <button
                    onClick={() => {
                      setConfirmSend(false);
                      email.run({ release, sendDraftId: email.result!.draftId }, { dryRun });
                    }}
                    className="rounded-lg px-4 py-2 text-sm font-mono font-medium text-depth hover:opacity-90 transition-opacity"
                    style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #4a8cf7 100%)' }}
                  >
                    Yes, send
                  </button>
                  <button
                    onClick={() => setConfirmSend(false)}
                    className="text-sm font-mono text-muted hover:text-snow transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {email.error && <ErrorLine>{email.error}</ErrorLine>}
          {email.result?.sent && (
            <p className="text-sm font-mono text-cyan">✓ Email sent to {emailPreview.recipient}.</p>
          )}
        </div>
      </CollapsibleSection>

      {/* 4. Move release date (optional) */}
      <CollapsibleSection
        number={4}
        title="Move release date"
        subtitle="Optional"
        done={move.result?.ok}
        open={openSection === 'move'}
        onToggle={() => toggle('move')}
      >
        <p className="text-xs font-mono text-muted">
          This will reschedule all {release.tasks.length} calendar event
          {release.tasks.length === 1 ? '' : 's'} to the new date.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className={miniInputClass + ' w-auto'}
          />
          <SecondaryButton
            loading={move.status === 'waiting' || move.status === 'dispatching'}
            onClick={submitMove}
          >
            {move.status === 'waiting' || move.status === 'dispatching' ? 'Updating…' : 'Move & update events'}
          </SecondaryButton>
        </div>
        {moveDateError && <ErrorLine>{moveDateError}</ErrorLine>}
        {move.error && <ErrorLine>{move.error}</ErrorLine>}
        {move.result?.ok && (
          <p className="text-sm font-mono text-cyan">
            ✓ Moved to {formatDate(newDate)}. Updated {move.result.updatedEvents?.length ?? 0}, created{' '}
            {move.result.createdEvents?.length ?? 0} new event
            {(move.result.createdEvents?.length ?? 0) === 1 ? '' : 's'}.
          </p>
        )}
      </CollapsibleSection>
    </div>
  );
}

function CollapsibleSection({
  number,
  title,
  subtitle,
  done,
  open,
  onToggle,
  children,
}: {
  number: number;
  title: string;
  subtitle?: string;
  done?: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border transition-colors ${
        open ? 'border-wire/30 bg-elevated/35' : 'border-wire/15 bg-elevated/15'
      }`}
    >
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 text-left">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-semibold flex-shrink-0 ${
            done ? 'bg-cyan/20 text-cyan' : open ? 'bg-wire/20 text-snow' : 'border border-wire/20 text-ghost'
          }`}
        >
          {done ? '✓' : number}
        </span>
        <span className={`text-sm font-mono font-semibold flex-1 ${done ? 'text-cyan/80' : open ? 'text-snow' : 'text-snow/55'}`}>
          {title}
          {subtitle && <span className="ml-2 text-xs font-normal text-ghost">{subtitle}</span>}
        </span>
        <span className="text-ghost text-xs font-mono">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 pb-5 space-y-3">{children}</div>}
    </div>
  );
}

function PrimaryButton({
  onClick,
  children,
  loading,
}: {
  onClick: () => void;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="rounded-lg px-4 py-2 text-sm font-mono font-medium text-depth hover:opacity-90 disabled:opacity-60 transition-opacity"
      style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #4a8cf7 100%)' }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  children,
  loading,
}: {
  onClick: () => void;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="rounded-lg border border-wire/25 px-4 py-2 text-sm font-mono text-snow hover:bg-wire/10 hover:border-wire/40 disabled:opacity-60 transition-all"
    >
      {children}
    </button>
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
    <p className="text-signal text-sm font-mono bg-signal/10 border border-signal/20 rounded-lg px-4 py-2.5">
      {children}
    </p>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const miniInputClass =
  'rounded-lg bg-depth/80 border border-wire/20 px-3 py-2 text-sm font-mono text-snow placeholder:text-ghost focus:outline-none focus:border-cyan/50 transition-colors w-full';
