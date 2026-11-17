// Erzeugt beim Build aus der fertigen index.html eine Sprachfassung (index.en.html),
// deren Head schon ohne JavaScript stimmt: <html lang>, <title>, Description, Canonical,
// og:* und twitter:*. Setzt dieselben Werte wie applyLocaleHead (localeSeo.ts) zur Laufzeit.
// Arbeitet bewusst auf dem String (kein DOM im Node-Build) und bricht ab, wenn ein
// erwartetes Tag fehlt oder doppelt vorkommt: lieber ein roter Build als ein falscher Head.

import { localeUrls, ogLocales, type Locale, type LocaleMeta } from './localeSeo'

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
}

/** Maskiert Text für HTML-Attribute und Elementinhalt. */
export function escapeHtml(value: string): string {
  return value.replace(/[&"<>]/g, (ch) => ESCAPES[ch] ?? ch)
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Setzt `attr` in genau dem Tag, das `tagPattern` trifft.
 * `required`: das Tag muss genau einmal vorkommen; sonst höchstens einmal.
 */
function setTagAttr(
  html: string,
  tagPattern: RegExp,
  attr: string,
  value: string,
  required: boolean,
  label: string,
): string {
  const matches = html.match(new RegExp(tagPattern.source, 'gi')) ?? []
  if (matches.length > 1 || (required && matches.length === 0)) {
    throw new Error(`localizeHtml: ${label} kommt ${matches.length}× vor, erwartet genau 1×`)
  }
  const tag = matches[0]
  if (tag === undefined) return html

  const attrPattern = new RegExp(`(\\s${escapeRegExp(attr)}=)"[^"]*"`, 'i')
  if (!attrPattern.test(tag)) {
    throw new Error(`localizeHtml: ${label} hat kein Attribut ${attr}="…"`)
  }
  const replaced = tag.replace(
    attrPattern,
    (_m, prefix: string) => `${prefix}"${escapeHtml(value)}"`,
  )
  return html.replace(tag, () => replaced)
}

const metaTag = (key: 'name' | 'property', value: string): RegExp =>
  new RegExp(`<meta\\b[^>]*\\s${key}="${escapeRegExp(value)}"[^>]*>`)

/**
 * Liefert `html` mit Head-Angaben für `locale`. Pflicht: `<html lang>`, `<title>`,
 * meta description und canonical. og:* und twitter:title/description werden angepasst,
 * wenn vorhanden. hreflang-Links bleiben unverändert (für alle Fassungen gleich).
 */
export function localizeHtml(
  html: string,
  locale: Locale,
  meta: LocaleMeta,
  baseUrl: string,
): string {
  const { canonical } = localeUrls(baseUrl, locale)
  const og = ogLocales(locale)

  // Nur bis </head> bearbeiten: <title> in einem SVG im Body darf nicht getroffen werden.
  const headEnd = html.search(/<\/head>/i)
  if (headEnd < 0) throw new Error('localizeHtml: </head> fehlt')
  const body = html.slice(headEnd)

  let out = setTagAttr(html.slice(0, headEnd), /<html\b[^>]*>/, 'lang', locale, true, '<html>')

  const titles = out.match(/<title\b[^>]*>[\s\S]*?<\/title>/gi) ?? []
  const title = titles[0]
  if (titles.length !== 1 || title === undefined) {
    throw new Error(`localizeHtml: <title> kommt ${titles.length}× vor, erwartet genau 1×`)
  }
  out = out.replace(title, () => `<title>${escapeHtml(meta.title)}</title>`)

  out = setTagAttr(
    out,
    metaTag('name', 'description'),
    'content',
    meta.description,
    true,
    'meta description',
  )
  out = setTagAttr(
    out,
    /<link\b[^>]*\srel="canonical"[^>]*>/,
    'href',
    canonical,
    true,
    'link canonical',
  )

  const optional: Array<['name' | 'property', string, string]> = [
    ['property', 'og:title', meta.title],
    ['property', 'og:description', meta.description],
    ['property', 'og:url', canonical],
    ['property', 'og:locale', og.locale],
    ['property', 'og:locale:alternate', og.alternate],
    ['name', 'twitter:title', meta.title],
    ['name', 'twitter:description', meta.description],
  ]
  for (const [key, name, value] of optional) {
    out = setTagAttr(out, metaTag(key, name), 'content', value, false, `meta ${name}`)
  }
  return out + body
}
