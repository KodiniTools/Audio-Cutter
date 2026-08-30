/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  // Dark-Mode wird ueber das [data-theme="dark"]-Attribut der globalen Nav
  // gesteuert (nicht ueber prefers-color-scheme direkt). Basisklassen =
  // Light, dark:-Varianten = Dark.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: { extend: {} },
  plugins: [],
}
