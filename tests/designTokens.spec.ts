/**
 * Regressionsschutz für die Design-Tokens der Oberfläche (portiert aus dem
 * Collage Maker, src/tests/designTokens.spec.ts).
 *
 * Die Oberfläche läuft auf den gemeinsamen KodiniTools-Tokens (--ds-*, siehe
 * src/design-system/README.md). Tailwind kennt nur noch semantische Farbklassen
 * (surface, line, ink, accent, on-accent, link, Status); die Variablen wechseln
 * mit dem Theme. Diese Tests verhindern die Rückkehr der alten Color-Extractor-
 * Palette, von dark:-Varianten, Gradients, Blur, Karten-Schatten und
 * Tailwind-Standardfarben und stellen sicher, dass Supreme in allen genutzten
 * Gewichten geladen wird.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT_DIR = join(__dirname, '..')
const SRC_DIR = join(ROOT_DIR, 'src')

function collectFiles(dir: string, ext: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectFiles(full, ext, out)
    } else if (entry.endsWith(ext)) {
      out.push(full)
    }
  }
  return out
}

/** Liefert alle Zeilen (Datei:Zeile), in denen das Muster vorkommt. */
function findInVueFiles(pattern: RegExp): string[] {
  const hits: string[] = []
  for (const file of collectFiles(SRC_DIR, '.vue')) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        hits.push(`${relative(SRC_DIR, file)}:${index + 1}`)
      }
    })
  }
  return hits
}

const styleCss = readFileSync(join(SRC_DIR, 'style.css'), 'utf8')
const tailwindConfig = readFileSync(join(ROOT_DIR, 'tailwind.config.js'), 'utf8')

describe('Design-Tokens in Vue-Komponenten', () => {
  it('nutzen keine Klassen der alten Palette (ink-soft, line-light, page, field, primary, selection …)', () => {
    const legacy =
      /\b(?:bg|text|border|ring|divide|fill|stroke)-(?:ink-(?:soft|muted)|line-(?:light|hover)|page|field|hover|primary|selection|cut-(?:start|end)|accent-ink)\b/
    expect(findInVueFiles(legacy)).toEqual([])
  })

  it('nutzen keine Variablen der alten Palette (--bg-*, --text-primary, --accent-bg, --wave-* …)', () => {
    const legacyVars =
      /var\(--(?:bg-|text-(?:primary|secondary|tertiary)|accent-(?:bg|hover|text)|btn-|border-(?:color|light|hover)|selection-|slider-|shadow-(?:soft|medium)|wave-|cut-|danger\))/
    expect(findInVueFiles(legacyVars)).toEqual([])
    expect(styleCss).not.toMatch(legacyVars)
  })

  it('nutzen keine Tailwind-Standardfarben (slate-500, green-600, white/20 …)', () => {
    const defaults =
      /\b(?:bg|text|border|ring|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|\b(?:bg|text|border)-white\/\d+/
    expect(findInVueFiles(defaults)).toEqual([])
  })

  it('nutzen keine dark:-Varianten mehr (die Tokens wechseln mit dem Theme)', () => {
    expect(findInVueFiles(/\bdark:/)).toEqual([])
  })

  it('nutzen keine Gradients, Blur oder Karten-Schatten', () => {
    const effects =
      /\b(?:bg-gradient-to-\w+|backdrop-blur(?:-\w+)?|blur-3xl|(?:hover:)?shadow-(?:sm|md|lg|xl|2xl)|hover:scale-\d+|hover:-translate-y-\d+)\b|linear-gradient|translateY\(/
    expect(findInVueFiles(effects)).toEqual([])
    expect(styleCss).not.toMatch(/linear-gradient|backdrop-filter|translateY\(|scale\(/)
  })

  it('nutzen nur die drei Radien und die Token-Dauern', () => {
    expect(findInVueFiles(/\brounded-(?:xl|2xl|3xl|\[)|\bduration-\d+\b/)).toEqual([])
  })

  it('setzen Fokus über den Fokus-Ring der Tokens statt focus:ring-*', () => {
    expect(findInVueFiles(/\bfocus:ring-/)).toEqual([])
  })

  it('bleiben in der Token-Skala text-xs … text-3xl (kein text-base, keine Pixelwerte)', () => {
    expect(
      findInVueFiles(
        /\btext-(?:base|[4-9]xl)\b|\btext-\[[^\]]+\]|\bleading-(?:relaxed|snug|loose)\b/,
      ),
    ).toEqual([])
  })

  it('zeigen keine Emoji in der Oberfläche', () => {
    expect(findInVueFiles(/[\u{1F300}-\u{1FAFF}\u{2B07}]/u)).toEqual([])
  })
})

describe('Typografie-Brücke', () => {
  it.each(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'])(
    'text-%s kommt aus dem gleichnamigen Token',
    (step) => {
      expect(tailwindConfig).toMatch(new RegExp(`'?${step}'?: \\['var\\(--ds-text-${step}\\)'`))
    },
  )

  it('bindet Schriftfamilie, Gewichte und Zeilenhöhen an Tokens', () => {
    expect(tailwindConfig).toContain("sans: 'var(--ds-font-sans)'")
    expect(tailwindConfig).toContain("semibold: 'var(--ds-weight-semibold)'")
    expect(tailwindConfig).toContain("tight: 'var(--ds-leading-tight)'")
  })

  it('setzt die Grundgröße des Body wie der Collage Maker auf --ds-text-lg', () => {
    expect(styleCss).toMatch(/body \{[^}]*font-size: var\(--ds-text-lg\)/)
  })
})

describe('UI-Schrift Supreme', () => {
  it.each([400, 500, 700])('deklariert @font-face für Gewicht %i', (weight) => {
    const faces = styleCss.match(/@font-face\s*{[^}]*}/g) ?? []
    const supremeFaces = faces.filter((face) => /font-family:\s*'Supreme'/.test(face))
    const match = supremeFaces.find((face) => new RegExp(`font-weight:\\s*${weight}\\b`).test(face))
    expect(match, `Kein @font-face für Supreme ${weight}`).toBeDefined()
    expect(match).toMatch(/\.\/assets\/fonts\/Supreme-(Regular|Medium|Bold)\.woff2/)
  })

  it.each(['Regular', 'Medium', 'Bold'])('liefert Supreme-%s als Datei aus', (cut) => {
    const file = join(SRC_DIR, 'assets', 'fonts', `Supreme-${cut}.woff2`)
    expect(statSync(file).size).toBeGreaterThan(1000)
  })
})

describe('Partials und Modals', () => {
  it('rendert Modals per Teleport in #modal-portal (über der SSI-Nav)', () => {
    const app = readFileSync(join(SRC_DIR, 'App.vue'), 'utf8')
    expect(app).toContain('<div id="modal-portal"></div>')
    const teleports = collectFiles(SRC_DIR, '.vue')
      .map((file) => readFileSync(file, 'utf8'))
      .flatMap((src) => src.match(/<Teleport[^>]*>/g) ?? [])
    expect(teleports.length).toBeGreaterThan(0)
    expect(teleports.filter((tag) => !tag.includes('to="#modal-portal"'))).toEqual([])
    expect(styleCss).toMatch(/#modal-portal \{[^}]*z-index: var\(--ds-z-backdrop\)/)
  })

  it('gleicht die SSI-Partials an die Tokens an und nimmt den Cookie-Banner aus', () => {
    expect(styleCss).toContain('color: var(--ds-text) !important;')
    expect(styleCss).toContain('color: var(--ds-link) !important;')
    expect(styleCss).toMatch(/\.cookie-banner,[\s\S]*?z-index: 10000 !important;/)
  })

  it('setzt das Theme vor dem ersten Paint (Standard Light)', () => {
    const indexHtml = readFileSync(join(ROOT_DIR, 'index.html'), 'utf8')
    expect(indexHtml).toContain("storedTheme === 'dark' ? 'dark' : 'light'")
    expect(indexHtml).not.toContain("prefers-color-scheme: dark)').matches")
  })
})

describe('Waveform-Canvas', () => {
  it('zeichnet mit Token-Farben aus themeColorsV2(settings.theme)', () => {
    const src = readFileSync(join(SRC_DIR, 'components', 'WaveformEditor.vue'), 'utf8')
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([])
    expect(src).toMatch(/themeColorsV2\(settings\.theme\)/)
  })
})
