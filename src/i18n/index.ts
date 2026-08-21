// src/i18n/index.ts
// vue-i18n-Instanz (Composition API, legacy: false).
// Locale-Reihenfolge: localStorage -> navigator.language -> 'de'.

import { createI18n } from 'vue-i18n'
import de from './locales/de'
import en from './locales/en'
import type { AppLocale, MessageSchema } from './messages'

const STORAGE_KEY = 'ac_locale'

function detectLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'de' || stored === 'en') return stored
  } catch {
    /* localStorage evtl. blockiert -> ignorieren */
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'de').toLowerCase()
  return nav.startsWith('en') ? 'en' : 'de'
}

export const i18n = createI18n<[MessageSchema], AppLocale, false>({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'de',
  messages: { de, en },
})

/** Aktive Sprache umschalten (persistiert + setzt <html lang>). */
export function setLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* ignorieren */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}

/** Aktuelle Sprache lesen. */
export function currentLocale(): AppLocale {
  return i18n.global.locale.value
}
