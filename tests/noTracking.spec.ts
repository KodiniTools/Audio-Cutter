// KodiniTools setzt keine Analyse-, Marketing- oder Tracking-Dienste ein
// (Entscheidung 20.11.2026): kein Consent Mode, kein Cookie-Banner, kein gtag.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

describe('ohne Tracking', () => {
  it('index.html enthält keinen Consent Mode und kein gtag', () => {
    expect(read('index.html')).not.toMatch(/googletagmanager|gtag|dataLayer|cookieConsent/)
  })

  it('Partials binden keinen Cookie-Banner mehr ein', () => {
    expect(read('src/partials/index.ts')).not.toMatch(/cookiebanner/i)
    expect(read('src/partials/footer.html')).not.toMatch(/CookieConsent|cookieSettings/)
  })
})
