import { LABELS } from '../../config/labels.config';
import type { Release } from '../lib/types';

export function ReleasePreview({
  release,
  onBack,
  onConfirm,
}: {
  release: Release;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const label = LABELS[release.label];

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-wire/20 bg-elevated/40 p-6">
        <p className="text-xs font-mono uppercase tracking-wider text-muted mb-4">Release details</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <Row label="Label" value={label.name} />
          <Row label="Catalogue number" value={release.catalogueNumber} />
          <Row label="Artist" value={release.artist} />
          <Row label="Release title" value={release.releaseTitle} />
          <Row label="Release date" value={formatTaskDate(release.releaseDateISO)} />
          <Row label="Royalty rate" value={release.royaltyRate || '—'} />
          {release.royaltyNotes && <Row label="Royalty notes" value={release.royaltyNotes} />}
          {release.genre && <Row label="Genre" value={release.genre} />}
        </div>

        {release.tracks.length > 0 && (
          <div className="mt-5 pt-4 border-t border-wire/10">
            <p className="text-xs font-mono uppercase tracking-wider text-muted mb-3">Tracklist</p>
            <ol className="space-y-1">
              {release.tracks.map((t, i) => {
                const title = t.remixArtist ? `${t.title} (${t.remixArtist} Remix)` : t.title;
                return (
                  <li key={i} className="text-sm text-snow/80 font-mono">
                    <span className="text-muted mr-2">{String(i + 1).padStart(2, '0')}.</span>
                    {t.artist && <span className="text-cyan/80">{t.artist} — </span>}
                    {title}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </section>

      <section>
        <p className="text-sm font-mono font-semibold text-snow/80 mb-4">
          {release.tasks.length} tasks will be added to your calendar
        </p>
        <div className="rounded-xl border border-wire/20 overflow-hidden">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="border-b border-wire/15 bg-elevated/30">
                <th className="text-left px-4 py-3 text-xs text-muted uppercase tracking-wider">Due</th>
                <th className="text-left px-4 py-3 text-xs text-muted uppercase tracking-wider">Task</th>
                <th className="text-left px-4 py-3 text-xs text-muted uppercase tracking-wider">Owner</th>
              </tr>
            </thead>
            <tbody>
              {release.tasks.map((task, i) => (
                <tr
                  key={task.id}
                  className={`border-b border-wire/8 hover:bg-elevated/30 transition-colors ${
                    i % 2 === 0 ? 'bg-transparent' : 'bg-elevated/20'
                  }`}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-cyan/80">{formatTaskDate(task.dueDateISO)}</td>
                  <td className="px-4 py-3 text-snow/80">{task.title}</td>
                  <td className="px-4 py-3 text-muted">{task.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs font-mono text-ghost mt-2 pl-1">
          All events are created as 9:00–9:15am in your calendar with popup reminders.
        </p>
      </section>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="rounded-xl border border-wire/20 px-5 py-2.5 text-sm font-mono text-snow hover:bg-wire/5 hover:border-wire/30 transition-all"
        >
          ← Back to edit
        </button>
        <button
          onClick={onConfirm}
          className="rounded-xl px-6 py-2.5 text-sm font-medium text-depth hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 100%)' }}
        >
          Continue to actions →
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-mono uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className="text-sm text-snow font-mono">{value}</div>
    </div>
  );
}

function formatTaskDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}
