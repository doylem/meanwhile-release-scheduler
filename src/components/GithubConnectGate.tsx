import { useState } from 'react';
import { useGithubConnection } from '../lib/githubConnection';
import { GITHUB_OWNER, GITHUB_REPO } from '../lib/clientConfig';

export function GithubConnectGate() {
  const { connection, setToken, disconnect } = useGithubConnection();
  const [entry, setEntry] = useState('');

  if (connection) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-wire/10 bg-elevated/20 px-5 py-3 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan" />
          <span className="text-muted">
            Connected to GitHub Actions —{' '}
            <span className="text-snow/70">
              {GITHUB_OWNER}/{GITHUB_REPO}
            </span>
          </span>
        </div>
        <button onClick={disconnect} className="text-muted hover:text-signal transition-colors">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-wire/10 bg-elevated/15 p-5 space-y-4">
      <div>
        <p className="text-xs font-mono uppercase tracking-widest text-muted mb-2">GitHub connection required</p>
        <p className="text-sm text-snow/70 leading-relaxed">
          To create calendar events, check Dropbox, or generate an email draft, this app triggers a GitHub Actions
          workflow in{' '}
          <span className="font-mono text-snow">
            {GITHUB_OWNER || '<owner>'}/{GITHUB_REPO || '<repo>'}
          </span>
          . Paste a{' '}
          <a
            className="text-cyan hover:text-cyan/70 transition-colors underline"
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noreferrer"
          >
            fine-grained Personal Access Token
          </a>{' '}
          scoped to <em>only this repository</em> with{' '}
          <span className="text-snow font-mono">Actions: Read and write</span> and{' '}
          <span className="text-snow font-mono">Contents: Read and write</span> permissions.
        </p>
      </div>
      <p className="text-xs font-mono text-muted">
        Token stored in session storage only — never saved to disk, clears on tab close. See README for details.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && entry && setToken(entry)}
          placeholder="github_pat_..."
          className="flex-1 rounded-lg bg-void/60 border border-wire/15 px-4 py-2.5 text-sm font-mono text-snow placeholder:text-ghost focus:outline-none focus:border-cyan/40 focus:ring-1 focus:ring-cyan/10 transition-colors"
        />
        <button
          onClick={() => entry && setToken(entry)}
          disabled={!entry}
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-depth disabled:opacity-40 transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #4a8cf7 100%)' }}
        >
          Connect
        </button>
      </div>
    </div>
  );
}
