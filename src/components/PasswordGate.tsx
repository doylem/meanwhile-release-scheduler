import { useEffect, useState, type ReactNode } from 'react';
import { APP_PASSWORD } from '../lib/clientConfig';

const SESSION_KEY = 'meanwhile-app-unlocked';

export function PasswordGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(!APP_PASSWORD);
  const [entry, setEntry] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!APP_PASSWORD) return;
    if (sessionStorage.getItem(SESSION_KEY) === 'true') setUnlocked(true);
  }, []);

  if (unlocked) return <>{children}</>;

  function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (entry === APP_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setUnlocked(true);
    } else {
      setError('Wrong password.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Subtle background art */}
      <svg
        viewBox="0 0 600 600"
        className="absolute inset-0 m-auto w-[600px] h-[600px] opacity-[0.04] pointer-events-none"
      >
        <defs>
          <clipPath id="pw-clip">
            <circle cx="300" cy="300" r="260" />
          </clipPath>
        </defs>
        <g clipPath="url(#pw-clip)" stroke="#00d4ff" strokeWidth="2">
          {Array.from({ length: 40 }, (_, i) => (
            <line key={i} x1={i * 16} y1="0" x2={i * 16} y2="600" />
          ))}
        </g>
      </svg>

      <form onSubmit={tryUnlock} className="relative z-10 w-full max-w-sm space-y-5">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <svg width="22" height="16" viewBox="0 0 24 17" fill="#00d4ff">
              <rect x="0" y="5" width="3.5" height="12" rx="0.5" />
              <rect x="5" y="0" width="3.5" height="17" rx="0.5" />
              <rect x="10" y="3" width="3.5" height="14" rx="0.5" />
              <rect x="15" y="7" width="3.5" height="10" rx="0.5" />
              <rect x="20" y="4" width="3.5" height="13" rx="0.5" />
            </svg>
            <span className="font-mono font-semibold text-snow text-lg tracking-tight">meanwhile</span>
          </div>
          <h1 className="font-mono text-2xl font-semibold text-snow">Release Scheduler</h1>
          <p className="text-sm text-muted font-mono mt-1">Internal tool — enter access password to continue</p>
        </div>

        <input
          type="password"
          autoFocus
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          className="w-full rounded-xl border border-wire/15 bg-elevated/40 px-4 py-3 text-snow font-mono placeholder:text-ghost focus:outline-none focus:border-cyan/40 focus:ring-1 focus:ring-cyan/10 transition-colors"
          placeholder="Password"
        />

        {error && (
          <p className="text-signal text-sm font-mono bg-signal/10 border border-signal/20 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-xl py-3 font-medium text-depth hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 100%)' }}
        >
          Enter
        </button>
      </form>
    </div>
  );
}
