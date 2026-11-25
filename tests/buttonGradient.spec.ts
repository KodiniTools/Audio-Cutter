import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const stage3 = readFileSync(join(__dirname, '..', 'src', 'assets', 'kodini-stage3.css'), 'utf8')

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05)
}

function gradientStops(token: string): string[] {
  const match = stage3.match(new RegExp(`--${token}:\\s*linear-gradient\\(([^;]+)\\);`))
  expect(match).not.toBeNull()
  return [...(match?.[1] ?? '').matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0])
}

describe('Button-Verlauf (Equalizer-19-Muster)', () => {
  it.each(['cutter-button-gold-grad', 'cutter-button-gold-grad-hover'])(
    '%s: jeder Stopp erreicht mit weißer Schrift WCAG AA (4,5:1)',
    (token) => {
      const stops = gradientStops(token)
      expect(stops).toHaveLength(3)
      for (const stop of stops) {
        expect(contrastWithWhite(stop)).toBeGreaterThanOrEqual(4.5)
      }
    },
  )

  it('Hauptbuttons und aktive Sprachauswahl nutzen den Verlauf', () => {
    expect(stage3).toMatch(/background-image: var\(--cutter-button-gold-grad\);/)
    expect(stage3).toMatch(/background-image: var\(--cutter-button-gold-grad\) !important;/)
    expect(stage3).toMatch(/background-image: var\(--cutter-button-gold-grad-hover\);/)
    expect(stage3).toMatch(/background-image: var\(--cutter-button-gold-grad-hover\) !important;/)
  })
})
