// src/i18n/pageMeta.ts
// Titel und Beschreibung je Sprache, ohne Laufzeit-Abhängigkeiten (kein vue-i18n,
// kein DOM), damit auch der Build (vite.config.ts) sie importieren kann.

import type { Locale, LocaleMeta } from '../utils/localeSeo'

/** Öffentliche URL der deutschen Hauptfassung (Englisch: `?lang=en`). */
export const SITE_URL = 'https://kodinitools.com/audio-cutter/'

/**
 * Deutsch steht zusätzlich statisch in index.html, Englisch schreibt der Build
 * in dist/index.en.html (siehe utils/localizeHtml.ts).
 */
export const PAGE_META = {
  de: {
    title: 'MP3 schneiden online – Audio-Schneider ohne Upload | KodiniTools',
    description:
      'MP3 schneiden online und kostenlos: Audio millisekundengenau kürzen, im Browser ohne Upload (Server-Modus optional). Fade-In/-Out, Export als WAV, MP3, FLAC.',
  },
  en: {
    title: 'Audio Cutter Online – Cut MP3 Without Upload | KodiniTools',
    description:
      'Free online audio cutter: trim MP3 and more with millisecond accuracy, locally in your browser, no upload (optional server mode). Fade in/out, WAV, MP3, FLAC.',
  },
} as const satisfies Record<Locale, LocaleMeta>
