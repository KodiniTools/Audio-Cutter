// src/partials/index.ts
// Bindet die globalen KodiniTools-Partials (Nav, Footer) in die
// SPA ein. Die Partials sind bewusst als eigenstaendige Vanilla-Bausteine
// gehalten (eigenes i18n via localStorage 'locale' + 'locale-changed'-Event,
// eigenes Theme via [data-theme]), damit sie 1:1 mit den zentralen Versionen
// der Website synchron bleiben. Kein Cookie-Banner/Consent Mode: KodiniTools
// setzt keine Analyse-, Marketing- oder Tracking-Cookies ein (20.11.2026).

import navHtml from './nav.html?raw'
import footerHtml from './footer.html?raw'

/**
 * Fuegt ein rohes HTML-Fragment relativ zu einem Referenzknoten ein und
 * fuehrt enthaltene <script>-Tags aus. Per innerHTML gesetzte Skripte laufen
 * NICHT von selbst – sie werden daher als frische <script>-Elemente neu
 * erzeugt und ans Body-Ende gehaengt (nachdem das Markup bereits im DOM ist,
 * damit die IIFEs ihre Elemente per ID/Klasse finden).
 */
function injectPartial(html: string, position: 'before' | 'after', ref: Element): void {
  const holder = document.createElement('div')
  holder.innerHTML = html

  // Skripte einsammeln und aus dem Fragment entfernen (werden separat ausgefuehrt).
  const scripts: HTMLScriptElement[] = []
  holder.querySelectorAll('script').forEach((old) => {
    const script = document.createElement('script')
    for (const attr of Array.from(old.attributes)) script.setAttribute(attr.name, attr.value)
    script.textContent = old.textContent
    scripts.push(script)
    old.remove()
  })

  const fragment = document.createDocumentFragment()
  while (holder.firstChild) fragment.appendChild(holder.firstChild)

  const parent = ref.parentNode
  if (!parent) return
  if (position === 'before') parent.insertBefore(fragment, ref)
  else parent.insertBefore(fragment, ref.nextSibling)

  // Markup steht jetzt im DOM -> Skripte ausfuehren (in Original-Reihenfolge).
  scripts.forEach((script) => document.body.appendChild(script))
}

/** Nav oberhalb, Footer unterhalb der Vue-App einhaengen. */
export function mountGlobalPartials(): void {
  const app = document.getElementById('app')
  if (!app) return
  // Nur einmal einhaengen (Schutz vor doppeltem Aufruf, z. B. bei HMR).
  if (document.querySelector('.global-nav')) return

  injectPartial(navHtml, 'before', app)
  injectPartial(footerHtml, 'after', app)
}
