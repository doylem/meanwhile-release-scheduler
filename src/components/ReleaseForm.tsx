import { useMemo, useState } from 'react';
import { LABELS, type LabelKey } from '../../config/labels.config';
import { suggestNextCatalogueNumber } from '../lib/catalogue';
import { isFriday, nextFriday } from '../lib/scheduling';
import type { ReleaseInput, Track } from '../lib/types';

const labelOptions = Object.values(LABELS);

function emptyForm(): ReleaseInput {
  const firstLabel = labelOptions[0]!;
  return {
    label: firstLabel.key,
    catalogueNumber: suggestNextCatalogueNumber(firstLabel.latestCatalogueNumber),
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
}: {
  onPreview: (input: ReleaseInput) => void;
  initial?: ReleaseInput;
}) {
  const [form, setForm] = useState<ReleaseInput>(initial ?? emptyForm());
  const [catalogueOverridden, setCatalogueOverridden] = useState(Boolean(initial));
  const [dateError, setDateError] = useState<string | null>(null);

  const friday = useMemo(() => (form.releaseDateISO ? isFriday(form.releaseDateISO) : null), [form.releaseDateISO]);

  function setLabel(label: LabelKey) {
    setForm((f) => ({
      ...f,
      label,
      catalogueNumber: catalogueOverridden
        ? f.catalogueNumber
        : suggestNextCatalogueNumber(LABELS[label].latestCatalogueNumber),
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
  }

  function removeTrack(index: number) {
    setForm((f) => ({ ...f, tracks: f.tracks.filter((_, i) => i !== index) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.releaseDateISO) {
      setDateError('Pick a release date.');
      return;
    }
    if (!isFriday(form.releaseDateISO)) {
      setDateError(`That date isn't a Friday. Did you mean ${nextFriday(form.releaseDateISO)}?`);
      return;
    }
    setDateError(null);
    onPreview({ ...form, tracks: form.tracks.filter((t) => t.title.trim().length > 0) });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Label">
          <select
            value={form.label}
            onChange={(e) => setLabel(e.target.value as LabelKey)}
            className={inputClass}
          >
            {labelOptions.map((l) => (
              <option key={l.key} value={l.key}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Catalogue number" hint="Suggested — change if needed">
          <input
            value={form.catalogueNumber}
            onChange={(e) => {
              setCatalogueOverridden(true);
              setForm((f) => ({ ...f, catalogueNumber: e.target.value }));
            }}
            className={inputClass}
          />
        </Field>

        <Field label="Artist name">
          <input
            value={form.artist}
            onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))}
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

      <Field label="Tracklist">
        <div className="space-y-2">
          {form.tracks.map((t, i) => (
            <div key={i} className="rounded-lg border border-wire/15 bg-elevated/30 p-3 space-y-2">
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
              <div className="flex gap-2 pl-7">
                <input
                  value={t.artist ?? ''}
                  onChange={(e) => updateTrack(i, { artist: e.target.value || undefined })}
                  placeholder={form.artist ? `${form.artist} (default)` : 'Artist — same as release'}
                  className={`${inputClass} flex-1 text-xs py-1.5`}
                />
                <input
                  value={t.royaltyRate ?? ''}
                  onChange={(e) => updateTrack(i, { royaltyRate: e.target.value || undefined })}
                  placeholder={form.royaltyRate || '50%'}
                  className={`${inputClass} w-24 text-xs py-1.5`}
                />
              </div>
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

      <div className="grid grid-cols-2 gap-4">
        <Field label="Release date" hint="New releases always go out on a Friday">
          <input
            type="date"
            value={form.releaseDateISO}
            onChange={(e) => {
              setForm((f) => ({ ...f, releaseDateISO: e.target.value }));
              setDateError(null);
            }}
            className={dateInputClass}
            required
          />
          {friday === false && (
            <p className="text-gold text-xs font-mono mt-1.5">
              Not a Friday — did you mean {nextFriday(form.releaseDateISO)}?
            </p>
          )}
          {dateError && (
            <p className="text-signal text-xs font-mono mt-1.5">{dateError}</p>
          )}
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

      {/* Financial details — always visible */}
      <div className="rounded-lg border border-wire/15 bg-elevated/20 p-4 space-y-4">
        <p className="text-xs font-mono uppercase tracking-wider text-muted">Financial details</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Default royalty rate">
            <input
              value={form.royaltyRate}
              onChange={(e) => setForm((f) => ({ ...f, royaltyRate: e.target.value }))}
              className={inputClass}
              placeholder="50%"
            />
          </Field>
          <Field label="Royalty notes" hint="Any per-track exceptions or general notes">
            <input
              value={form.royaltyNotes}
              onChange={(e) => setForm((f) => ({ ...f, royaltyNotes: e.target.value }))}
              className={inputClass}
              placeholder="50% royalties to the guys"
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

      <button
        type="submit"
        className="rounded-xl px-7 py-3 text-sm font-medium text-depth hover:opacity-90 transition-opacity"
        style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #4a8cf7 100%)' }}
      >
        Preview release →
      </button>
    </form>
  );
}

const inputClass =
  'block w-full rounded-lg bg-elevated/60 border border-wire/20 px-4 py-2.5 text-snow placeholder:text-ghost focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/15 transition-colors text-sm font-mono';

const dateInputClass =
  'block w-full rounded-lg bg-elevated border border-wire/40 px-4 py-2.5 text-snow focus:outline-none focus:border-cyan/60 focus:ring-2 focus:ring-cyan/20 transition-colors text-sm font-mono ring-1 ring-wire/15';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-mono uppercase tracking-wider text-muted mb-2">{label}</span>
      {children}
      {hint && <span className="block text-xs font-mono text-ghost mt-1">{hint}</span>}
    </label>
  );
}
