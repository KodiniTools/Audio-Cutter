import { describe, expect, it } from 'vitest'
import { displayGain, peakAmplitude } from '../src/utils/waveform'

describe('peakAmplitude', () => {
  it('liefert den größten Betrag, auch bei negativen Spitzen', () => {
    expect(peakAmplitude(new Float32Array([0.1, -0.5, 0.25]))).toBeCloseTo(0.5)
  })

  it('ist 0 bei leeren Daten und ignoriert NaN', () => {
    expect(peakAmplitude(new Float32Array(0))).toBe(0)
    expect(peakAmplitude(new Float32Array([NaN, 0.2]))).toBeCloseTo(0.2)
  })
})

describe('displayGain', () => {
  it('skaliert leise Dateien auf fast volle Höhe', () => {
    expect(0.2 * displayGain(0.2)).toBeCloseTo(0.92)
  })

  it('zeichnet voll ausgesteuerte und übersteuerte Dateien nie über den Rand', () => {
    expect(1 * displayGain(1)).toBeLessThanOrEqual(1)
    expect(1.5 * displayGain(1.5)).toBeLessThanOrEqual(1)
  })

  it('begrenzt die Verstärkung bei fast stillen Dateien', () => {
    expect(displayGain(0.0001)).toBe(12)
  })

  it('bleibt bei Stille oder ungültigen Werten neutral', () => {
    expect(displayGain(0)).toBe(1)
    expect(displayGain(NaN)).toBe(1)
    expect(displayGain(-1)).toBe(1)
  })
})
