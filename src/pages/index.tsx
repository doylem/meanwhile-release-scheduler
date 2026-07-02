import { useEffect, useState } from 'react';
import { GithubConnectGate } from '../components/GithubConnectGate';
import { PasswordGate } from '../components/PasswordGate';
import { ReleaseDetail } from '../components/ReleaseDetail';
import { ReleaseForm } from '../components/ReleaseForm';
import { ReleasePreview } from '../components/ReleasePreview';
import { GithubConnectionProvider } from '../lib/githubConnection';
import { buildRelease } from '../lib/release';
import { NotAFridayError } from '../lib/scheduling';
import { LABELS, SEED_RELEASES } from '../../config/labels.config';
import { suggestNextCatalogueNumber } from '../lib/catalogue';
import { useReleaseManifest, type ManifestEntry } from '../lib/useReleaseManifest';
import type { Release, ReleaseInput } from '../lib/types';

export default function Home() {
  return (
    <PasswordGate>
      <GithubConnectionProvider>
        <App />
      </GithubConnectionProvider>
    </PasswordGate>
  );
}

type ModalStep = 'form' | 'preview' | 'detail';

function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>('form');
  const [pendingInput, setPendingInput] = useState<ReleaseInput | null>(null);
  const [release, setRelease] = useState<Release | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);

  const { entries: manifestEntries, loading: manifestLoading, error: manifestError, refresh: refreshManifest } =
    useReleaseManifest();

  function openForm(initial?: ReleaseInput) {
    setPendingInput(initial ?? null);
    setRelease(null);
    setFormError(null);
    setModalStep('form');
    setModalOpen(true);
  }

  function openDetail(entry: ManifestEntry) {
    const input: ReleaseInput = {
      label: entry.label,
      catalogueNumber: entry.catalogueNumber,
      artist: entry.artist,
      releaseTitle: entry.releaseTitle,
      tracks: [],
      releaseDateISO: entry.releaseDateISO,
      royaltyRate: '',
      royaltyNotes: '',
      genre: '',
    };
    const built = buildRelease(input);
    setRelease(built);
    setPendingInput(input);
    setFormError(null);
    setModalStep('detail');
    setModalOpen(true);
  }

  function handlePreview(input: ReleaseInput) {
    try {
      const built = buildRelease(input);
      setRelease(built);
      setPendingInput(input);
      setFormError(null);
      setModalStep('preview');
    } catch (err) {
      if (err instanceof NotAFridayError) {
        setFormError(err.message);
      } else {
        throw err;
      }
    }
  }

  // Seed releases not yet in the manifest (matched by artist + date)
  const scheduledKeys = new Set(
    (manifestEntries ?? []).map((e) => `${e.artist}|${e.releaseDateISO}`)
  );
  const pendingSeeds = SEED_RELEASES.filter(
    (s) => !scheduledKeys.has(`${s.artist}|${s.releaseDateISO}`)
  );

  return (
    <>
      <LandingPage
        manifestEntries={manifestEntries}
        manifestLoading={manifestLoading}
        manifestError={manifestError}
        pendingSeeds={pendingSeeds}
        onNewRelease={() => openForm()}
        onOpenEntry={openDetail}
        onSeedPick={(input) => openForm(input)}
        onRefresh={refreshManifest}
        dryRun={dryRun}
        setDryRun={setDryRun}
      />

      {modalOpen && (
        <ReleaseModal onClose={() => setModalOpen(false)} wide={modalStep !== 'form'}>
          <div className="space-y-6">
            <div className="flex items-start justify-between border-b border-wire/15 pb-5">
              <div>
                <h2 className="font-mono font-semibold text-snow text-lg tracking-tight">
                  {modalStep === 'form' && 'Schedule a Release'}
                  {modalStep === 'preview' && 'Preview Schedule'}
                  {modalStep === 'detail' && 'Release Actions'}
                </h2>
                <p className="text-sm text-muted mt-1 font-mono">
                  {modalStep === 'form' && 'Enter the release details below'}
                  {modalStep === 'preview' && 'Review the generated task schedule before committing'}
                  {modalStep === 'detail' &&
                    (release ? `${release.artist} · ${release.releaseDateISO} · ${release.releaseId}` : '')}
                </p>
              </div>
              {modalStep === 'detail' && (
                <button
                  onClick={() => openForm()}
                  className="text-sm font-mono text-muted hover:text-cyan transition-colors shrink-0 ml-4"
                >
                  ← New release
                </button>
              )}
            </div>

            {formError && modalStep === 'form' && (
              <p className="text-signal text-sm bg-signal/10 border border-signal/20 rounded-lg px-4 py-3 font-mono">
                {formError}
              </p>
            )}

            {modalStep === 'form' && (
              <ReleaseForm
                key={pendingInput ? `${pendingInput.artist}-${pendingInput.releaseDateISO}` : 'blank'}
                onPreview={handlePreview}
                initial={pendingInput ?? undefined}
              />
            )}

            {modalStep === 'preview' && release && (
              <ReleasePreview
                release={release}
                onBack={() => setModalStep('form')}
                onConfirm={() => setModalStep('detail')}
              />
            )}

            {modalStep === 'detail' && release && (
              <ReleaseDetail
                release={release}
                dryRun={dryRun}
                onReleaseMoved={(r) => { setRelease(r); refreshManifest(); }}
              />
            )}
          </div>
        </ReleaseModal>
      )}
    </>
  );
}

function LandingPage({
  manifestEntries,
  manifestLoading,
  manifestError,
  pendingSeeds,
  onNewRelease,
  onOpenEntry,
  onSeedPick,
  onRefresh,
  dryRun,
  setDryRun,
}: {
  manifestEntries: ManifestEntry[] | null;
  manifestLoading: boolean;
  manifestError: string | null;
  pendingSeeds: typeof SEED_RELEASES;
  onNewRelease: () => void;
  onOpenEntry: (entry: ManifestEntry) => void;
  onSeedPick: (input: ReleaseInput) => void;
  onRefresh: () => void;
  dryRun: boolean;
  setDryRun: (v: boolean) => void;
}) {
  const hasScheduled = manifestEntries && manifestEntries.length > 0;

  return (
    <div className="min-h-screen relative">
      <GeometricBackground />

      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-wire/15">
        <div className="flex items-center gap-3">
          <MeanwhileMark className="text-cyan" />
          <div className="flex items-baseline gap-2">
            <span className="font-mono font-semibold text-snow text-lg tracking-tight">meanwhile</span>
            <span className="text-muted text-sm font-mono">/ release scheduler</span>
          </div>
        </div>
        <label className="flex items-center gap-2.5 text-sm text-muted cursor-pointer select-none">
          <span className="font-mono">Dry run</span>
          <div
            role="switch"
            aria-checked={dryRun}
            onClick={() => setDryRun(!dryRun)}
            className={`relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 ${
              dryRun ? 'bg-cyan/25' : 'bg-wire/15'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200 ${
                dryRun ? 'translate-x-5 bg-cyan' : 'translate-x-0 bg-wire/40'
              }`}
            />
          </div>
        </label>
      </header>

      <div className="relative z-10 px-8 pt-6">
        <GithubConnectGate />
      </div>

      <main className="relative z-10 px-8 py-10">
        {/* Scheduled releases (from manifest) */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-muted mb-1">
                {hasScheduled ? 'Scheduled' : 'Schedule'}
              </p>
              <h1 className="font-mono text-2xl font-semibold text-snow">Releases</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onRefresh}
                title="Refresh manifest"
                className="text-sm font-mono text-muted hover:text-snow transition-colors"
              >
                {manifestLoading ? '…' : '↻'}
              </button>
              <button
                onClick={onNewRelease}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-depth hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #4a8cf7 100%)' }}
              >
                + New Release
              </button>
            </div>
          </div>

          {manifestError && (
            <p className="text-sm font-mono text-signal mb-4">{manifestError}</p>
          )}

          {hasScheduled ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {manifestEntries!.map((entry) => (
                <ManifestCard key={entry.releaseId} entry={entry} onOpen={() => onOpenEntry(entry)} />
              ))}
            </div>
          ) : (
            !manifestLoading && (
              <p className="text-sm font-mono text-muted">
                No releases scheduled yet. Create your first release below or use the button above.
              </p>
            )
          )}
        </div>

        {/* Pending seeds — from config, not yet scheduled */}
        {pendingSeeds.length > 0 && (
          <div>
            <div className="mb-5">
              <p className="text-xs font-mono uppercase tracking-widest text-muted mb-1">
                {hasScheduled ? 'Still to schedule' : 'From config'}
              </p>
              <h2 className="font-mono text-lg font-medium text-snow/80">Upcoming releases</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {pendingSeeds.map((seed, i) => (
                <SeedCard
                  key={i}
                  seed={seed}
                  onOpen={() =>
                    onSeedPick({
                      label: seed.label,
                      catalogueNumber: '',
                      artist: seed.artist,
                      releaseTitle: '',
                      tracks: [{ title: '' }],
                      releaseDateISO: seed.releaseDateISO,
                      royaltyRate: '',
                      royaltyNotes: '',
                      genre: '',
                    })
                  }
                />
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 px-8 py-5 border-t border-wire/10 flex items-center justify-between">
        <span className="text-xs font-mono text-ghost">Meanwhile Recordings · Meanwhile Horizons</span>
        <span className="text-xs font-mono text-ghost">Internal tool</span>
      </footer>
    </div>
  );
}

// Card for a release that's already been scheduled (from manifest)
function ManifestCard({ entry, onOpen }: { entry: ManifestEntry; onOpen: () => void }) {
  const label = LABELS[entry.label];
  const isRecordings = entry.label === 'meanwhile-recordings';
  const accentColor = isRecordings ? '#00d4ff' : '#8b5cf6';
  const days = daysUntil(entry.releaseDateISO);

  return (
    <button
      onClick={onOpen}
      className="group text-left w-full rounded-xl border border-wire/15 bg-surface transition-all duration-200 hover:bg-elevated hover:-translate-y-0.5 overflow-hidden"
      style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}
    >
      <div
        className="h-0.5 w-full"
        style={{
          background: `linear-gradient(90deg, ${accentColor} 0%, transparent 70%)`,
        }}
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-widest" style={{ color: accentColor }}>
            {label.shortCode} · {entry.catalogueNumber}
          </span>
          <span className="text-[10px] font-mono text-ghost uppercase tracking-wide">Scheduled</span>
        </div>

        <div>
          <p className="font-mono font-semibold text-snow text-xl leading-tight group-hover:text-white transition-colors">
            {entry.artist}
          </p>
          {entry.releaseTitle && (
            <p className="text-sm text-muted mt-0.5 font-mono">{entry.releaseTitle}</p>
          )}
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-snow/80">{formatDate(entry.releaseDateISO)}</p>
            <p
              className="text-xs font-mono mt-0.5"
              style={{ color: days < 14 ? '#f0c040' : days < 35 ? '#00d4ff' : '#6a95b5' }}
            >
              {days > 0 ? `in ${days} days` : days === 0 ? 'today' : `${Math.abs(days)} days ago`}
            </p>
          </div>
          <span
            className="text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            style={{ color: accentColor }}
          >
            Actions →
          </span>
        </div>
      </div>
    </button>
  );
}

// Card for a seed release not yet scheduled
function SeedCard({ seed, onOpen }: { seed: (typeof SEED_RELEASES)[number]; onOpen: () => void }) {
  const label = LABELS[seed.label];
  const suggestedCat = suggestNextCatalogueNumber(label.latestCatalogueNumber);
  const days = daysUntil(seed.releaseDateISO);
  const isRecordings = seed.label === 'meanwhile-recordings';
  const accentColor = isRecordings ? '#00d4ff' : '#8b5cf6';

  return (
    <button
      onClick={onOpen}
      className="group text-left w-full rounded-xl border border-wire/10 bg-surface/60 transition-all duration-200 hover:bg-surface hover:-translate-y-0.5 overflow-hidden"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
    >
      <div
        className="h-px w-full"
        style={{
          background: `linear-gradient(90deg, ${accentColor}60 0%, transparent 70%)`,
        }}
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-widest text-muted">{label.shortCode}</span>
          <span className="text-[10px] font-mono text-ghost">{suggestedCat}</span>
        </div>

        <div>
          <p className="font-mono font-semibold text-snow/90 text-xl leading-tight group-hover:text-white transition-colors">
            {seed.artist}
          </p>
          <p className="text-xs text-ghost mt-0.5 font-mono">{label.name}</p>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-snow/70">{formatDate(seed.releaseDateISO)}</p>
            <p
              className="text-xs font-mono mt-0.5"
              style={{ color: days < 14 ? '#f0c040' : days < 35 ? '#00d4ff' : '#6a95b5' }}
            >
              {days > 0 ? `in ${days} days` : days === 0 ? 'today' : `${Math.abs(days)} days ago`}
            </p>
          </div>
          <span
            className="text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-muted"
          >
            Schedule →
          </span>
        </div>
      </div>
    </button>
  );
}

function ReleaseModal({
  children,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto"
      style={{ background: 'rgba(4,8,16,0.90)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} rounded-2xl border border-wire/20 mb-12`}
        style={{
          background: 'linear-gradient(170deg, #1a3456 0%, #122844 100%)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 1px 0 rgba(122,170,200,0.12)',
        }}
      >
        {/* Cyan accent line at top */}
        <div
          className="absolute top-0 left-8 right-8 h-px rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)' }}
        />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-wire/20 text-muted hover:text-snow hover:border-wire/40 hover:bg-wire/10 transition-all text-sm z-10 font-mono"
        >
          ✕
        </button>

        <div className="p-8 pt-7">{children}</div>
      </div>
    </div>
  );
}

function GeometricBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <svg
        viewBox="0 0 800 800"
        className="absolute -right-24 -top-24 w-[680px] h-[680px]"
        style={{ opacity: 0.04 }}
      >
        <defs>
          <clipPath id="geo-clip-lines">
            <circle cx="400" cy="400" r="348" />
          </clipPath>
        </defs>
        <g clipPath="url(#geo-clip-lines)" stroke="#00d4ff" strokeWidth="2.5">
          {Array.from({ length: 54 }, (_, i) => (
            <line key={i} x1={i * 15 + 7} y1="0" x2={i * 15 + 7} y2="800" />
          ))}
        </g>
      </svg>
      <svg
        viewBox="0 0 400 400"
        className="absolute -bottom-16 -left-16 w-[380px] h-[380px]"
        style={{ opacity: 0.03 }}
      >
        {[70, 100, 135, 170, 200].map((r) => (
          <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="#4a8cf7" strokeWidth="1.5" />
        ))}
      </svg>
    </div>
  );
}

function MeanwhileMark({ className = '' }: { className?: string }) {
  return (
    <svg width="24" height="17" viewBox="0 0 24 17" fill="currentColor" className={className}>
      <rect x="0" y="5" width="3.5" height="12" rx="0.5" />
      <rect x="5" y="0" width="3.5" height="17" rx="0.5" />
      <rect x="10" y="3" width="3.5" height="14" rx="0.5" />
      <rect x="15" y="7" width="3.5" height="10" rx="0.5" />
      <rect x="20" y="4" width="3.5" height="13" rx="0.5" />
    </svg>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split('-').map(Number);
  const release = new Date(y!, m! - 1, d!);
  return Math.round((release.getTime() - today.getTime()) / 86400000);
}
