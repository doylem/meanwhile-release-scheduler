/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/pages/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Background layers (darkest → lightest panel)
        void: '#060c18',
        depth: '#0a1828',
        surface: '#122d4a',   // cards / panels — significantly raised from bg
        elevated: '#1b3c5c',  // form inputs, highlighted elements
        // Text
        snow: '#eef4ff',
        muted: '#6a95b5',     // secondary text — brighter and more readable
        ghost: '#3a5f7e',     // placeholder / very subtle
        // Opacity-modifier tokens (border-wire/20, bg-wire/5, text-wire/60 etc.)
        wire: '#7aaac8',      // brighter so /15 and /20 borders are actually visible
        // Backwards-compat aliases used in components
        ink: '#eef4ff',
        paper: '#0a1828',
        // Brand accents
        cyan: '#00d4ff',
        blue: '#4a8cf7',
        violet: '#8b5cf6',
        gold: '#f0c040',
        // Status
        signal: '#ff4848',
      },
      fontFamily: {
        display: ['"IBM Plex Mono"', 'monospace'],
        body: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
