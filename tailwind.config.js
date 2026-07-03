/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/pages/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Background layers (darkest → lightest panel)
        void:     '#050c15',
        depth:    '#091622',
        surface:  '#0f2438',
        elevated: '#162e48',
        // Text — warm cream instead of cold blue-white
        snow:  '#ede9e1',
        muted: '#7a9ab5',
        ghost: '#3a546e',
        // Opacity-modifier token (border-wire/20, bg-wire/5 etc.)
        wire:  '#7aa8c8',
        // Backwards-compat aliases
        ink:   '#ede9e1',
        paper: '#091622',
        // Brand accents
        cyan:   '#00d4ff',  // Meanwhile Recordings
        violet: '#8b5cf6',  // Meanwhile Horizons
        amber:  '#e08010',  // warm energy accent
        lime:   '#b8ff30',  // neon cool — used sparingly
        // Status / legacy
        blue:   '#4a8cf7',  // kept for backwards compat
        gold:   '#f0a820',  // warnings / dry-run (warmer than before)
        signal: '#ff4848',
      },
      fontFamily: {
        display: ['"IBM Plex Mono"', 'monospace'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        panel: '0 4px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06)',
        card: '0 2px 16px rgba(0,0,0,0.4)',
        modal: '0 32px 80px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.07)',
      },
    },
  },
  plugins: [],
};
