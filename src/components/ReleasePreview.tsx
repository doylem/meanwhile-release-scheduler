import { LABELS } from '../../config/labels.config';
import { buildEventTitle } from '../lib/calendarEvents';
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
        <p className="text-xs font-mono uppercase tracking-widest text-muted mb-4">Release details</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <Row label="Label" value={label.name} />
          <Row label="Catalogue number" value={release.catalogueNumber} />
          <Row label="Artist" value={release.artist} />
          <Row label="Release title" value={release.releaseTitle} />
          <Row label="Release date" value={release.releaseDateISO} />
          <Row label="Royalty rate" value={release.royaltyRate || '—'} />
          <Row label="Royalty notes" value={release.royaltyNotes || '—'} />
          <Row label="Genre / style" value={release.genre || '—'} />
        </div>

        {release.tracks.length > 0 && (
          <div className="mt-4 pt-4 border-t border-wire/10">
            <p className="text-xs font-mono uppercase tracking-widest text-muted mb-2">Tracklist</p>
            <ol className="space-y-1">
              {release.tracks.map((t, i) => (
                <li key={i} className="text-sm text-snow/80 font-mono">
                  <span className="text-muted mr-2">{String(i + 1).padStart(2, '0')}.</span>
                  {t.title}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section>
        <p className="text-xs font-mono uppercase tracking-widest text-muted mb-4">
          Generated tasks ({release.tasks.length})
        </p>
        <div className="rounded-xl border border-wire/10 overflow-hidden">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-wire/10 bg-elevated/20">
                <th className="text-left px-4 py-3 text-muted uppercase tracking-widest">Due</th>
                <th className="text-left px-4 py-3 text-muted uppercase tracking-widest">Task</th>
                <th className="text-left px-4 py-3 text-muted uppercase tracking-widest">Owner</th>
                <th className="text-left px-4 py-3 text-muted uppercase tracking-widest hidden lg:table-cell">
                  Calendar title
                </th>
              </tr>
            </thead>
            <tbody>
              {release.tasks.map((task, i) => {
                return (
                  <tr
                    key={task.id}
                    className={`border-b border-wire/8 transition-colors ${
                      i % 2 === 0 ? 'bg-transparent' : 'bg-elevated/10'
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-cyan/80">{task.dueDateISO}</td>
                    <td className="px-4 py-3 text-snow/80">{task.title}</td>
                    <td className="px-4 py-3 text-muted">{task.owner}</td>
                    <td className="px-4 py-3 text-ghost hidden lg:table-cell">{buildEventTitle(release, task)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
          style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #4a8cf7 100%)' }}
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
