import { describe, expect, it } from 'vitest'
import de from '../src/i18n/locales/de'
import en from '../src/i18n/locales/en'

type Tree = { [k: string]: string | Tree }

/** Flacht ein verschachteltes Katalog-Objekt zu { 'a.b.c': 'text' } ab. */
function flatten(obj: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out[path] = value
    else Object.assign(out, flatten(value, path))
  }
  return out
}

/** Extrahiert Platzhalter wie {value}, {name} als sortierte Liste. */
function placeholders(text: string): string[] {
  const matches = text.match(/\{[^}]+\}/g) ?? []
  return [...matches].sort()
}

const flatDe = flatten(de as unknown as Tree)
const flatEn = flatten(en as unknown as Tree)

describe('i18n-Kataloge', () => {
  it('haben identische Key-Mengen (DE vs EN)', () => {
    expect(Object.keys(flatEn).sort()).toEqual(Object.keys(flatDe).sort())
  })

  it('enthalten keine leeren Werte', () => {
    for (const [k, v] of Object.entries(flatDe)) expect(v.trim(), `de:${k}`).not.toBe('')
    for (const [k, v] of Object.entries(flatEn)) expect(v.trim(), `en:${k}`).not.toBe('')
  })

  it('verwenden pro Key dieselben Platzhalter', () => {
    for (const key of Object.keys(flatDe)) {
      expect(placeholders(flatEn[key]), `Platzhalter ${key}`).toEqual(placeholders(flatDe[key]))
    }
  })

  it('decken alle Validierungs-Codes ab', () => {
    const codes = ['noAudio', 'nonFinite', 'negativeStart', 'endBeyond', 'endBeforeStart']
    for (const c of codes) {
      expect(flatDe[`validation.${c}`], `de validation.${c}`).toBeTruthy()
      expect(flatEn[`validation.${c}`], `en validation.${c}`).toBeTruthy()
    }
  })
})
