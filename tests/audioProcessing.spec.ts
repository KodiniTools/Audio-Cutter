import { describe, expect, it } from 'vitest'
import { applyFade, floatToInt16, removeRegion, sliceChannels } from '../src/utils/sliceBuffer'
import { encodeWav } from '../src/utils/wavEncoder'
import { computePeaks } from '../src/utils/waveform'

function ramp(n: number): Float32Array {
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = i / n
  return a
}

describe('sliceChannels', () => {
  it('schneidet auf richtige Länge', () => {
    const ch = [ramp(100)]
    const out = sliceChannels(ch, 10, 40)
    expect(out[0].length).toBe(30)
    expect(out[0][0]).toBeCloseTo(0.1)
  })
  it('klemmt Grenzen defensiv', () => {
    const ch = [ramp(100)]
    expect(sliceChannels(ch, -50, 500)[0].length).toBe(100)
    expect(sliceChannels(ch, 80, 20)[0].length).toBe(0) // end < start -> leer
  })
  it('lässt Original unverändert', () => {
    const ch = [ramp(10)]
    const copy = Float32Array.from(ch[0])
    sliceChannels(ch, 2, 5)
    expect(Array.from(ch[0])).toEqual(Array.from(copy))
  })
  it('behandelt leere Eingabe', () => {
    expect(sliceChannels([], 0, 10)).toEqual([])
  })
})

describe('removeRegion', () => {
  it('entfernt Bereich und verbindet Kopf + Rest', () => {
    const ch = [ramp(100)]
    const out = removeRegion(ch, 10, 40) // entfernt [10,40) -> 70 Samples
    expect(out[0].length).toBe(70)
    expect(out[0][0]).toBeCloseTo(0.0) // Kopf beginnt bei 0
    expect(out[0][9]).toBeCloseTo(0.09) // letztes Kopf-Sample (Index 9)
    expect(out[0][10]).toBeCloseTo(0.4) // erstes Rest-Sample (war Index 40)
  })
  it('nur Kopf, wenn bis Ende entfernt', () => {
    const ch = [ramp(100)]
    expect(removeRegion(ch, 60, 100)[0].length).toBe(60)
  })
  it('nur Rest, wenn ab Anfang entfernt', () => {
    const ch = [ramp(100)]
    const out = removeRegion(ch, 0, 40)
    expect(out[0].length).toBe(60)
    expect(out[0][0]).toBeCloseTo(0.4)
  })
  it('leer, wenn alles entfernt wird', () => {
    expect(removeRegion([ramp(100)], 0, 100)[0].length).toBe(0)
  })
  it('lässt Original unverändert', () => {
    const ch = [ramp(10)]
    const copy = Float32Array.from(ch[0])
    removeRegion(ch, 2, 5)
    expect(Array.from(ch[0])).toEqual(Array.from(copy))
  })
})

describe('applyFade', () => {
  it('setzt erstes/letztes Sample auf 0', () => {
    const ch = [new Float32Array(1000).fill(1)]
    applyFade(ch, 1000, 100, 100) // 100ms @1000Hz = 100 Samples
    expect(ch[0][0]).toBeCloseTo(0)
    expect(ch[0][999]).toBeCloseTo(0)
    expect(ch[0][500]).toBeCloseTo(1)
  })
  it('überlappt Fades nicht (Clamping auf Hälfte)', () => {
    const ch = [new Float32Array(10).fill(1)]
    applyFade(ch, 1000, 100000, 100000) // absurd lang -> max = 5
    expect(ch[0].every((v) => v >= 0 && v <= 1)).toBe(true)
  })
  it('macht bei fade=0 nichts', () => {
    const ch = [new Float32Array(10).fill(0.5)]
    applyFade(ch, 1000, 0, 0)
    expect(ch[0].every((v) => v === 0.5)).toBe(true)
  })
})

describe('floatToInt16', () => {
  it('konvertiert mit Clipping', () => {
    const out = floatToInt16(new Float32Array([0, 1, -1, 2, -2]))
    expect(out[0]).toBe(0)
    expect(out[1]).toBe(32767)
    expect(out[2]).toBe(-32768)
    expect(out[3]).toBe(32767) // geklippt
    expect(out[4]).toBe(-32768)
  })
})

describe('encodeWav', () => {
  it('schreibt korrekten RIFF/WAVE-Header', () => {
    const buf = encodeWav([new Float32Array([0, 0.5, -0.5])], 44100)
    const view = new DataView(buf)
    const tag = (o: number) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3))
    expect(tag(0)).toBe('RIFF')
    expect(tag(8)).toBe('WAVE')
    expect(tag(12)).toBe('fmt ')
    expect(tag(36)).toBe('data')
    expect(view.getUint16(22, true)).toBe(1) // 1 Kanal
    expect(view.getUint32(24, true)).toBe(44100)
    expect(view.getUint16(34, true)).toBe(16) // 16 bit
  })
  it('berechnet data-Größe für Stereo', () => {
    const buf = encodeWav([new Float32Array(100), new Float32Array(100)], 48000)
    const view = new DataView(buf)
    // 100 frames * 2 ch * 2 byte = 400
    expect(view.getUint32(40, true)).toBe(400)
    expect(buf.byteLength).toBe(44 + 400)
  })
  it('kodiert Sample-Werte (roundtrip 16-bit)', () => {
    const buf = encodeWav([new Float32Array([0.5])], 8000)
    const view = new DataView(buf)
    const sample = view.getInt16(44, true)
    expect(sample).toBeCloseTo(0.5 * 0x7fff, -1)
  })
})

describe('computePeaks', () => {
  it('liefert width Buckets', () => {
    const peaks = computePeaks(ramp(1000), 50)
    expect(peaks.length).toBe(50)
    expect(peaks[0].min).toBeLessThanOrEqual(peaks[0].max)
  })
  it('behandelt leere Daten / width 0', () => {
    expect(computePeaks(new Float32Array(0), 10)).toEqual([])
    expect(computePeaks(ramp(100), 0)).toEqual([])
  })
  it('erfasst Min/Max korrekt', () => {
    const ch = new Float32Array([-1, 1, -0.5, 0.5])
    const peaks = computePeaks(ch, 1)
    expect(peaks[0].min).toBeCloseTo(-1)
    expect(peaks[0].max).toBeCloseTo(1)
  })
})
