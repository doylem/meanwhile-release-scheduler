import { useEffect, useRef, useState } from 'react';
import { generateEmailDraft } from '../lib/email';
import { useWorkflowAction, type ActionStatus } from '../lib/useWorkflowAction';
import { isFriday, nextFriday } from '../lib/scheduling';
import { useSettings } from '../lib/useSettings';
import { findLabel } from '../lib/settings';
import type { DropboxAssetCategory, DropboxAssetStatus, Release, ReleaseState } from '../lib/types';

type DuplicateMode = 'cancel' | 'create-missing' | 'recreate-all' | 'update-existing';

interface CreateReleaseResult {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  cancelled?: boolean;
  existingEventCountBeforeRun?: number;
  events?: { taskId: string; eventId: string; htmlLink?: string }[];
}

interface DropboxResult extends Partial<DropboxAssetStatus> {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  sharedLinks?: Partial<Record<DropboxAssetCategory, string>>;
}

interface EmailResult {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
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

type SectionKey = 'dropbox' | 'calendar' | 'email' | 'artwork' | 'move';

export function ReleaseDetail({
  release,
  releaseState,
  onReleaseMoved,
  onScheduled,
  onStateChange,
  dryRun,
}: {
  release: Release;
  releaseState?: ReleaseState;
  onReleaseMoved: (r: Release) => void;
  onScheduled?: () => void;
  onStateChange?: () => void;
  dryRun: boolean;
}) {
  const { settings } = useSettings();
  const label = findLabel(settings.labels, release.label);
  const features = settings.features;

  const dropbox = useWorkflowAction<DropboxResult>('check-dropbox-assets.yml');
  const calendar = useWorkflowAction<CreateReleaseResult>('create-release.yml');
  const email = useWorkflowAction<EmailResult>('generate-gmail-draft.yml');
  const move = useWorkflowAction<MoveResult>('move-release.yml');

  const [mode, setMode] = useState<DuplicateMode>('create-missing');
  const [mastersLinkOverride, setMastersLinkOverride] = useState('');
  const [artworkLinkOverride, setArtworkLinkOverride] = useState('');
  const [newDate, setNewDate] = useState('');
  const [moveDateError, setMoveDateError] = useState<string | null>(null);
  const defaultSection: SectionKey = features.dropbox
    ? 'dropbox'
    : features.calendar
    ? 'calendar'
    : features.email
    ? 'email'
    : 'move';
  const [openSection, setOpenSection] = useState<SectionKey>(defaultSection);
  const [confirmSend, setConfirmSend] = useState(false);

  const mastersLink = mastersLinkOverride || dropbox.result?.sharedLinks?.masters;
  const artworkLink = artworkLinkOverride || dropbox.result?.sharedLinks?.artwork;
  const emailPreview = generateEmailDraft({ release, mastersLink, artworkLink });

  // Editable email body — auto-updates when Dropbox links first resolve, stays put after manual edits
  const [emailBody, setEmailBody] = useState(emailPreview.body);
  const [emailBodyEdited, setEmailBodyEdited] = useState(false);
  const prevLinksRef = useRef({ mastersLink, artworkLink });
  useEffect(() => {
    const prev = prevLinksRef.current;
    if (!emailBodyEdited && (prev.mastersLink !== mastersLink || prev.artworkLink !== artworkLink)) {
      setEmailBody(generateEmailDraft({ release, mastersLink, artworkLink }).body);
    }
    prevLinksRef.current = { mastersLink, artworkLink };
  }, [mastersLink, artworkLink, release, emailBodyEdited]);

  const dropboxDone = Boolean(dropbox.result?.ok);
  const calendarDone = Boolean(calendar.result?.ok && !calendar.result.cancelled);
  const emailDone = Boolean(email.result?.sent);

  // Auto-progress: Dropbox done → open next enabled section
  useEffect(() => {
    if (dropbox.result?.ok) {
      if (features.calendar) setOpenSection('calendar');
      else if (features.email) setOpenSection('email');
      if (!dropbox.result.dryRun) onStateChange?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropbox.result]);

  // Auto-progress: Calendar events created → open email if enabled
  useEffect(() => {
    if (calendar.result?.ok && !calendar.result.cancelled) {
      if (features.email) setOpenSection('email');
      if (!calendar.result.dryRun) onStateChange?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar.result]);

  // Notify parent when calendar events are successfully created
  useEffect(() => {
    if (calendarDone) onScheduled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarDone]);

  // Notify parent when email is drafted; open artwork step when email is sent
  useEffect(() => {
    if (email.result?.draftId && !email.result.dryRun) onStateChange?.();
    if (email.result?.sent) setOpenSection('artwork');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.result]);

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
      <div className="rounded-xl border border-wire/20 bg-elevated/40 px-6 py-5 flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <p className="font-mono font-semibold text-snow text-lg">
            {label.shortCode} {release.catalogueNumber} — {release.artist}
          </p>
          <p className="text-sm font-mono text-muted mt-1">
            {release.releaseTitle} · {formatDate(release.releaseDateISO)}
          </p>
          {/* Persistent history from state file */}
          {releaseState && (releaseState.dropbox || releaseState.calendar || releaseState.email) && (
            <div className="flex gap-2 flex-wrap mt-3">
              {releaseState.dropbox && (
                <span className="text-[10px] font-mono text-lime/80 bg-lime/8 border border-lime/20 rounded-full px-2.5 py-1">
                  ✓ Assets checked {shortDate(releaseState.dropbox.checkedAt)}
                </span>
              )}
              {releaseState.calendar && (
                <span className="text-[10px] font-mono text-cyan/80 bg-cyan/8 border border-cyan/20 rounded-full px-2.5 py-1">
                  ✓ Scheduled {shortDate(releaseState.calendar.scheduledAt)} · {releaseState.calendar.eventCount} events
                </span>
              )}
              {releaseState.email && (
                <span className="text-[10px] font-mono text-violet-400/80 bg-violet-400/8 border border-violet-400/20 rounded-full px-2.5 py-1">
                  ✓ Email drafted {shortDate(releaseState.email.draftedAt)}
                </span>
              )}
            </div>
          )}
        </div>
        {releaseState?.coverArtUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={releaseState.coverArtUrl}
            alt="Cover art"
            className="w-20 h-20 rounded-xl object-cover flex-shrink-0 border border-wire/20"
          />
        )}
      </div>

      {/* Step progress — only shows enabled features */}
      {(features.dropbox || features.calendar || features.email) && (
        <StepProgress
          steps={[
            features.dropbox && { label: 'Check files', done: dropboxDone },
            features.calendar && { label: 'Calendar events', done: calendarDone },
            features.email && { label: 'Send email', done: emailDone },
          ].filter((s): s is { label: string; done: boolean } => Boolean(s))}
        />
      )}

      {/* 1. Check release files */}
      {features.dropbox && <CollapsibleSection
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
          {dropbox.status === 'dispatching'
            ? 'Dispatching…'
            : dropbox.status === 'waiting'
            ? 'Checking files…'
            : dropboxDone
            ? 'Re-check files'
            : 'Check release files'}
        </SecondaryButton>

        <WorkflowStatusNote status={dropbox.status} />
        {dropbox.error && <ErrorLine>{dropbox.error}</ErrorLine>}

        {dropbox.result && (
          <div className="space-y-3 mt-1">
            {dropbox.result.dryRun ? (
              <p className="text-xs font-mono text-gold">✓ Dry run — no Dropbox connection made</p>
            ) : dropbox.result.folderFound ? (
              <details>
                <summary className="text-xs font-mono text-lime cursor-pointer select-none">
                  ✓ Release folder found
                </summary>
                <p className="text-xs font-mono text-ghost mt-1 pl-4">{dropbox.result.folderPath}</p>
              </details>
            ) : (
              <p className="text-xs font-mono text-signal">✗ Release folder not found</p>
            )}

            {dropbox.result.categories && (
              <div className="flex gap-4 items-start">
                {dropbox.result.coverArtUrl && (
                  <img
                    src={dropbox.result.coverArtUrl}
                    alt="Release cover"
                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0 border border-wire/20"
                  />
                )}
                <ul className="grid grid-cols-2 gap-1.5 flex-1">
                  {Object.entries(dropbox.result.categories).map(([key, info]) => (
                    <li key={key} className="text-xs font-mono">
                      <span className="text-muted">{CATEGORY_LABELS[key as DropboxAssetCategory]}: </span>
                      <span className={info.found ? 'text-lime' : 'text-signal'}>
                        {info.found ? `✓ ${info.fileCount} file${info.fileCount === 1 ? '' : 's'}` : 'Missing'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
      </CollapsibleSection>}

      {/* 2. Create calendar events */}
      {features.calendar && <CollapsibleSection
        number={features.dropbox ? 2 : 1}
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
            {calendar.status === 'dispatching'
              ? 'Dispatching…'
              : calendar.status === 'waiting'
              ? 'Creating events…'
              : 'Create calendar events'}
          </PrimaryButton>
          <WorkflowStatusNote status={calendar.status} />
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
          <div className="rounded-lg border border-lime/20 bg-lime/5 px-4 py-3 mt-2 flex items-center justify-between gap-4">
            <p className="text-sm font-mono text-lime">
              ✓ {calendar.result?.events?.length ?? 0} event
              {(calendar.result?.events?.length ?? 0) === 1 ? '' : 's'} added to your calendar
              {calendar.result?.existingEventCountBeforeRun
                ? ` (${calendar.result.existingEventCountBeforeRun} already existed)`
                : ''}
            </p>
            <button
              onClick={() => setOpenSection('email')}
              className="text-xs font-mono text-lime border border-lime/25 rounded-lg px-3 py-1.5 hover:bg-lime/8 transition-colors whitespace-nowrap flex-shrink-0"
            >
              Next: send release email →
            </button>
          </div>
        )}
      </CollapsibleSection>}

      {/* 3. Send release email */}
      {features.email && <CollapsibleSection
        number={[features.dropbox, features.calendar].filter(Boolean).length + 1}
        title="Send release email"
        done={emailDone}
        open={openSection === 'email'}
        onToggle={() => toggle('email')}
      >
        <div className="space-y-3">
          {/* Header fields */}
          <div className="space-y-1 font-mono text-xs">
            <p><span className="text-muted">To: </span><span className="text-snow/80">{emailPreview.recipient}</span></p>
            <p><span className="text-muted">Subject: </span><span className="text-snow/80">{emailPreview.subject}</span></p>
          </div>

          {/* Editable body */}
          <div className="relative">
            <textarea
              value={emailBody}
              onChange={(e) => { setEmailBody(e.target.value); setEmailBodyEdited(true); }}
              rows={16}
              className="w-full rounded-lg bg-depth/80 border border-wire/20 px-3 py-3 text-xs font-mono text-snow/80 placeholder:text-ghost focus:outline-none focus:border-cyan/40 transition-colors resize-y leading-relaxed"
            />
            {emailBodyEdited && (
              <button
                onClick={() => { setEmailBody(emailPreview.body); setEmailBodyEdited(false); }}
                className="absolute top-2 right-2 text-[10px] font-mono text-ghost hover:text-muted transition-colors bg-depth/80 px-1.5 py-0.5 rounded"
              >
                ↺ Reset
              </button>
            )}
          </div>

          {emailPreview.missingAssets.length > 0 && (
            <p className="text-xs font-mono text-gold">Missing assets: {emailPreview.missingAssets.join(', ')}</p>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <PrimaryButton
              loading={email.status === 'waiting' || email.status === 'dispatching'}
              onClick={() => {
                setConfirmSend(false);
                email.run({ release, mastersLink, artworkLink, bodyOverride: emailBody }, { dryRun });
              }}
            >
              {email.status === 'dispatching'
                ? 'Dispatching…'
                : email.status === 'waiting'
                ? 'Creating draft…'
                : email.result?.draftId
                ? 'Regenerate draft'
                : 'Create Gmail draft'}
            </PrimaryButton>
            <WorkflowStatusNote status={email.status} />

            {email.result?.draftId && !email.result.sent && (
              !confirmSend ? (
                <SecondaryButton loading={false} onClick={() => setConfirmSend(true)}>
                  Send email
                </SecondaryButton>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-signal/20 bg-signal/8 px-4 py-3 flex-wrap w-full">
                  <p className="text-sm font-mono text-snow/80 flex-1 min-w-0">
                    Send to <span className="text-snow font-semibold">{emailPreview.recipient}</span>? This cannot be undone.
                  </p>
                  <button
                    onClick={() => { setConfirmSend(false); email.run({ release, sendDraftId: email.result!.draftId }, { dryRun }); }}
                    className="rounded-lg px-4 py-2 text-sm font-mono font-medium text-depth hover:opacity-90 transition-opacity"
                    style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 100%)' }}
                  >
                    Yes, send
                  </button>
                  <button onClick={() => setConfirmSend(false)} className="text-sm font-mono text-muted hover:text-snow transition-colors">
                    Cancel
                  </button>
                </div>
              )
            )}
          </div>

          {email.result?.draftId && (
            <p className="text-xs font-mono text-lime">✓ Draft created in Gmail — open Gmail to review before sending.</p>
          )}
          {email.error && <ErrorLine>{email.error}</ErrorLine>}
          {email.result?.sent && (
            <p className="text-sm font-mono text-lime">✓ Email sent to {emailPreview.recipient}.</p>
          )}
        </div>
      </CollapsibleSection>}

      {/* Generate artwork */}
      <CollapsibleSection
        number={[features.dropbox, features.calendar, features.email].filter(Boolean).length + 1}
        title="Generate artwork"
        subtitle="Run in terminal"
        open={openSection === 'artwork'}
        onToggle={() => toggle('artwork')}
      >
        <p className="text-xs font-mono text-muted">
          Copy this command into your terminal to set up the Photoshop files in Dropbox.
        </p>
        <ArtworkCommand release={release} labelShortCode={label.shortCode} />
      </CollapsibleSection>

      {/* Move release date (optional) */}
      <CollapsibleSection
        number={[features.dropbox, features.calendar, features.email].filter(Boolean).length + 2}
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
          <p className="text-sm font-mono text-lime">
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
            done ? 'bg-lime/15 text-lime' : open ? 'bg-wire/20 text-snow' : 'border border-wire/20 text-ghost'
          }`}
        >
          {done ? '✓' : number}
        </span>
        <span className={`text-sm font-mono font-semibold flex-1 ${done ? 'text-lime/80' : open ? 'text-snow' : 'text-snow/55'}`}>
          {title}
          {subtitle && <span className="ml-2 text-xs font-normal text-ghost">{subtitle}</span>}
        </span>
        <span className="text-ghost text-xs font-mono">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 pb-5 space-y-3">{children}</div>}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
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
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-mono font-medium text-depth hover:opacity-90 disabled:opacity-70 transition-opacity"
      style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 100%)' }}
    >
      {loading && <Spinner />}
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
      className="inline-flex items-center gap-2 rounded-lg border border-wire/25 px-4 py-2 text-sm font-mono text-snow hover:bg-wire/10 hover:border-wire/40 disabled:opacity-70 transition-all"
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function WorkflowStatusNote({ status }: { status: ActionStatus }) {
  if (status !== 'dispatching' && status !== 'waiting') return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-mono text-muted">
        {status === 'dispatching'
          ? 'Sending to GitHub…'
          : 'Running on GitHub Actions · usually 30–60 sec'}
      </p>
      <div className="h-0.5 w-full rounded-full bg-wire/15 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan/50 to-violet-400/50"
          style={{ animation: 'workflow-progress 2s ease-in-out infinite' }}
        />
      </div>
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
    <p className="text-signal text-sm font-mono bg-signal/10 border border-signal/20 rounded-lg px-4 py-2.5">
      {children}
    </p>
  );
}

function ArtworkCommand({ release, labelShortCode }: { release: Release; labelShortCode: string }) {
  const [copied, setCopied] = useState(false);

  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const cmd = [
    './scripts/new-release.sh',
    labelShortCode,
    `"${esc(release.catalogueNumber)}"`,
    `"${esc(release.artist)}"`,
    `"${esc(release.releaseTitle)}"`,
    ...release.tracks.map((t) => `"${esc(t.title)}"`),
  ].join(' ');

  function copy() {
    navigator.clipboard.writeText(cmd).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-wire/15 bg-elevated/25 px-4 py-3 flex items-center gap-3 min-w-0">
      <span className="text-[10px] font-mono uppercase tracking-wider text-ghost flex-shrink-0">artwork</span>
      <code className="flex-1 text-xs font-mono text-snow/50 truncate min-w-0">{cmd}</code>
      <button
        onClick={copy}
        className="flex-shrink-0 text-xs font-mono text-cyan hover:text-cyan/70 transition-colors"
      >
        {copied ? '✓ copied' : 'copy'}
      </button>
    </div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const miniInputClass =
  'rounded-lg bg-depth/80 border border-wire/20 px-3 py-2 text-sm font-mono text-snow placeholder:text-ghost focus:outline-none focus:border-cyan/50 transition-colors w-full';

function StepProgress({ steps }: { steps: { label: string; done: boolean }[] }) {
  return (
    <div className="flex items-center px-1">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center flex-1 min-w-0">
          <div className={`flex items-center gap-2 text-xs font-mono ${step.done ? 'text-lime' : 'text-muted'}`}>
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                step.done ? 'bg-lime/15 text-lime' : 'border border-wire/25 text-ghost'
              }`}
            >
              {step.done ? '✓' : i + 1}
            </span>
            <span className="whitespace-nowrap">{step.label}</span>
          </div>
          {i < steps.length - 1 && <div className="flex-1 h-px bg-wire/15 mx-3 min-w-[12px]" />}
        </div>
      ))}
    </div>
  );
}
