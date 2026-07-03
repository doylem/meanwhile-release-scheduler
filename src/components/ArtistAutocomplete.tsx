import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

export function ArtistAutocomplete({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const query = value.trim();
  const matches =
    query.length < 1
      ? []
      : suggestions
          .filter((a) => a.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => {
            const q = query.toLowerCase();
            const aStarts = a.toLowerCase().startsWith(q);
            const bStarts = b.toLowerCase().startsWith(q);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return a.localeCompare(b);
          })
          .slice(0, 9);

  const showDropdown = open && matches.length > 0;

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  function select(artist: string) {
    onChange(artist);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      const match = matches[highlighted];
      if (match) {
        e.preventDefault();
        select(match);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        required={required}
        autoComplete="off"
        spellCheck={false}
      />
      {showDropdown && (
        <div
          className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-wire/25 overflow-hidden"
          style={{
            background: '#091622',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 1px 0 rgba(122,168,200,0.08)',
          }}
        >
          <ul className="max-h-52 overflow-y-auto py-1">
            {matches.map((artist, i) => (
              <li
                key={artist}
                onMouseDown={() => select(artist)}
                className={`px-4 py-2 text-sm font-mono cursor-pointer transition-colors ${
                  i === highlighted
                    ? 'bg-elevated text-snow'
                    : 'text-snow/65 hover:bg-surface hover:text-snow/90'
                }`}
              >
                {highlightMatch(artist, query)}
              </li>
            ))}
          </ul>
          <div className="px-4 py-1.5 border-t border-wire/10">
            <span className="text-[10px] font-mono text-ghost">
              ↑↓ navigate · Enter to select · Esc to close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <Fragment>
      {text.slice(0, idx)}
      <span className="text-cyan">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </Fragment>
  );
}
