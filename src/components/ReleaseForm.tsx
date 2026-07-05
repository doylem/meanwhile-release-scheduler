import { useEffect, useMemo, useRef, useState } from 'react';
import { ArtistAutocomplete } from './ArtistAutocomplete';
import { suggestForLabel } from '../lib/catalogue';
import { getAllArtists, saveCustomArtist } from '../lib/artists';
import { isFriday, nextFriday } from '../lib/scheduling';
import { useSettings } from '../lib/useSettings';
import { DEFAULT_SETTINGS, type LabelSettings } from '../lib/settings';
import type { ReleaseInput, Track } from '../lib/types';

type ExistingRelease = { label: string; catalogueNumber: string };

function emptyForm(labels: LabelSettings[], existingReleases: ExistingRelease[]): ReleaseInput {
  const firstLabel = labels[0] ?? DEFAULT_SETTINGS.labels[0]!;
  return {
    label: firstLabel.key,
    catalogueNumber: suggestForLabel(existingReleases, firstLabel.key, firstLabel.shortCode),
    artist: '',
    releaseTitle: '',
    tracks: [{ title: '' }],
    releaseDateISO: '',
    royaltyRate: '50%',
    royaltyNotes: '',
    genre: 'Progressive House',
    notes: '',
  };
}

export function ReleaseForm({
  onPreview,
  initial,
  onAutoSave,
  onSaveDraft,
  existingReleases = [],
}: {
  onPreview: (input: ReleaseInput) => void;
  initial?: ReleaseInput;
  onAutoSave?: (input: ReleaseInput) => void;
  onSaveDraft?: (input: ReleaseInput) => void;
  existingReleases?: ExistingRelease[];
}) {
  const { settings } = useSettings();
  const labelOptions = settings.labels;
  const [form, setForm] = useState<ReleaseInput>(() => initial ?? emptyForm(labelOptions, existingReleases));
  const [catalogueOverridden, setCatalogueOverridden] = useState(Boolean(initial));
  const [dateError, setDateError] = useState<string | null>(null);
  const [allArtists, setAllArtists] = useState<string[]>(getAllArtists);

  // Per-track UI toggle state (parallel arrays to form.tracks)
  const initialTracks = initial?.tracks ?? [{ title: '' }];
  const [diffArtistOn, setDiffArtistOn] = useState<boolean[]>(
    () => initialTracks.map((t) => Boolean(t.artist))
  );
  const [remixOn, setRemixOn] = useState<boolean[]>(
    () => initialTracks.map((t) => Boolean(t.remixArtist))
  );

  // Refs for stable cleanup effect (captures latest values without re-running)
  const formRef = useRef(form);
  const onAutoSaveRef = useRef(onAutoSave);
  useEffect(() => { formRef.current = form; });
  useEffect(() => { onAutoSaveRef.current = onAutoSave; });

  // Auto-save when form unmounts (modal close or step change)
  useEffect(() => {
    return () => {
      if (formRef.current.artist.trim()) {
        onAutoSaveRef.current?.(formRef.current);
      }
    };
  }, []);

  const isFormComplete = useMemo(
    () =>
      Boolean(
        form.artist.trim() &&
          form.releaseTitle.trim() &&
          form.catalogueNumber.trim() &&
          form.releaseDateISO &&
          isFriday(form.releaseDateISO) &&
          form.tracks.some((t) => t.title.trim())
      ),
    [form]
  );
  const canSaveDraft = Boolean(form.artist.trim()) && !isFormComplete;

  const friday = useMemo(() => (form.releaseDateISO ? isFriday(form.releaseDateISO) : null), [form.releaseDateISO]);

  // Unique artists enumerated from the form — used in the royalties section
  const uniqueArtists = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    function add(name: string | undefined) {
      if (!name?.trim()) return;
      const key = name.trim().toLowerCase();
      if (!seen.has(key)) { seen.add(key); result.push(name.trim()); }
    }
    add(form.artist);
    for (const t of form.tracks) { add(t.artist); add(t.remixArtist); }
    return result;
  }, [form.artist, form.tracks]);

  function setLabel(label: string) {
    const config = labelOptions.find((l) => l.key === label) ?? labelOptions[0]!;
    setForm((f) => ({
      ...f,
      label,
      catalogueNumber: catalogueOverridden
        ? f.catalogueNumber
        : suggestForLabel(existingReleases, label, config.shortCode),
    }));
  }

  function updateTrack(index: number, updates: Partial<Track>) {
    setForm((f) => ({
      ...f,
      tracks: f.tracks.map((t, i) => (i === index ? { ...t, ...updates } : t)),
    }));
  }

  function addTrack() {
    setForm((f) => ({ ...f, tracks: [...f.tracks, { title: '' }] }));
    setDiffArtistOn((p) => [...p, false]);
    setRemixOn((p) => [...p, false]);
  }

  function removeTrack(index: number) {
    setForm((f) => ({ ...f, tracks: f.tracks.filter((_, i) => i !== index) }));
    setDiffArtistOn((p) => p.filter((_, i) => i !== index));
    setRemixOn((p) => p.filter((_, i) => i !== index));
  }

  function toggleDiffArtist(index: number) {
    const enabling = !diffArtistOn[index];
    setDiffArtistOn((p) => p.map((v, i) => (i === index ? enabling : v)));
    if (!enabling) updateTrack(index, { artist: undefined });
  }

  function toggleRemix(index: number) {
    const enabling = !remixOn[index];
    setRemixOn((p) => p.map((v, i) => (i === index ? enabling : v)));
    if (!enabling) updateTrack(index, { remixArtist: undefined });
  }

  function persistArtist(name: string) {
    if (saveCustomArtist(name)) {
      setAllArtists((prev) =>
        [...prev, name].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      );
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.releaseDateISO) { setDateError('Pick a release date.'); return; }
    if (!isFriday(form.releaseDateISO)) {
      setDateError(`That date isn't a Friday. Did you mean ${nextFriday(form.releaseDateISO)}?`);
      return;
    }
    setDateError(null);

    const namesToSave = [
      form.artist,
      ...form.tracks.map((t) => t.artist ?? ''),
      ...form.tracks.map((t) => t.remixArtist ?? ''),
    ].filter(Boolean);
    for (const name of namesToSave) persistArtist(name);

    onPreview({ ...form, tracks: form.tracks.filter((t) => t.title.trim().length > 0) });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Label + Catalogue */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Label">
          <select value={form.label} onChange={(e) => setLabel(e.target.value)} className={inputClass}>
            {labelOptions.map((l) => (
              <option key={l.key} value={l.key}>{l.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Catalogue number" hint="Suggested — change if needed">
          <input
            value={form.catalogueNumber}
            onChange={(e) => { setCatalogueOverridden(true); setForm((f) => ({ ...f, catalogueNumber: e.target.value })); }}
            className={inputClass}
          />
        </Field>

        <Field label="Artist name">
          <ArtistAutocomplete
            value={form.artist}
            onChange={(v) => setForm((f) => ({ ...f, artist: v }))}
            suggestions={allArtists}
            placeholder="Start typing an artist name…"
            className={inputClass}
            required
          />
        </Field>

        <Field label="Release / EP title">
          <input
            value={form.releaseTitle}
            onChange={(e) => setForm((f) => ({ ...f, releaseTitle: e.target.value }))}
            className={inputClass}
            required
          />
        </Field>
      </div>

      {/* Tracklist */}
      <Field label="Tracklist">
        <div className="space-y-2">
          {form.tracks.map((t, i) => (
            <div key={i} className="rounded-lg border border-wire/15 bg-elevated/30 p-3 space-y-2.5">
              {/* Title row */}
              <div className="flex gap-2 items-start">
                <span className="text-ghost text-sm font-mono pt-2.5 w-5 flex-shrink-0 text-right">{i + 1}.</span>
                <input
                  value={t.title}
                  onChange={(e) => updateTrack(i, { title: e.target.value })}
                  placeholder={`Track ${i + 1} title`}
                  className={`${inputClass} flex-1`}
                />
                {form.tracks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTrack(i)}
                    className="text-xs font-mono text-muted hover:text-signal transition-colors pt-2.5 flex-shrink-0"
                  >
                    remove
                  </button>
                )}
              </div>

              {/* Toggle row */}
              <div className="flex items-center gap-2 pl-7">
                <ToggleChip
                  active={diffArtistOn[i] ?? false}
                  onToggle={() => toggleDiffArtist(i)}
                  labelOff="Same artist as EP"
                  labelOn="Different artist"
                  activeColor="cyan"
                />
                <ToggleChip
                  active={remixOn[i] ?? false}
                  onToggle={() => toggleRemix(i)}
                  labelOff="Remix"
                  labelOn="Remix"
                  activeColor="violet"
                />
              </div>

              {/* Different artist field */}
              {diffArtistOn[i] && (
                <div className="pl-7">
                  <ArtistAutocomplete
                    value={t.artist ?? ''}
                    onChange={(v) => updateTrack(i, { artist: v || undefined })}
                    suggestions={allArtists}
                    placeholder="Artist name…"
                    className={`${inputClass} text-xs py-2`}
                  />
                </div>
              )}

              {/* Remix artist field */}
              {remixOn[i] && (
                <div className="pl-7">
                  <ArtistAutocomplete
                    value={t.remixArtist ?? ''}
                    onChange={(v) => updateTrack(i, { remixArtist: v || undefined })}
                    suggestions={allArtists}
                    placeholder="Remixed by…"
                    className={`${inputClass} text-xs py-2`}
                  />
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addTrack}
            className="text-xs font-mono text-cyan hover:text-cyan/70 transition-colors mt-1"
          >
            + add track
          </button>
        </div>
      </Field>

      {/* Date + Genre */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Release date" hint="New releases always go out on a Friday">
          <input
            type="date"
            value={form.releaseDateISO}
            onChange={(e) => { setForm((f) => ({ ...f, releaseDateISO: e.target.value })); setDateError(null); }}
            className={dateInputClass}
            required
          />
          {friday === false && (
            <p className="text-gold text-xs font-mono mt-1.5">Not a Friday — did you mean {nextFriday(form.releaseDateISO)}?</p>
          )}
          {dateError && <p className="text-signal text-xs font-mono mt-1.5">{dateError}</p>}
        </Field>

        <Field label="Genre / style">
          <input
            value={form.genre}
            onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
            className={inputClass}
            placeholder="Progressive House"
          />
        </Field>
      </div>

      {/* Royalties */}
      <div className="rounded-lg border border-wire/15 bg-elevated/20 p-4 space-y-4">
        <p className="text-xs font-mono uppercase tracking-wider text-muted">Royalties</p>

        {uniqueArtists.length > 0 && (
          <div>
            <p className="text-xs font-mono text-ghost mb-2">Artists on this release</p>
            <div className="flex flex-wrap gap-2">
              {uniqueArtists.map((name) => (
                <span
                  key={name}
                  className="text-xs font-mono text-snow/70 bg-surface/60 border border-wire/15 rounded-full px-3 py-1"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Royalty rate (all artists)">
            <input
              value={form.royaltyRate}
              onChange={(e) => setForm((f) => ({ ...f, royaltyRate: e.target.value }))}
              className={inputClass}
              placeholder="50%"
            />
          </Field>
          <Field label="Notes (optional)" hint="Any additional royalty details">
            <input
              value={form.royaltyNotes}
              onChange={(e) => setForm((f) => ({ ...f, royaltyNotes: e.target.value }))}
              className={inputClass}
              placeholder="e.g. 50% royalties to the guys"
            />
          </Field>
        </div>
      </div>

      <Field label="Notes (optional)">
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className={`${inputClass} resize-none`}
          rows={2}
        />
      </Field>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          className="rounded-xl px-7 py-3 text-sm font-medium text-depth hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 100%)' }}
        >
          Preview release →
        </button>
        {onSaveDraft && canSaveDraft && (
          <button
            type="button"
            onClick={() => onSaveDraft(form)}
            className="rounded-xl border border-amber/30 px-5 py-3 text-sm font-mono text-amber hover:bg-amber/8 hover:border-amber/45 transition-all"
          >
            Save draft
          </button>
        )}
      </div>
    </form>
  );
}

function ToggleChip({
  active,
  onToggle,
  labelOff,
  labelOn,
  activeColor,
}: {
  active: boolean;
  onToggle: () => void;
  labelOff: string;
  labelOn: string;
  activeColor: 'cyan' | 'violet';
}) {
  const activeClass =
    activeColor === 'cyan'
      ? 'bg-cyan/10 text-cyan border-cyan/25'
      : 'bg-violet/10 text-violet border-violet/25';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1.5 text-xs font-mono rounded-full px-3 py-1 border transition-all ${
        active ? activeClass : 'text-ghost border-wire/15 hover:text-muted hover:border-wire/25'
      }`}
    >
      <span className="text-[10px]">{active ? '●' : '○'}</span>
      {active ? labelOn : labelOff}
    </button>
  );
}

const inputClass =
  'block w-full rounded-lg bg-elevated/60 border border-wire/20 px-4 py-2.5 text-snow placeholder:text-ghost focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/15 transition-colors text-sm font-mono';

const dateInputClass =
  'block w-full rounded-lg bg-elevated border border-wire/40 px-4 py-2.5 text-snow focus:outline-none focus:border-cyan/60 focus:ring-2 focus:ring-cyan/20 transition-colors text-sm font-mono ring-1 ring-wire/15';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-mono uppercase tracking-wider text-muted mb-2">{label}</span>
      {children}
      {hint && <span className="block text-xs font-mono text-ghost mt-1">{hint}</span>}
    </label>
  );
}
