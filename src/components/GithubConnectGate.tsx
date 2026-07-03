import { useState } from 'react';
import { useGithubConnection } from '../lib/githubConnection';
import { GITHUB_OWNER, GITHUB_REPO } from '../lib/clientConfig';

export function GithubConnectGate() {
  const { connection, setToken, disconnect } = useGithubConnection();
  const [entry, setEntry] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);

  if (connection) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-wire/15 bg-elevated/20 px-5 py-3 text-sm font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan flex-shrink-0" />
          <span className="text-muted">
            Connected to GitHub Actions —{' '}
            <span className="text-snow/70">{GITHUB_OWNER}/{GITHUB_REPO}</span>
          </span>
        </div>
        <button onClick={disconnect} className="text-muted hover:text-signal transition-colors text-xs">
          Disconnect
        </button>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center justify-between rounded-xl border border-wire/15 border-l-2 border-l-cyan/50 bg-elevated/15 px-5 py-3 text-left hover:bg-elevated/25 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-wire/40 flex-shrink-0" />
          <div>
            <p className="text-sm font-mono font-semibold text-snow/80 group-hover:text-snow transition-colors">
              Connect to enable calendar &amp; email actions
            </p>
            <p className="text-xs font-mono text-muted mt-0.5">Click to connect your GitHub access code</p>
          </div>
        </div>
        <span className="text-muted text-xs font-mono">Connect →</span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-l-2 border-l-cyan/60 border-wire/20 bg-elevated/20 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-mono font-semibold text-snow">Connect to enable calendar &amp; email actions</p>
          <p className="text-sm font-mono text-muted mt-1 leading-relaxed">
            This tool needs a private access code to create calendar events, check Dropbox,
            and send emails. Paste your GitHub token below — it's forgotten as soon as you
            close this tab and is never stored anywhere else.
          </p>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-muted hover:text-snow transition-colors text-xs font-mono ml-4 flex-shrink-0"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="password"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && entry && setToken(entry)}
          placeholder="github_pat_..."
          className="flex-1 rounded-lg bg-depth/80 border border-wire/20 px-4 py-2.5 text-sm font-mono text-snow placeholder:text-ghost focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/10 transition-colors"
        />
        <button
          onClick={() => entry && setToken(entry)}
          disabled={!entry}
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-depth disabled:opacity-40 transition-opacity hover:opacity-90 whitespace-nowrap"
          style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 100%)' }}
        >
          Connect
        </button>
      </div>

      <details onToggle={(e) => setShowTechnical((e.target as HTMLDetailsElement).open)}>
        <summary className="text-xs font-mono text-ghost hover:text-muted transition-colors cursor-pointer">
          {showTechnical ? '▲' : '▶'} What permissions does this need?
        </summary>
        <div className="mt-3 text-xs font-mono text-muted space-y-1 pl-3 border-l border-wire/15">
          <p>
            Repository:{' '}
            <span className="text-snow/70">{GITHUB_OWNER || '<owner>'}/{GITHUB_REPO || '<repo>'}</span>
          </p>
          <p>Permissions required: <span className="text-snow/70">Actions: Read and write</span></p>
          <p>And: <span className="text-snow/70">Contents: Read and write</span></p>
          <p className="text-ghost mt-2">Token is kept in browser session storage only — never sent anywhere except api.github.com.</p>
        </div>
      </details>
    </div>
  );
}
