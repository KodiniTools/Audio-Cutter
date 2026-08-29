import { describe, expect, it } from 'vitest'
import { absToView, clampZoom, viewToAbs, viewWindow } from '../src/utils/zoom'

describe('clampZoom', () => {
  it('begrenzt auf [1, max]', () => {
    expect(clampZoom(0.5)).toBe(1)
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(10)).toBe(10)
    expect(clampZoom(9999, 500)).toBe(500)
    expect(clampZoom(NaN)).toBe(1)
  })
})

describe('viewWindow', () => {
  it('zoom=1 -> ganzes Fenster', () => {
    const w = viewWindow(1, 0.5)
    expect(w.start).toBe(0)
    expect(w.end).toBe(1)
    expect(w.width).toBe(1)
  })

  it('zentriert auf centerFrac', () => {
    const w = viewWindow(4, 0.5) // Breite 0.25
    expect(w.width).toBeCloseTo(0.25)
    expect(w.start).toBeCloseTo(0.375)
    expect(w.end).toBeCloseTo(0.625)
  })

  it('haelt am linken Rand fest', () => {
    const w = viewWindow(4, 0) // Breite 0.25, Center vor 0
    expect(w.start).toBe(0)
    expect(w.end).toBeCloseTo(0.25)
  })

  it('haelt am rechten Rand fest', () => {
    const w = viewWindow(4, 1)
    expect(w.end).toBe(1)
    expect(w.start).toBeCloseTo(0.75)
  })
})

describe('viewToAbs / absToView', () => {
  it('sind zueinander invers', () => {
    const w = viewWindow(4, 0.5)
    for (const vf of [0, 0.25, 0.5, 1]) {
      expect(absToView(viewToAbs(vf, w), w)).toBeCloseTo(vf)
    }
  })

  it('View-Mitte entspricht Fenster-Mitte (absolut)', () => {
    const w = viewWindow(4, 0.5)
    expect(viewToAbs(0.5, w)).toBeCloseTo(0.5)
  })

  it('absToView liefert <0 bzw. >1 fuer nicht sichtbare Positionen', () => {
    const w = viewWindow(4, 0.5) // sichtbar 0.375..0.625
    expect(absToView(0.1, w)).toBeLessThan(0)
    expect(absToView(0.9, w)).toBeGreaterThan(1)
  })
})
