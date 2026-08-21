// src/i18n/messages.ts
// Leitet das Nachrichten-Schema aus dem DE-Katalog ab und macht die Keys
// global typsicher (t('...') / $t('...') werden geprüft).

import de from './locales/de'

/** Struktur aller Übersetzungs-Keys (aus dem DE-Katalog abgeleitet). */
export type MessageSchema = typeof de

export type AppLocale = 'de' | 'en'

// vue-i18n: globale Typisierung der Locale-Messages.
declare module 'vue-i18n' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefineLocaleMessage extends MessageSchema {}
}
