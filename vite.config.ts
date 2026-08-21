// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// WICHTIG: base = Subdir-Pfad auf dem VPS (kodinitools.com/audio-cutter/).
export default defineConfig({
  base: '/audio-cutter/',
  plugins: [vue()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
})
