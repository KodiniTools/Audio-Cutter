// vite.config.ts
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { PAGE_META, SITE_URL } from './src/i18n/pageMeta'
import { localizeHtml } from './src/utils/localizeHtml'

/**
 * Schreibt neben dist/index.html eine englische Fassung dist/index.en.html mit
 * englischem <html lang>, Titel, Description, Canonical (?lang=en), og:* und twitter:*.
 * nginx liefert sie für /audio-cutter/?lang=en aus (deploy/nginx-audio-cutter.conf),
 * damit Crawler ohne JavaScript schon im HTML Englisch sehen. Laufzeit-i18n bleibt unverändert.
 */
function localizedIndexHtml(): Plugin {
  return {
    name: 'localized-index-html',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') {
        this.error('localized-index-html: index.html fehlt im Bundle')
      }
      const html =
        typeof index.source === 'string' ? index.source : new TextDecoder().decode(index.source)
      this.emitFile({
        type: 'asset',
        fileName: 'index.en.html',
        source: localizeHtml(html, 'en', PAGE_META.en, SITE_URL),
      })
    },
  }
}

// WICHTIG: base = Subdir-Pfad auf dem VPS (kodinitools.com/audio-cutter/).
export default defineConfig({
  base: '/audio-cutter/',
  plugins: [vue(), localizedIndexHtml()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
})
