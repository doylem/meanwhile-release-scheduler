import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { GithubConnectGate } from "../components/GithubConnectGate";
import { PasswordGate } from "../components/PasswordGate";
import { ReleaseDetail } from "../components/ReleaseDetail";
import { ReleaseForm } from "../components/ReleaseForm";
import { ReleasePreview } from "../components/ReleasePreview";
import { GithubConnectionProvider } from "../lib/githubConnection";
import { buildRelease } from "../lib/release";
import { isFriday, NotAFridayError } from "../lib/scheduling";
import { LABELS, SEED_RELEASES } from "../../config/labels.config";
import { suggestNextCatalogueNumber } from "../lib/catalogue";
import {
  useReleaseManifest,
  type ManifestEntry,
} from "../lib/useReleaseManifest";
import { useReleaseStates } from "../lib/useReleaseStates";
import type { ReleaseState } from "../lib/types";
import {
  generateLocalId,
  type LocalRelease,
} from "../lib/localReleases";
import { useSharedReleases } from "../lib/useSharedReleases";
import type { Release, ReleaseInput } from "../lib/types";

export default function Home() {
  return (
    <PasswordGate>
      <GithubConnectionProvider>
        <App />
      </GithubConnectionProvider>
    </PasswordGate>
  );
}

type ModalStep = "form" | "preview" | "detail";
type SeedType = (typeof SEED_RELEASES)[number];

type GridItem =
  | { kind: "local"; local: LocalRelease }
  | { kind: "manifest"; entry: ManifestEntry }
  | { kind: "seed"; seed: SeedType };

function getCompleteness(input: ReleaseInput): "draft" | "ready" {
  if (
    input.artist.trim() &&
    input.releaseTitle.trim() &&
    input.catalogueNumber.trim() &&
    input.releaseDateISO &&
    isFriday(input.releaseDateISO) &&
    input.tracks.some((t) => t.title.trim())
  ) {
    return "ready";
  }
  return "draft";
}

function isUpcoming(dateISO: string): boolean {
  if (!dateISO) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateISO.split("-").map(Number);
  const rel = new Date(y!, m! - 1, d!);
  return rel >= today;
}

function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("form");
  const [pendingInput, setPendingInput] = useState<ReleaseInput | null>(null);
  const [release, setRelease] = useState<Release | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const { releases: localReleases, loading: releasesLoading, syncing: releasesSyncing, save: saveRelease, remove: removeRelease } = useSharedReleases();
  const localReleasesRef = useRef<LocalRelease[]>([]);
  const [currentLocalId, setCurrentLocalId] = useState<string | null>(null);
  const currentLocalIdRef = useRef<string | null>(null);

  useEffect(() => {
    localReleasesRef.current = localReleases;
  });

  function setLocalId(id: string | null) {
    currentLocalIdRef.current = id;
    setCurrentLocalId(id);
  }

  const {
    entries: manifestEntries,
    loading: manifestLoading,
    error: manifestError,
    refresh: refreshManifest,
  } = useReleaseManifest();

  const allCatalogueNumbers = useMemo(() => {
    const cats = new Set<string>();
    localReleases.forEach((r) => { if (r.input.catalogueNumber) cats.add(r.input.catalogueNumber); });
    (manifestEntries ?? []).forEach((m) => cats.add(m.catalogueNumber));
    return [...cats];
  }, [localReleases, manifestEntries]);

  const { states: releaseStates, refresh: refreshStates } = useReleaseStates(allCatalogueNumbers);

  const handleAutoSave = useCallback((input: ReleaseInput) => {
    const id = currentLocalIdRef.current;
    if (!id || !input.artist.trim()) return;
    const existing = localReleasesRef.current.find((r) => r.id === id);
    saveRelease({
      id,
      savedAt: new Date().toISOString(),
      input,
      isScheduled: existing?.isScheduled ?? false,
    });
  }, [saveRelease]);

  const handleSaveDraft = useCallback(
    (input: ReleaseInput) => {
      handleAutoSave(input);
      setModalOpen(false);
    },
    [handleAutoSave],
  );

  const handleDeleteLocal = useCallback((id: string) => {
    removeRelease(id);
  }, [removeRelease]);

  const handleScheduled = useCallback(() => {
    const id = currentLocalIdRef.current;
    if (!id) return;
    const existing = localReleasesRef.current.find((r) => r.id === id);
    if (!existing) return;
    saveRelease({ ...existing, isScheduled: true });
  }, [saveRelease]);

  function openFormNew() {
    setLocalId(generateLocalId());
    setPendingInput(null);
    setRelease(null);
    setFormError(null);
    setModalStep("form");
    setModalOpen(true);
  }

  function openFormEdit(local: LocalRelease) {
    setLocalId(local.id);
    setPendingInput(local.input);
    setRelease(null);
    setFormError(null);
    setModalStep("form");
    setModalOpen(true);
  }

  function openFormSeed(seed: SeedType) {
    // Reuse an existing local release for this seed if one already exists
    const existing = localReleasesRef.current.find(
      (r) =>
        r.input.artist.toLowerCase() === seed.artist.toLowerCase() &&
        r.input.releaseDateISO === seed.releaseDateISO,
    );
    if (existing) {
      openFormEdit(existing);
      return;
    }
    setLocalId(generateLocalId());
    setPendingInput({
      label: seed.label,
      catalogueNumber: "",
      artist: seed.artist,
      releaseTitle: "",
      tracks: [{ title: "" }],
      releaseDateISO: seed.releaseDateISO,
      royaltyRate: "50%",
      royaltyNotes: "",
      genre: "Progressive House",
      notes: "",
    });
    setRelease(null);
    setFormError(null);
    setModalStep("form");
    setModalOpen(true);
  }

  function openActionsLocal(local: LocalRelease) {
    try {
      const built = buildRelease(local.input);
      setLocalId(local.id);
      setRelease(built);
      setPendingInput(local.input);
      setFormError(null);
      setModalStep("detail");
      setModalOpen(true);
    } catch (err) {
      console.error("Failed to build release for actions:", err);
    }
  }

  function openActionsManifest(entry: ManifestEntry) {
    try {
      const input: ReleaseInput = {
        label: entry.label,
        catalogueNumber: entry.catalogueNumber,
        artist: entry.artist,
        releaseTitle: entry.releaseTitle,
        tracks: [],
        releaseDateISO: entry.releaseDateISO,
        royaltyRate: "",
        royaltyNotes: "",
        genre: "",
        notes: "",
      };
      const built = buildRelease(input);
      setLocalId(null);
      setRelease(built);
      setPendingInput(input);
      setFormError(null);
      setModalStep("detail");
      setModalOpen(true);
    } catch (err) {
      console.error("Failed to build release from manifest:", err);
    }
  }

  function handlePreview(input: ReleaseInput) {
    try {
      const built = buildRelease(input);
      setRelease(built);
      setPendingInput(input);
      setFormError(null);
      setModalStep("preview");
    } catch (err) {
      if (err instanceof NotAFridayError) {
        setFormError(err.message);
      } else {
        throw err;
      }
    }
  }

  return (
    <>
      <LandingPage
        localReleases={localReleases}
        releasesLoading={releasesLoading}
        manifestEntries={manifestEntries}
        manifestLoading={manifestLoading}
        manifestError={manifestError}
        releaseStates={releaseStates}
        releasesSyncing={releasesSyncing}
        onNewRelease={openFormNew}
        onEditLocal={openFormEdit}
        onActionsLocal={openActionsLocal}
        onActionsManifest={openActionsManifest}
        onEditSeed={openFormSeed}
        onDeleteLocal={handleDeleteLocal}
        onRefresh={refreshManifest}
        dryRun={dryRun}
        setDryRun={setDryRun}
      />

      {modalOpen && (
        <ReleaseModal
          onClose={() => setModalOpen(false)}
          wide={modalStep !== "form"}
        >
          <div className="space-y-6">
            <div className="flex items-start justify-between border-b border-wire/15 pb-5">
              <div>
                <h2 className="font-mono font-semibold text-snow text-lg tracking-tight">
                  {modalStep === "form" && "Schedule a Release"}
                  {modalStep === "preview" && "Preview Schedule"}
                  {modalStep === "detail" && "Release Actions"}
                </h2>
                <p className="text-sm text-muted mt-1 font-mono">
                  {modalStep === "form" && "Enter the release details below"}
                  {modalStep === "preview" &&
                    "Review the generated task schedule before committing"}
                  {modalStep === "detail" &&
                    (release
                      ? `${release.artist} · ${formatDate(release.releaseDateISO)}`
                      : "")}
                </p>
              </div>
              {modalStep === "detail" && (
                <button
                  onClick={openFormNew}
                  className="text-sm font-mono text-muted hover:text-cyan transition-colors shrink-0 ml-4"
                >
                  ← New release
                </button>
              )}
            </div>

            {formError && modalStep === "form" && (
              <p className="text-signal text-sm bg-signal/10 border border-signal/20 rounded-lg px-4 py-3 font-mono">
                {formError}
              </p>
            )}

            {modalStep === "form" && (
              <ReleaseForm
                key={currentLocalId ?? "blank"}
                onPreview={handlePreview}
                initial={pendingInput ?? undefined}
                onAutoSave={handleAutoSave}
                onSaveDraft={handleSaveDraft}
              />
            )}

            {modalStep === "preview" && release && (
              <ReleasePreview
                release={release}
                onBack={() => setModalStep("form")}
                onConfirm={() => setModalStep("detail")}
              />
            )}

            {modalStep === "detail" && release && (
              <ReleaseDetail
                release={release}
                dryRun={dryRun}
                releaseState={releaseStates[release.catalogueNumber]}
                onStateChange={refreshStates}
                onScheduled={handleScheduled}
                onReleaseMoved={(r) => {
                  setRelease(r);
                  refreshManifest();
                  const id = currentLocalIdRef.current;
                  if (id) {
                    const existing = localReleasesRef.current.find((lr) => lr.id === id);
                    if (existing) {
                      saveRelease({
                        ...existing,
                        input: { ...existing.input, releaseDateISO: r.releaseDateISO },
                      });
                    }
                  }
                }}
              />
            )}
          </div>
        </ReleaseModal>
      )}
    </>
  );
}

function LandingPage({
  localReleases,
  releasesLoading,
  manifestEntries,
  manifestLoading,
  manifestError,
  releaseStates,
  releasesSyncing,
  onNewRelease,
  onEditLocal,
  onActionsLocal,
  onActionsManifest,
  onEditSeed,
  onDeleteLocal,
  onRefresh,
  dryRun,
  setDryRun,
}: {
  localReleases: LocalRelease[];
  releasesLoading: boolean;
  manifestEntries: ManifestEntry[] | null;
  manifestLoading: boolean;
  manifestError: string | null;
  releaseStates: Record<string, ReleaseState>;
  releasesSyncing: boolean;
  onNewRelease: () => void;
  onEditLocal: (local: LocalRelease) => void;
  onActionsLocal: (local: LocalRelease) => void;
  onActionsManifest: (entry: ManifestEntry) => void;
  onEditSeed: (seed: SeedType) => void;
  onDeleteLocal: (id: string) => void;
  onRefresh: () => void;
  dryRun: boolean;
  setDryRun: (v: boolean) => void;
}) {
  const { basePath } = useRouter();
  const localCoverageKeys = useMemo(
    () =>
      new Set(
        localReleases.map(
          (r) => `${r.input.artist.toLowerCase()}|${r.input.releaseDateISO}`,
        ),
      ),
    [localReleases],
  );

  const manifestCoverageKeys = useMemo(
    () =>
      new Set(
        (manifestEntries ?? []).map(
          (m) => `${m.artist.toLowerCase()}|${m.releaseDateISO}`,
        ),
      ),
    [manifestEntries],
  );

  const manifestOnlyEntries = useMemo(
    () =>
      (manifestEntries ?? []).filter(
        (m) =>
          !localCoverageKeys.has(
            `${m.artist.toLowerCase()}|${m.releaseDateISO}`,
          ),
      ),
    [manifestEntries, localCoverageKeys],
  );

  const unclaimedSeeds = useMemo(
    () =>
      SEED_RELEASES.filter(
        (s) =>
          !localCoverageKeys.has(
            `${s.artist.toLowerCase()}|${s.releaseDateISO}`,
          ) &&
          !manifestCoverageKeys.has(
            `${s.artist.toLowerCase()}|${s.releaseDateISO}`,
          ),
      ),
    [localCoverageKeys, manifestCoverageKeys],
  );

  const upcomingLocals = useMemo(
    () =>
      localReleases
        .filter((r) => isUpcoming(r.input.releaseDateISO))
        .sort((a, b) => {
          if (!a.input.releaseDateISO) return 1;
          if (!b.input.releaseDateISO) return -1;
          return a.input.releaseDateISO.localeCompare(b.input.releaseDateISO);
        }),
    [localReleases],
  );

  const pastLocals = useMemo(
    () =>
      localReleases
        .filter(
          (r) => r.input.releaseDateISO && !isUpcoming(r.input.releaseDateISO),
        )
        .sort((a, b) =>
          b.input.releaseDateISO.localeCompare(a.input.releaseDateISO),
        ),
    [localReleases],
  );

  const upcomingManifestOnly = useMemo(
    () => manifestOnlyEntries.filter((m) => isUpcoming(m.releaseDateISO)),
    [manifestOnlyEntries],
  );

  const pastManifestOnly = useMemo(
    () =>
      manifestOnlyEntries
        .filter((m) => !isUpcoming(m.releaseDateISO))
        .sort((a, b) => b.releaseDateISO.localeCompare(a.releaseDateISO)),
    [manifestOnlyEntries],
  );

  const upcomingSeeds = useMemo(
    () => unclaimedSeeds.filter((s) => isUpcoming(s.releaseDateISO)),
    [unclaimedSeeds],
  );

  // Unified upcoming grid: all item types sorted by date ascending; undated drafts last
  const upcomingItems = useMemo(() => {
    const items: GridItem[] = [
      ...upcomingLocals.map((local) => ({ kind: "local" as const, local })),
      ...upcomingManifestOnly.map((entry) => ({
        kind: "manifest" as const,
        entry,
      })),
      ...upcomingSeeds.map((seed) => ({ kind: "seed" as const, seed })),
    ];
    return items.sort((a, b) => {
      const da =
        a.kind === "local"
          ? a.local.input.releaseDateISO
          : a.kind === "manifest"
            ? a.entry.releaseDateISO
            : a.seed.releaseDateISO;
      const db =
        b.kind === "local"
          ? b.local.input.releaseDateISO
          : b.kind === "manifest"
            ? b.entry.releaseDateISO
            : b.seed.releaseDateISO;
      if (!da && !db) return 0;
      if (!da) return 1; // undated goes last
      if (!db) return -1;
      return da.localeCompare(db);
    });
  }, [upcomingLocals, upcomingManifestOnly, upcomingSeeds]);

  const hasPast = pastLocals.length > 0 || pastManifestOnly.length > 0;

  return (
    <div className="min-h-screen relative">
      <GeometricBackground />

      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-wire/15">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${basePath}/meanwhile_RGB_logo_2023.png`}
            alt="Meanwhile"
            className="h-8 w-auto object-contain"
          />
          <span className="text-muted text-sm font-mono">
            / release scheduler
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onRefresh}
            title={releasesSyncing ? "Syncing…" : "Refresh manifest"}
            className="text-sm font-mono text-muted hover:text-snow transition-colors"
          >
            {manifestLoading || releasesSyncing ? "…" : "↻"}
          </button>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <span
              className={`font-mono text-xs ${dryRun ? "text-gold" : "text-cyan"}`}
            >
              {dryRun ? "Test mode" : "Live mode"}
            </span>
            <div
              role="switch"
              aria-checked={!dryRun}
              onClick={() => setDryRun(!dryRun)}
              className={`relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                dryRun ? "bg-gold/20" : "bg-cyan/25"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200 ${
                  dryRun ? "translate-x-0 bg-gold/60" : "translate-x-5 bg-cyan"
                }`}
              />
            </div>
          </label>
        </div>
      </header>

      {dryRun && (
        <div className="relative z-10 bg-gold/8 border-b border-gold/15 px-8 py-2">
          <p className="text-xs font-mono text-gold/80 text-center">
            Test mode is on — no calendar events, emails, or Dropbox actions
            will actually happen
          </p>
        </div>
      )}

      <div className="relative z-10 px-8 pt-6">
        <GithubConnectGate />
      </div>

      <main className="relative z-10 px-8 py-10">
        {manifestError && (
          <p className="text-sm font-mono text-signal mb-6">{manifestError}</p>
        )}

        <div className="mb-6">
          <p className="text-xs font-mono uppercase tracking-widest text-muted mb-1">
            Schedule
          </p>
          <h1 className="font-mono text-2xl font-semibold text-snow">
            Upcoming releases
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-16">
          {releasesLoading ? (
            [0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-wire/15 bg-surface overflow-hidden animate-pulse"
                style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.35)", minHeight: 213 }}
              >
                <div className="h-0.5 w-full bg-wire/10" />
                <div className="p-5 space-y-4">
                  <div className="flex justify-between">
                    <div className="h-2.5 w-32 rounded bg-wire/15" />
                    <div className="h-5 w-20 rounded-full bg-wire/12" />
                  </div>
                  <div className="h-6 w-40 rounded bg-wire/12" />
                  <div className="h-4 w-28 rounded bg-wire/10" />
                  <div className="h-4 w-16 rounded bg-wire/8 mt-2" />
                  <div className="h-8 w-full rounded-lg bg-wire/10 mt-4" />
                </div>
              </div>
            ))
          ) : (
            <>
              {upcomingItems.map((item, i) => {
                if (item.kind === "local") {
                  return (
                    <LocalReleaseCard
                      key={item.local.id}
                      local={item.local}
                      manifestEntries={manifestEntries}
                      coverArtUrl={releaseStates[item.local.input.catalogueNumber]?.coverArtUrl}
                      onEdit={() => onEditLocal(item.local)}
                      onActions={() => onActionsLocal(item.local)}
                      onDelete={() => onDeleteLocal(item.local.id)}
                    />
                  );
                }
                if (item.kind === "manifest") {
                  return (
                    <ManifestOnlyCard
                      key={item.entry.releaseId}
                      entry={item.entry}
                      coverArtUrl={releaseStates[item.entry.catalogueNumber]?.coverArtUrl}
                      onActions={() => onActionsManifest(item.entry)}
                    />
                  );
                }
                return (
                  <SeedCard
                    key={i}
                    seed={item.seed}
                    onEdit={() => onEditSeed(item.seed)}
                  />
                );
              })}
              <NewReleaseCard onClick={onNewRelease} />
            </>
          )}
        </div>

        {!releasesLoading && hasPast && (
          <div>
            <div className="mb-5">
              <p className="text-xs font-mono uppercase tracking-widest text-muted mb-1">
                Archive
              </p>
              <h2 className="font-mono text-lg font-medium text-snow/80">
                Past releases
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {pastLocals.map((local) => (
                <LocalReleaseCard
                  key={local.id}
                  local={local}
                  manifestEntries={manifestEntries}
                  coverArtUrl={releaseStates[local.input.catalogueNumber]?.coverArtUrl}
                  onEdit={() => onEditLocal(local)}
                  onActions={() => onActionsLocal(local)}
                  onDelete={() => onDeleteLocal(local.id)}
                  isPast
                />
              ))}
              {pastManifestOnly.map((entry) => (
                <ManifestOnlyCard
                  key={entry.releaseId}
                  entry={entry}
                  coverArtUrl={releaseStates[entry.catalogueNumber]?.coverArtUrl}
                  onActions={() => onActionsManifest(entry)}
                  isPast
                />
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 px-8 py-5 border-t border-wire/10 flex items-center justify-between">
        <span className="text-xs font-mono text-ghost">
          Meanwhile Recordings · Meanwhile Horizons
        </span>
        <span className="text-xs font-mono text-ghost">Internal tool</span>
      </footer>
    </div>
  );
}

// ─── Status tag ─────────────────────────────────────────────────────────────

function StatusTag({
  completeness,
  scheduled,
}: {
  completeness: "draft" | "ready";
  scheduled: boolean;
}) {
  const base =
    "text-[11px] font-mono uppercase tracking-wider rounded-full px-2.5 py-0.5 flex-shrink-0 whitespace-nowrap border";
  if (scheduled) {
    return (
      <span className={`${base} bg-cyan/10 text-cyan border-cyan/25`}>
        Scheduled
      </span>
    );
  }
  if (completeness === "ready") {
    return (
      <span className={`${base} bg-lime/8 text-lime border-lime/25`}>
        Ready
      </span>
    );
  }
  return (
    <span className={`${base} bg-amber/8 text-amber border-amber/25`}>
      Draft
    </span>
  );
}

// ─── Card: local release (draft / ready / scheduled) ─────────────────────────

function LocalReleaseCard({
  local,
  manifestEntries,
  coverArtUrl,
  onEdit,
  onActions,
  onDelete,
  isPast = false,
}: {
  local: LocalRelease;
  manifestEntries: ManifestEntry[] | null;
  coverArtUrl?: string;
  onEdit: () => void;
  onActions: () => void;
  onDelete: () => void;
  isPast?: boolean;
}) {
  const { input } = local;
  const label = LABELS[input.label];
  const isRecordings = input.label === "meanwhile-recordings";
  const accentColor = isRecordings ? "#00d4ff" : "#8b5cf6";

  const completeness = getCompleteness(input);
  const scheduled =
    local.isScheduled ||
    Boolean(
      manifestEntries?.some(
        (m) =>
          m.artist.toLowerCase() === input.artist.toLowerCase() &&
          m.releaseDateISO === input.releaseDateISO,
      ),
    );

  const days = input.releaseDateISO ? daysUntil(input.releaseDateISO) : null;

  const borderClass =
    completeness === "draft"
      ? "border-2 border-amber/40"
      : scheduled
        ? "border border-cyan/20"
        : "border border-wire/25";

  return (
    <div
      className={`rounded-xl bg-surface overflow-hidden transition-all duration-200 ${borderClass}`}
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.35)" }}
    >
      <div
        className="h-0.5 w-full"
        style={{
          background: `linear-gradient(90deg, ${completeness === "draft" ? "#e08010" : accentColor} 0%, transparent 70%)`,
        }}
      />
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-[10px] font-mono flex-shrink-0"
            style={{ color: accentColor }}
          >
            {label.name}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span className="text-[10px] font-mono text-ghost">
              {input.catalogueNumber || "—"}
            </span>
            <StatusTag completeness={completeness} scheduled={scheduled} />
          </div>
        </div>

        <div className="min-h-[52px] flex gap-3 items-start">
          <div className="flex-1 min-w-0">
            <p className="font-mono font-semibold text-snow text-xl leading-tight">
              {input.artist || (
                <span className="text-ghost italic text-base">No artist</span>
              )}
            </p>
            <p className="text-sm mt-0.5 font-mono">
              {input.releaseTitle ? (
                <span className="text-muted">{input.releaseTitle}</span>
              ) : (
                <span className="text-ghost/50 italic">No title yet</span>
              )}
            </p>
          </div>
          {coverArtUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverArtUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 opacity-85 border border-wire/20" />
          )}
        </div>

        <div className="min-h-[32px]">
          {input.releaseDateISO ? (
            <>
              <p
                className={`text-sm ${isPast ? "text-snow/45" : "text-snow/80"}`}
              >
                {formatDate(input.releaseDateISO)}
              </p>
              {days !== null && (
                <p
                  className="text-xs font-mono mt-0.5"
                  style={{
                    color: isPast
                      ? "#3a546e"
                      : days < 14
                        ? "#e08010"
                        : days < 35
                          ? "#b8ff30"
                          : "#7a9ab5",
                  }}
                >
                  {days > 0
                    ? `in ${days} days`
                    : days === 0
                      ? "today"
                      : `${Math.abs(days)} days ago`}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-ghost/60 italic">No date set</p>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-wire/10">
          {completeness === "draft" ? (
            <button
              onClick={onEdit}
              className="flex-1 rounded-lg border border-amber/25 px-3 py-2 text-xs font-mono text-amber/80 hover:text-amber hover:border-amber/45 hover:bg-amber/6 transition-all"
            >
              Edit →
            </button>
          ) : (
            <>
              <button
                onClick={onEdit}
                className="flex-1 rounded-lg border border-wire/20 px-3 py-2 text-xs font-mono text-snow/60 hover:text-snow hover:border-wire/35 hover:bg-wire/8 transition-all"
              >
                Edit
              </button>
              <button
                onClick={onActions}
                className="flex-1 rounded-lg border px-3 py-2 text-xs font-mono transition-all"
                style={{ borderColor: `${accentColor}40`, color: accentColor }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    `${accentColor}12`;
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    `${accentColor}65`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    `${accentColor}40`;
                }}
              >
                Actions →
              </button>
            </>
          )}
          <button
            onClick={onDelete}
            className="flex-shrink-0 w-8 rounded-lg border border-wire/15 flex items-center justify-center text-ghost/40 hover:text-signal hover:border-signal/30 hover:bg-signal/8 transition-all"
            title="Delete release"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card: manifest-only entry (scheduled, no local record) ─────────────────

function ManifestOnlyCard({
  entry,
  coverArtUrl,
  onActions,
  isPast = false,
}: {
  entry: ManifestEntry;
  coverArtUrl?: string;
  onActions: () => void;
  isPast?: boolean;
}) {
  const label = LABELS[entry.label];
  const isRecordings = entry.label === "meanwhile-recordings";
  const accentColor = isRecordings ? "#00d4ff" : "#8b5cf6";
  const days = daysUntil(entry.releaseDateISO);

  return (
    <div
      className="rounded-xl border border-wire/25 bg-surface overflow-hidden"
      style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.35)" }}
    >
      <div
        className="h-0.5 w-full"
        style={{
          background: `linear-gradient(90deg, ${accentColor} 0%, transparent 70%)`,
        }}
      />
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-[10px] font-mono flex-shrink-0"
            style={{ color: accentColor }}
          >
            {label.name}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-ghost">
              {entry.catalogueNumber}
            </span>
            <StatusTag completeness="ready" scheduled={true} />
          </div>
        </div>

        <div className="min-h-[52px] flex gap-3 items-start">
          <div className="flex-1 min-w-0">
            <p className="font-mono font-semibold text-snow text-xl leading-tight">
              {entry.artist}
            </p>
            {entry.releaseTitle ? (
              <p className="text-sm text-muted mt-0.5 font-mono">
                {entry.releaseTitle}
              </p>
            ) : (
              <p className="text-sm text-ghost/50 mt-0.5 italic">—</p>
            )}
          </div>
          {coverArtUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverArtUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 opacity-85 border border-wire/20" />
          )}
        </div>

        <div className="min-h-[32px]">
          <p className={`text-sm ${isPast ? "text-snow/45" : "text-snow/80"}`}>
            {formatDate(entry.releaseDateISO)}
          </p>
          <p
            className="text-xs font-mono mt-0.5"
            style={{
              color: isPast
                ? "#3a546e"
                : days < 14
                  ? "#e08010"
                  : days < 35
                    ? "#b8ff30"
                    : "#7a9ab5",
            }}
          >
            {days > 0
              ? `in ${days} days`
              : days === 0
                ? "today"
                : `${Math.abs(days)} days ago`}
          </p>
        </div>

        <div className="pt-2 border-t border-wire/10">
          <button
            onClick={onActions}
            className="w-full rounded-lg border px-3 py-2 text-xs font-mono transition-all"
            style={{ borderColor: `${accentColor}40`, color: accentColor }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                `${accentColor}12`;
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                `${accentColor}65`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "";
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                `${accentColor}40`;
            }}
          >
            Actions →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card: seed / template (artist + date from config, not yet set up) ────────

function SeedCard({ seed, onEdit }: { seed: SeedType; onEdit: () => void }) {
  const label = LABELS[seed.label];
  const suggestedCat = suggestNextCatalogueNumber(label.latestCatalogueNumber);
  const days = daysUntil(seed.releaseDateISO);
  const isRecordings = seed.label === "meanwhile-recordings";
  const accentColor = isRecordings ? "#00d4ff" : "#8b5cf6";

  return (
    <div
      className="rounded-xl border-2 border-dashed border-wire/18 bg-surface/50 overflow-hidden"
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.2)" }}
    >
      <div
        className="h-px w-full"
        style={{
          background: `linear-gradient(90deg, ${accentColor}45 0%, transparent 70%)`,
        }}
      />
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[10px] font-mono text-muted">{label.name}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-ghost">
              {suggestedCat}
            </span>
            <StatusTag completeness="draft" scheduled={false} />
          </div>
        </div>

        <div className="min-h-[52px]">
          <p className="font-mono font-semibold text-snow/90 text-xl leading-tight">
            {seed.artist}
          </p>
          <p className="text-xs text-ghost mt-0.5 font-mono">{label.name}</p>
        </div>

        <div className="min-h-[32px]">
          <p className="text-sm text-snow/65">
            {formatDate(seed.releaseDateISO)}
          </p>
          <p
            className="text-xs font-mono mt-0.5"
            style={{
              color: days < 14 ? "#e08010" : days < 35 ? "#b8ff30" : "#7a9ab5",
            }}
          >
            {days > 0
              ? `in ${days} days`
              : days === 0
                ? "today"
                : `${Math.abs(days)} days ago`}
          </p>
        </div>

        <div className="pt-2 border-t border-wire/10">
          <button
            onClick={onEdit}
            className="w-full rounded-lg border border-wire/18 px-3 py-2 text-xs font-mono text-muted hover:text-snow hover:border-wire/35 hover:bg-wire/8 transition-all"
          >
            Set up →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Trash icon ──────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 3.5h10" />
      <path d="M4.5 3.5V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" />
      <path d="M10.5 3.5l-.75 7a1 1 0 0 1-1 .9H4.25a1 1 0 0 1-1-.9l-.75-7" />
    </svg>
  );
}

// ─── Card: "+" new release ────────────────────────────────────────────────────

function NewReleaseCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group rounded-xl border border-dashed border-wire/18 bg-transparent hover:bg-surface/25 hover:border-wire/32 transition-all duration-200 min-h-[213px] flex flex-col items-center justify-center gap-3"
    >
      <span className="w-10 h-10 rounded-full border border-dashed border-wire/22 flex items-center justify-center text-ghost group-hover:text-muted group-hover:border-wire/38 transition-all text-xl font-mono leading-none">
        +
      </span>
      <span className="text-xs font-mono text-ghost group-hover:text-muted transition-colors">
        New release
      </span>
    </button>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

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
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto"
      style={{ background: "rgba(4,8,16,0.90)", backdropFilter: "blur(12px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full ${wide ? "max-w-4xl" : "max-w-2xl"} rounded-2xl border border-wire/20 mb-12 mx-4`}
        style={{
          background: "linear-gradient(170deg, #172c48 0%, #0f2035 100%)",
          boxShadow:
            "0 32px 80px rgba(0,0,0,0.75), 0 1px 0 rgba(122,168,200,0.10)",
        }}
      >
        <div
          className="absolute top-0 left-8 right-8 h-px rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(224,128,16,0.2) 20%, rgba(0,212,255,0.45) 50%, rgba(139,92,246,0.25) 80%, transparent)",
          }}
        />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-wire/20 text-muted hover:text-snow hover:border-wire/40 hover:bg-wire/10 transition-all text-sm z-10 font-mono"
        >
          ✕
        </button>
        <div className="p-5 sm:p-8 pt-7">{children}</div>
      </div>
    </div>
  );
}

// ─── Decorative ──────────────────────────────────────────────────────────────

function GeometricBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <svg
        viewBox="0 0 800 800"
        className="absolute -right-24 -top-24 w-[680px] h-[680px]"
        style={{ opacity: 0.07 }}
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
        style={{ opacity: 0.04 }}
      >
        {[70, 100, 135, 170, 200].map((r) => (
          <circle
            key={r}
            cx="200"
            cy="200"
            r={r}
            fill="none"
            stroke="#b8ff30"
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </div>
  );
}

function MeanwhileMark({ className = "" }: { className?: string }) {
  return (
    <svg
      width="24"
      height="17"
      viewBox="0 0 24 17"
      fill="currentColor"
      className={className}
    >
      <rect x="0" y="5" width="3.5" height="12" rx="0.5" />
      <rect x="5" y="0" width="3.5" height="17" rx="0.5" />
      <rect x="10" y="3" width="3.5" height="14" rx="0.5" />
      <rect x="15" y="7" width="3.5" height="10" rx="0.5" />
      <rect x="20" y="4" width="3.5" height="13" rx="0.5" />
    </svg>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = iso.split("-").map(Number);
  const release = new Date(y!, m! - 1, d!);
  return Math.round((release.getTime() - today.getTime()) / 86400000);
}
