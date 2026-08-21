import { describe, expect, it } from 'vitest'
import {
  clamp,
  formatMs,
  msToSamples,
  parseTimeToMs,
  samplesToMs,
  validateRegion,
} from '../src/utils/audioMath'

describe('msToSamples / samplesToMs', () => {
  it('rundet sample-genau', () => {
    expect(msToSamples(1000, 44100)).toBe(44100)
    expect(msToSamples(1, 44100)).toBe(44) // 44.1 -> 44
    expect(msToSamples(0, 48000)).toBe(0)
  })
  it('ist annähernd invers', () => {
    const s = msToSamples(1234, 44100)
    expect(samplesToMs(s, 44100)).toBeCloseTo(1234, 0)
  })
})

describe('clamp', () => {
  it('begrenzt korrekt', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(20, 0, 10)).toBe(10)
  })
  it('behandelt NaN als min', () => {
    expect(clamp(NaN, 3, 10)).toBe(3)
  })
})

describe('formatMs', () => {
  it('formatiert mm:ss.mmm', () => {
    expect(formatMs(0)).toBe('00:00.000')
    expect(formatMs(65432)).toBe('01:05.432')
  })
  it('zeigt Stunden bei Bedarf', () => {
    expect(formatMs(3_600_000)).toBe('1:00:00.000')
  })
  it('clampt negative Werte', () => {
    expect(formatMs(-500)).toBe('00:00.000')
  })
})

describe('parseTimeToMs', () => {
  it('parst mm:ss.mmm', () => {
    expect(parseTimeToMs('01:05.432')).toBe(65432)
    expect(parseTimeToMs('00:00.000')).toBe(0)
  })
  it('parst hh:mm:ss', () => {
    expect(parseTimeToMs('1:00:00')).toBe(3_600_000)
  })
  it('parst reine Zahl als ms', () => {
    expect(parseTimeToMs('1500')).toBe(1500)
  })
  it('lehnt Ungültiges ab', () => {
    expect(parseTimeToMs('')).toBeNull()
    expect(parseTimeToMs('ab:cd')).toBeNull()
    expect(parseTimeToMs('01:70.000')).toBeNull() // 70 sec ungültig
    expect(parseTimeToMs('1:2:3:4')).toBeNull()
  })
})

describe('validateRegion', () => {
  const dur = 10_000
  it('akzeptiert gültige Region', () => {
    expect(validateRegion({ startMs: 0, endMs: 5000 }, dur)).toEqual({ valid: true })
  })
  it('lehnt end <= start ab', () => {
    expect(validateRegion({ startMs: 5000, endMs: 5000 }, dur).valid).toBe(false)
    expect(validateRegion({ startMs: 6000, endMs: 5000 }, dur).valid).toBe(false)
  })
  it('lehnt Bereich außerhalb der Datei ab', () => {
    expect(validateRegion({ startMs: -1, endMs: 5000 }, dur).valid).toBe(false)
    expect(validateRegion({ startMs: 0, endMs: 20000 }, dur).valid).toBe(false)
  })
  it('lehnt ohne Audio ab', () => {
    expect(validateRegion({ startMs: 0, endMs: 100 }, 0).valid).toBe(false)
  })
})
