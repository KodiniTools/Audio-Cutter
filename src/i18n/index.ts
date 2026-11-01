// src/i18n/index.ts
// vue-i18n-Instanz (Composition API, legacy: false).
// Locale-Reihenfolge: ?lang=de|en (hreflang-Ziel) -> localStorage -> 'de'.
// Ohne Parameter und Speicher gilt Deutsch: die URL ohne Parameter ist die
// deutsche Fassung (hreflang de/x-default), Englisch liegt unter ?lang=en.
//
// Bruecke zu den globalen Partials (Nav/Footer/Cookie-Banner): Diese nutzen
// den localStorage-Key 'locale' und das 'locale-changed'-Event. Damit beide
// Sprachumschalter (App-Header UND globale Nav) synchron bleiben, schreibt
// setLocale beide Keys und feuert 'locale-changed'; umgekehrt lauscht die App
// auf 'locale-changed' aus der Nav und zieht nach.

import { createI18n } from 'vue-i18n'
import de from './locales/de'
import en from './locales/en'
import type { AppLocale, MessageSchema } from './messages'
import { applyLocaleHead } from '../utils/localeSeo'

export const SITE_URL = 'https://kodinitools.com/audio-cutter/'

/** Titel und Beschreibung je Sprache (Deutsch steht zusätzlich statisch in index.html). */
export const PAGE_META = {
  de: {
    title: 'Audio-Schneider · ms-genau | KodiniTools',
    description:
      'Audiodateien millisekundengenau schneiden – kostenlos, direkt im Browser (lokal & privat, ohne Upload) oder serverseitig für große Dateien. Export als WAV, MP3, OGG, AAC, WebM und FLAC mit Fade-In/-Out.',
  },
  en: {
    title: 'Audio Cutter · Millisecond-Accurate | KodiniTools',
    description:
      'Cut audio files with millisecond accuracy – free, right in your browser (local & private, no upload) or on the server for large files. Export as WAV, MP3, OGG, AAC, WebM and FLAC with fade in/out.',
  },
} as const

// Eigener Key der App; 'locale' ist der gemeinsame Key der globalen Partials.
const STORAGE_KEY = 'ac_locale'
const SHARED_KEY = 'locale'

function isLocale(v: unknown): v is AppLocale {
  return v === 'de' || v === 'en'
}

export function detectLocale(search = globalThis.location?.search ?? ''): AppLocale {
  const fromUrl = new URLSearchParams(search).get('lang')
  if (isLocale(fromUrl)) return fromUrl
  try {
    // Gemeinsamen Partial-Key bevorzugen, damit die zentrale Nav die Sprache
    // seitenuebergreifend vorgeben kann; danach der App-eigene Key.
    const shared = localStorage.getItem(SHARED_KEY)
    if (isLocale(shared)) return shared
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLocale(stored)) return stored
  } catch {
    /* localStorage evtl. blockiert -> ignorieren */
  }
  return 'de'
}

export const i18n = createI18n<[MessageSchema], AppLocale, false>({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'de',
  messages: { de, en },
})

/**
 * Aktive Sprache umschalten (persistiert + setzt <html lang>, Titel, Canonical, hreflang).
 * @param opts.silent  true = kein 'locale-changed' feuern (wird gesetzt, wenn
 *   der Wechsel bereits AUS diesem Event stammt -> verhindert Endlosschleife).
 */
export function setLocale(locale: AppLocale, opts: { silent?: boolean } = {}): void {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
    localStorage.setItem(SHARED_KEY, locale)
  } catch {
    /* ignorieren */
  }
  // <html lang>, Titel, Canonical (EN = ?lang=en) und hreflang
  applyLocaleHead(SITE_URL, locale, PAGE_META[locale])
  if (!opts.silent && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('locale-changed', { detail: { locale } }))
  }
}

/** Aktuelle Sprache lesen. */
export function currentLocale(): AppLocale {
  return i18n.global.locale.value
}

// Sprachwechsel aus der globalen Nav (oder anderen Partials) uebernehmen –
// still, damit das Event nicht erneut gefeuert wird.
if (typeof window !== 'undefined') {
  window.addEventListener('locale-changed', (e) => {
    const detail = (e as CustomEvent<{ locale?: string }>).detail
    let next: string | null = detail?.locale ?? null
    if (!isLocale(next)) {
      try {
        next = localStorage.getItem(SHARED_KEY)
      } catch {
        next = null
      }
    }
    if (isLocale(next) && next !== currentLocale()) setLocale(next, { silent: true })
  })
}
