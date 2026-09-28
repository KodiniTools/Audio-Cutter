/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  // Dark-Mode wird ueber das [data-theme="dark"]-Attribut der globalen Nav
  // gesteuert (nicht ueber prefers-color-scheme direkt). Basisklassen =
  // Light, dark:-Varianten = Dark.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      // Semantische Farben = CSS-Variablen aus src/style.css (Farbschema des
      // Color Extractors). Wechseln automatisch mit [data-theme].
      colors: {
        page: 'var(--bg-primary)',
        surface: 'var(--bg-secondary)',
        field: 'var(--bg-input)',
        hover: 'var(--bg-hover)',
        ink: {
          DEFAULT: 'var(--text-primary)',
          soft: 'var(--text-secondary)',
          muted: 'var(--text-tertiary)',
        },
        line: {
          DEFAULT: 'var(--border-color)',
          light: 'var(--border-light)',
          hover: 'var(--border-hover)',
        },
        accent: {
          DEFAULT: 'var(--accent-bg)',
          hover: 'var(--accent-hover)',
          ink: 'var(--accent-text)',
        },
        primary: {
          DEFAULT: 'var(--btn-primary-bg)',
          hover: 'var(--btn-primary-hover)',
          ink: 'var(--btn-primary-text)',
        },
        selection: 'var(--selection-color)',
        'cut-start': 'var(--cut-start)',
        'cut-end': 'var(--cut-end)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        sans: ['Supreme', 'sans-serif'],
        // Monospace wie die Zahlen-Spinner des Color Extractors.
        mono: ['"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
}
