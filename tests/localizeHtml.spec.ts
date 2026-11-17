// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { escapeHtml, localizeHtml } from '../src/utils/localizeHtml'
import { PAGE_META, SITE_URL } from '../src/i18n/pageMeta'

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8')
const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html')
const attr = (doc: Document, selector: string, name: string): string | null | undefined =>
  doc.head.querySelector(selector)?.getAttribute(name)

const EN_URL = `${SITE_URL}?lang=en`

describe('localizeHtml mit der echten index.html', () => {
  const en = parse(localizeHtml(indexHtml, 'en', PAGE_META.en, SITE_URL))
  const de = parse(indexHtml)

  it('setzt lang, Titel, Description und Canonical auf Englisch', () => {
    expect(en.documentElement.getAttribute('lang')).toBe('en')
    expect(en.title).toBe(PAGE_META.en.title)
    expect(attr(en, 'meta[name="description"]', 'content')).toBe(PAGE_META.en.description)
    expect(en.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(attr(en, 'link[rel="canonical"]', 'href')).toBe(EN_URL)
  })

  it('passt Open Graph und Twitter an', () => {
    expect(attr(en, 'meta[property="og:title"]', 'content')).toBe(PAGE_META.en.title)
    expect(attr(en, 'meta[property="og:description"]', 'content')).toBe(PAGE_META.en.description)
    expect(attr(en, 'meta[property="og:url"]', 'content')).toBe(EN_URL)
    expect(attr(en, 'meta[property="og:locale"]', 'content')).toBe('en_US')
    expect(attr(en, 'meta[property="og:locale:alternate"]', 'content')).toBe('de_DE')
    expect(attr(en, 'meta[name="twitter:title"]', 'content')).toBe(PAGE_META.en.title)
    expect(attr(en, 'meta[name="twitter:description"]', 'content')).toBe(PAGE_META.en.description)
  })

  it('lässt hreflang, Body und übrigen Head unverändert', () => {
    const hreflangs = (doc: Document) =>
      [...doc.head.querySelectorAll('link[rel="alternate"][hreflang]')].map((l) => l.outerHTML)
    expect(hreflangs(en)).toEqual(hreflangs(de))
    expect(hreflangs(en)).toHaveLength(3)
    expect(en.body.innerHTML).toBe(de.body.innerHTML)
    expect(en.head.children.length).toBe(de.head.children.length)
    // SSI-Includes (Nav, Footer, Cookie-Banner) müssen in der englischen Datei erhalten bleiben.
    const includes = (html: string) => html.match(/<!--#include [^>]*-->/g) ?? []
    expect(includes(localizeHtml(indexHtml, 'en', PAGE_META.en, SITE_URL))).toEqual(
      includes(indexHtml),
    )
  })
})

describe('PAGE_META', () => {
  it('Deutsch stimmt mit dem statischen Head der index.html überein', () => {
    const de = parse(indexHtml)
    expect(de.documentElement.getAttribute('lang')).toBe('de')
    expect(de.title).toBe(PAGE_META.de.title)
    expect(attr(de, 'meta[name="description"]', 'content')).toBe(PAGE_META.de.description)
    expect(attr(de, 'link[rel="canonical"]', 'href')).toBe(SITE_URL)
  })

  it('Englisch hält die SEO-Längen ein', () => {
    expect(PAGE_META.en.title.length).toBeLessThanOrEqual(70)
    expect(PAGE_META.en.description.length).toBeGreaterThanOrEqual(120)
    expect(PAGE_META.en.description.length).toBeLessThanOrEqual(160)
  })
})

describe('localizeHtml Randfälle', () => {
  const minimal = (extra = '', body = '') =>
    `<!DOCTYPE html><html lang="de"><head><title>T</title>` +
    `<meta name="description" content="D"><link rel="canonical" href="${SITE_URL}">${extra}` +
    `</head><body>${body}</body></html>`
  const meta = { title: 'A & "B" <C>', description: 'x > y & z' }

  it('maskiert Sonderzeichen in Titel und Attributen', () => {
    const out = localizeHtml(minimal(), 'en', meta, SITE_URL)
    expect(out).toContain('<title>A &amp; &quot;B&quot; &lt;C&gt;</title>')
    expect(out).toContain('content="x &gt; y &amp; z"')
    expect(parse(out).title).toBe(meta.title)
    expect(escapeHtml('$&')).toBe('$&amp;')
  })

  it('Deutsch lässt lang und Canonical eines deutschen Dokuments stehen', () => {
    const out = localizeHtml(minimal(), 'de', { title: 'T', description: 'D' }, SITE_URL)
    expect(out).toBe(minimal())
  })

  it('fehlende og-Tags sind erlaubt, <title> im Body bleibt unberührt', () => {
    const body = '<svg><title>Icon</title></svg>'
    const out = localizeHtml(minimal('', body), 'en', meta, SITE_URL)
    expect(out).toContain(`<body>${body}</body>`)
  })

  it('bricht bei fehlendem oder doppeltem Pflicht-Tag ab', () => {
    const noCanonical = minimal().replace(/<link rel="canonical"[^>]*>/, '')
    expect(() => localizeHtml(noCanonical, 'en', meta, SITE_URL)).toThrow(/canonical/)
    const twoDescriptions = minimal('<meta name="description" content="E">')
    expect(() => localizeHtml(twoDescriptions, 'en', meta, SITE_URL)).toThrow(/description/)
    const twoOgTitles = minimal(
      '<meta property="og:title" content="1"><meta property="og:title" content="2">',
    )
    expect(() => localizeHtml(twoOgTitles, 'en', meta, SITE_URL)).toThrow(/og:title/)
    expect(() => localizeHtml('<html lang="de"><title>x</title>', 'en', meta, SITE_URL)).toThrow(
      /head/,
    )
  })
})
