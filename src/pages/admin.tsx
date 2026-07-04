import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { GithubConnectionProvider } from '../lib/githubConnection';
import { SettingsProvider, useSettings } from '../lib/useSettings';
import { useGithubConnection } from '../lib/githubConnection';
import { DEFAULT_SETTINGS, type AppSettings, type LabelSettings, type TaskRuleSettings } from '../lib/settings';

export default function AdminPage() {
  return (
    <GithubConnectionProvider>
      <SettingsProvider>
        <Admin />
      </SettingsProvider>
    </GithubConnectionProvider>
  );
}

function Admin() {
  const { connection } = useGithubConnection();
  const { settings, loading, saving, save } = useSettings();

  const [draft, setDraft] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isDirty, setIsDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!loading && !initializedRef.current) {
      initializedRef.current = true;
      setDraft(settings);
    }
  }, [loading, settings]);

  function update(fn: (prev: AppSettings) => AppSettings) {
    setDraft(fn);
    setIsDirty(true);
    setSaveSuccess(false);
  }

  async function handleSave() {
    setSaveError(null);
    try {
      await save(draft);
      setIsDirty(false);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <div
      className="min-h-screen font-mono"
      style={{ background: 'linear-gradient(160deg, #0a1628 0%, #06101e 100%)' }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-wire/15">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xs text-muted hover:text-snow transition-colors"
          >
            ← Back
          </Link>
          <span className="text-wire/30">/</span>
          <h1 className="text-sm font-semibold text-snow">Settings</h1>
        </div>
        {isDirty && !saving && (
          <span className="text-xs text-gold/70">Unsaved changes</span>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {!connection ? (
          <div className="rounded-xl border border-wire/20 bg-elevated/30 px-6 py-8 text-center space-y-3">
            <p className="text-snow text-sm font-semibold">GitHub connection required</p>
            <p className="text-muted text-xs leading-relaxed">
              Connect your GitHub PAT from the main page to edit and save settings.
              <br />
              Without a connection, settings are read-only and sourced from the app defaults.
            </p>
            <Link
              href="/"
              className="inline-block mt-2 text-xs text-cyan hover:text-cyan/80 transition-colors"
            >
              ← Go connect
            </Link>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-3 text-muted text-xs">
            <Spinner />
            Loading settings…
          </div>
        ) : (
          <>
            <LabelsSection
              labels={draft.labels}
              onChange={(labels) => update((d) => ({ ...d, labels }))}
            />

            <TaskScheduleSection
              taskRules={draft.taskRules}
              owners={draft.owners}
              onChange={(taskRules) => update((d) => ({ ...d, taskRules }))}
            />

            <TeamSection
              owners={draft.owners}
              onChange={(owners) => update((d) => ({ ...d, owners }))}
            />

            <FeaturesSection
              features={draft.features}
              timezone={draft.timezone}
              onChange={(features) => update((d) => ({ ...d, features }))}
              onTimezoneChange={(timezone) => update((d) => ({ ...d, timezone }))}
            />

            {/* Save */}
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-depth disabled:opacity-40 transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 100%)' }}
              >
                {saving && <Spinner light />}
                {saving ? 'Saving…' : 'Save settings'}
              </button>
              {saveSuccess && (
                <span className="text-xs text-lime">Saved to GitHub</span>
              )}
              {saveError && (
                <span className="text-xs text-signal">{saveError}</span>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Labels section ────────────────────────────────────────────────────────────

function LabelsSection({
  labels,
  onChange,
}: {
  labels: LabelSettings[];
  onChange: (labels: LabelSettings[]) => void;
}) {
  function addLabel() {
    onChange([
      ...labels,
      { key: `label-${Date.now()}`, name: 'New Label', shortCode: 'NL', latestCatalogueNumber: 'NL001' },
    ]);
  }

  function updateLabel(idx: number, patch: Partial<LabelSettings>) {
    onChange(labels.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLabel(idx: number) {
    onChange(labels.filter((_, i) => i !== idx));
  }

  return (
    <Section title="Record Labels" description="Labels used across releases. Short code appears in calendar titles and catalogue numbers.">
      <div className="space-y-3">
        {labels.map((label, idx) => (
          <div
            key={label.key}
            className="rounded-xl border border-wire/20 bg-elevated/20 p-4 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Name">
                <Input
                  value={label.name}
                  onChange={(v) => updateLabel(idx, { name: v })}
                  placeholder="Meanwhile Recordings"
                />
              </Field>
              <Field label="Short Code">
                <Input
                  value={label.shortCode}
                  onChange={(v) => updateLabel(idx, { shortCode: v.toUpperCase() })}
                  placeholder="MW"
                  maxLength={6}
                />
              </Field>
              <Field label="Latest Cat #">
                <Input
                  value={label.latestCatalogueNumber}
                  onChange={(v) => updateLabel(idx, { latestCatalogueNumber: v.toUpperCase() })}
                  placeholder="MW089"
                />
              </Field>
            </div>
            <div className="flex items-center justify-between">
              <Field label="Key (internal ID)">
                <Input
                  value={label.key}
                  onChange={(v) => updateLabel(idx, { key: v.toLowerCase().replace(/\s+/g, '-') })}
                  placeholder="meanwhile-recordings"
                  mono
                />
              </Field>
              {labels.length > 1 && (
                <button
                  onClick={() => removeLabel(idx)}
                  className="ml-4 mt-5 flex-shrink-0 text-xs text-signal/60 hover:text-signal transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          onClick={addLabel}
          className="text-xs text-muted hover:text-snow transition-colors border border-dashed border-wire/20 hover:border-wire/35 rounded-lg px-4 py-2.5 w-full"
        >
          + Add label
        </button>
      </div>
    </Section>
  );
}

// ─── Task schedule section ─────────────────────────────────────────────────────

function TaskScheduleSection({
  taskRules,
  owners,
  onChange,
}: {
  taskRules: TaskRuleSettings[];
  owners: string[];
  onChange: (rules: TaskRuleSettings[]) => void;
}) {
  function updateRule(idx: number, patch: Partial<TaskRuleSettings>) {
    onChange(taskRules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRule(idx: number) {
    onChange(taskRules.filter((_, i) => i !== idx));
  }

  function addRule() {
    onChange([
      ...taskRules,
      {
        id: `task-${Date.now()}`,
        title: 'New task',
        daysBeforeRelease: 7,
        owner: owners[0] ?? 'Unassigned',
        startHour: 9,
        startMinute: 0,
        enabled: true,
      },
    ]);
  }

  return (
    <Section
      title="Task Schedule"
      description="Calendar events created for every release. Days before release: 0 = release day, negative = after."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-ghost border-b border-wire/15">
              <th className="pb-2 text-left font-normal pr-3 w-8">On</th>
              <th className="pb-2 text-left font-normal pr-3">Title</th>
              <th className="pb-2 text-left font-normal pr-3 w-28">Owner</th>
              <th className="pb-2 text-left font-normal pr-3 w-20">Days before</th>
              <th className="pb-2 text-left font-normal pr-3 w-24">Time</th>
              <th className="pb-2 w-6" />
            </tr>
          </thead>
          <tbody className="divide-y divide-wire/10">
            {taskRules.map((rule, idx) => (
              <tr key={rule.id} className={rule.enabled ? '' : 'opacity-40'}>
                <td className="py-2.5 pr-3">
                  <Toggle
                    checked={rule.enabled}
                    onChange={(v) => updateRule(idx, { enabled: v })}
                  />
                </td>
                <td className="py-2.5 pr-3">
                  <Input
                    value={rule.title}
                    onChange={(v) => updateRule(idx, { title: v })}
                    placeholder="Task title"
                  />
                </td>
                <td className="py-2.5 pr-3">
                  <select
                    value={rule.owner}
                    onChange={(e) => updateRule(idx, { owner: e.target.value })}
                    className="w-full bg-depth/80 border border-wire/20 rounded-md px-2 py-1.5 text-snow text-xs focus:outline-none focus:border-cyan/50"
                  >
                    {owners.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                    {!owners.includes(rule.owner) && (
                      <option value={rule.owner}>{rule.owner}</option>
                    )}
                  </select>
                </td>
                <td className="py-2.5 pr-3">
                  <input
                    type="number"
                    value={rule.daysBeforeRelease}
                    onChange={(e) => updateRule(idx, { daysBeforeRelease: Number(e.target.value) })}
                    className="w-full bg-depth/80 border border-wire/20 rounded-md px-2 py-1.5 text-snow text-xs focus:outline-none focus:border-cyan/50"
                  />
                </td>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={rule.startHour}
                      onChange={(e) => updateRule(idx, { startHour: Number(e.target.value) })}
                      className="w-12 bg-depth/80 border border-wire/20 rounded-md px-2 py-1.5 text-snow text-xs text-center focus:outline-none focus:border-cyan/50"
                    />
                    <span className="text-ghost">:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      step={5}
                      value={rule.startMinute}
                      onChange={(e) => updateRule(idx, { startMinute: Number(e.target.value) })}
                      className="w-12 bg-depth/80 border border-wire/20 rounded-md px-2 py-1.5 text-snow text-xs text-center focus:outline-none focus:border-cyan/50"
                    />
                  </div>
                </td>
                <td className="py-2.5">
                  <button
                    onClick={() => removeRule(idx)}
                    className="text-ghost/40 hover:text-signal transition-colors"
                    title="Remove task"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={addRule}
        className="mt-3 text-xs text-muted hover:text-snow transition-colors border border-dashed border-wire/20 hover:border-wire/35 rounded-lg px-4 py-2.5 w-full"
      >
        + Add task
      </button>
    </Section>
  );
}

// ─── Team section ──────────────────────────────────────────────────────────────

function TeamSection({
  owners,
  onChange,
}: {
  owners: string[];
  onChange: (owners: string[]) => void;
}) {
  const [newOwner, setNewOwner] = useState('');

  function add() {
    const name = newOwner.trim();
    if (!name || owners.includes(name)) return;
    onChange([...owners, name]);
    setNewOwner('');
  }

  return (
    <Section title="Team" description="Owner names assigned to tasks. Add anyone who appears in your task schedule.">
      <div className="flex flex-wrap gap-2 mb-3">
        {owners.map((o) => (
          <span
            key={o}
            className="flex items-center gap-1.5 rounded-full border border-wire/25 bg-elevated/20 pl-3 pr-2 py-1 text-xs text-snow"
          >
            {o}
            <button
              onClick={() => onChange(owners.filter((x) => x !== o))}
              className="text-ghost/50 hover:text-signal transition-colors leading-none"
              title={`Remove ${o}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newOwner}
          onChange={(e) => setNewOwner(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Name"
          className="flex-1 bg-depth/80 border border-wire/20 rounded-lg px-3 py-2 text-xs text-snow placeholder:text-ghost focus:outline-none focus:border-cyan/50"
        />
        <button
          onClick={add}
          disabled={!newOwner.trim()}
          className="px-4 py-2 text-xs text-depth rounded-lg disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 100%)' }}
        >
          Add
        </button>
      </div>
    </Section>
  );
}

// ─── Features section ──────────────────────────────────────────────────────────

function FeaturesSection({
  features,
  timezone,
  onChange,
  onTimezoneChange,
}: {
  features: AppSettings['features'];
  timezone: string;
  onChange: (f: AppSettings['features']) => void;
  onTimezoneChange: (tz: string) => void;
}) {
  return (
    <Section title="Features" description="Enable or disable workflow integrations. Disabled sections are hidden in the release actions panel.">
      <div className="space-y-3">
        <FeatureRow
          label="Dropbox asset checking"
          description="Check Dropbox for masters, artwork and video files"
          checked={features.dropbox}
          onChange={(v) => onChange({ ...features, dropbox: v })}
        />
        <FeatureRow
          label="Google Calendar scheduling"
          description="Create calendar events for the task schedule"
          checked={features.calendar}
          onChange={(v) => onChange({ ...features, calendar: v })}
        />
        <FeatureRow
          label="Gmail draft creation"
          description="Generate email draft to send to distributor"
          checked={features.email}
          onChange={(v) => onChange({ ...features, email: v })}
        />

        {features.email && (
          <div className="mt-1 pl-1">
            <Field label="Email recipient">
              <Input
                value={features.emailRecipient}
                onChange={(v) => onChange({ ...features, emailRecipient: v })}
                placeholder="james@distributor.com"
                type="email"
              />
            </Field>
            <p className="text-[11px] text-ghost mt-1">
              Overrides the GMAIL_DRAFT_RECIPIENT workflow secret. Leave empty to keep using the secret.
            </p>
          </div>
        )}

        <div className="mt-2 pt-3 border-t border-wire/15">
          <Field label="Timezone">
            <Input
              value={timezone}
              onChange={onTimezoneChange}
              placeholder="Australia/Melbourne"
            />
          </Field>
          <p className="text-[11px] text-ghost mt-1">
            IANA timezone identifier, e.g. Australia/Melbourne, America/New_York
          </p>
        </div>
      </div>
    </Section>
  );
}

function FeatureRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-wire/15 bg-elevated/15 px-4 py-3">
      <div>
        <p className="text-xs text-snow">{label}</p>
        <p className="text-[11px] text-ghost mt-0.5">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

// ─── Shared primitives ─────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-wire/20 overflow-hidden"
      style={{ background: 'linear-gradient(170deg, #172c48 0%, #0f2035 100%)' }}
    >
      <div className="px-6 pt-6 pb-4 border-b border-wire/15">
        <h2 className="text-sm font-semibold text-snow">{title}</h2>
        <p className="text-xs text-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] text-ghost uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  maxLength,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={`w-full bg-depth/80 border border-wire/20 rounded-lg px-3 py-2 text-xs text-snow placeholder:text-ghost focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/10 transition-colors ${mono ? 'font-mono' : ''}`}
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0 ${
        checked ? 'bg-cyan/25' : 'bg-wire/20'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200 ${
          checked ? 'translate-x-4 bg-cyan' : 'translate-x-0 bg-wire/40'
        }`}
      />
    </div>
  );
}

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <svg
      className={`animate-spin w-3.5 h-3.5 ${light ? 'text-depth/60' : 'text-muted'}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
