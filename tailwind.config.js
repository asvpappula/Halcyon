/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-sunken)',
        base: 'var(--bg-base)',
        panel: 'var(--surface-1)',
        raised: 'var(--surface-2)',
        hover: 'var(--surface-3)',
        hairline: 'var(--border-default)',
        'hairline-subtle': 'var(--border-subtle)',
        'hairline-strong': 'var(--border-strong)',
        fg: 'var(--text-primary)',
        'fg-dim': 'var(--text-secondary)',
        'fg-muted': 'var(--text-muted)',
        'fg-faint': 'var(--text-faint)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-press': 'var(--accent-press)',
        'accent-subtle': 'var(--accent-subtle)',
      },
      borderRadius: { sm: '4px', md: '6px', lg: '8px' },
      fontFamily: { ui: ['Inter', 'system-ui', 'sans-serif'] },
      transitionDuration: { fast: '120ms', DEFAULT: '160ms', slow: '240ms' },
      transitionTimingFunction: { out: 'cubic-bezier(0.2, 0, 0, 1)' },
    },
  },
  plugins: [],
}
