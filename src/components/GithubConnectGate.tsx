import { useEffect, useState } from 'react';
import { useGithubConnection } from '../lib/githubConnection';
import { GITHUB_OWNER, GITHUB_REPO } from '../lib/clientConfig';

/** Header pill — shows connection status, click to open the modal. */
export function GithubStatusButton({ onClick }: { onClick: () => void }) {
  const { connection } = useGithubConnection();
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-wire/20 bg-elevated/20 px-3.5 py-2 text-sm font-mono hover:bg-elevated/35 transition-colors"
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${connection ? 'bg-cyan' : 'bg-signal'}`}
      />
      <span className={connection ? 'text-snow/80' : 'text-snow/55'}>
        {connection ? 'Connected' : 'Not connected'}
      </span>
    </button>
  );
}

/** Full-screen modal with PAT form or connected state + disconnect. */
export function GithubConnectModal({ onClose }: { onClose: () => void }) {
  const { connection, isPersistent, setToken, disconnect } = useGithubConnection();
  const [entry, setEntry] = useState('');
  const [remember, setRemember] = useState(true);
  const [showTechnical, setShowTechnical] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function connect() {
    if (entry) {
      setToken(entry, remember);
      setEntry('');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(4,8,16,0.88)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-wire/20 p-6 space-y-5"
        style={{
          background: 'linear-gradient(170deg, #172c48 0%, #0f2035 100%)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 1px 0 rgba(122,168,200,0.10)',
        }}
      >
        <div
          className="absolute top-0 left-8 right-8 h-px rounded-full"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(0,212,255,0.45) 50%, transparent)',
          }}
        />
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-wire/20 text-muted hover:text-snow hover:border-wire/40 hover:bg-wire/10 transition-all text-sm font-mono"
        >
          ✕
        </button>

        {connection ? (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan flex-shrink-0" />
              <p className="text-sm font-mono font-semibold text-snow">Connected to GitHub</p>
            </div>
            <div className="text-xs font-mono text-muted space-y-1">
              <p>
                Repository:{' '}
                <span className="text-snow/70">{GITHUB_OWNER}/{GITHUB_REPO}</span>
              </p>
              {isPersistent && (
                <p className="text-ghost">Remembered on this browser</p>
              )}
            </div>
            <button
              onClick={() => { disconnect(); onClose(); }}
              className="rounded-lg border border-signal/25 px-4 py-2 text-sm font-mono text-signal/80 hover:text-signal hover:border-signal/45 hover:bg-signal/8 transition-all"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div>
              <p className="text-sm font-mono font-semibold text-snow">
                Connect to enable actions
              </p>
              <p className="text-sm font-mono text-muted mt-1 leading-relaxed">
                Paste the shared team access code. With "Remember me" ticked, you only need to do this once per browser.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="password"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && connect()}
                placeholder="github_pat_..."
                className="flex-1 rounded-lg bg-depth/80 border border-wire/20 px-4 py-2.5 text-sm font-mono text-snow placeholder:text-ghost focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/10 transition-colors"
                autoFocus
              />
              <button
                onClick={connect}
                disabled={!entry}
                className="rounded-lg px-5 py-2.5 text-sm font-medium text-depth disabled:opacity-40 transition-opacity hover:opacity-90 whitespace-nowrap"
                style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 100%)' }}
              >
                Connect
              </button>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <div
                role="checkbox"
                aria-checked={remember}
                onClick={() => setRemember((v) => !v)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
                  remember ? 'bg-cyan/20 border-cyan/50' : 'border-wire/30 bg-transparent'
                }`}
              >
                {remember && <span className="text-cyan text-[10px] leading-none">✓</span>}
              </div>
              <span className="text-xs font-mono text-muted">Remember me on this browser</span>
            </label>

            <details onToggle={(e) => setShowTechnical((e.target as HTMLDetailsElement).open)}>
              <summary className="text-xs font-mono text-ghost hover:text-muted transition-colors cursor-pointer">
                {showTechnical ? '▲' : '▶'} What permissions does this need?
              </summary>
              <div className="mt-3 text-xs font-mono text-muted space-y-1 pl-3 border-l border-wire/15">
                <p>
                  Repository:{' '}
                  <span className="text-snow/70">{GITHUB_OWNER || '<owner>'}/{GITHUB_REPO || '<repo>'}</span>
                </p>
                <p>Permissions: <span className="text-snow/70">Actions: Read and write · Contents: Read and write</span></p>
                <p className="text-ghost mt-2">
                  Without "Remember me": forgotten when you close this tab.<br />
                  With "Remember me": stored in this browser only, never sent anywhere except api.github.com.
                </p>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
