import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BitWriter, crc16, crc8, encodeFlac } from '../src/utils/flacEncoder'

const ascii = (s: string): Uint8Array => new Uint8Array([...s].map((c) => c.charCodeAt(0)))

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Dekodiert FLAC mit FFmpeg zu interleaved 16-bit-PCM (Referenz-Decoder). */
function decodeWithFfmpeg(flac: Uint8Array): Int16Array {
  const dir = mkdtempSync(join(tmpdir(), 'flac-test-'))
  try {
    const inPath = join(dir, 'in.flac')
    writeFileSync(inPath, flac)
    const raw = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-xerror', '-i', inPath, '-f', 's16le', '-'],
      {
        maxBuffer: 64 * 1024 * 1024,
      },
    )
    return new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function interleave(channels: Int16Array[]): Int16Array {
  const n = channels[0].length
  const out = new Int16Array(n * channels.length)
  for (let i = 0; i < n; i++)
    for (let c = 0; c < channels.length; c++) out[i * channels.length + c] = channels[c][i]
  return out
}

function sine(n: number, freq: number, amp: number, phase = 0): Int16Array {
  return Int16Array.from({ length: n }, (_, i) => Math.round(amp * Math.sin(i * freq + phase)))
}

describe('CRC', () => {
  it('liefert die Standard-Prüfwerte für "123456789"', () => {
    expect(crc8(ascii('123456789'))).toBe(0xf4)
    expect(crc16(ascii('123456789'))).toBe(0xfee8)
  })
})

describe('BitWriter', () => {
  it('schreibt Bits MSB-zuerst, Vorzeichen, Unär und Auffüllung', () => {
    const w = new BitWriter(1)
    w.writeBits(0b101, 3)
    w.writeSigned(-1, 5) // 11111
    w.writeUnary(2) // 001
    w.writeBits(0xabcdef12, 32)
    const out = w.finish()
    // 101 11111 | 001 + 0xabcdef12 (32 Bit) + 5 Füllbits
    expect(Array.from(out.subarray(0, 1))).toEqual([0b10111111])
    expect(out.length).toBe(6)
    expect(out[1] >> 5).toBe(0b001)
  })
})

describe('encodeFlac', () => {
  it('schreibt fLaC-Marker und STREAMINFO (Rate, Kanäle, Bits, Länge)', () => {
    const l = sine(10_000, 0.05, 8000)
    const out = encodeFlac([l, l], 48_000)
    expect(String.fromCharCode(...out.subarray(0, 4))).toBe('fLaC')
    expect(out[4]).toBe(0x80) // letzter Block, Typ STREAMINFO
    expect((out[5] << 16) | (out[6] << 8) | out[7]).toBe(34)
    const si = out.subarray(8, 42)
    const rate = (si[10] << 12) | (si[11] << 4) | (si[12] >> 4)
    const channels = ((si[12] >> 1) & 0x7) + 1
    const bps = (((si[12] & 1) << 4) | (si[13] >> 4)) + 1
    const total =
      (si[13] & 0xf) * 2 ** 32 + ((si[14] << 24) >>> 0) + (si[15] << 16) + (si[16] << 8) + si[17]
    expect({ rate, channels, bps, total }).toEqual({
      rate: 48_000,
      channels: 2,
      bps: 16,
      total: 10_000,
    })
    // Erster Frame beginnt mit dem Sync-Code 0xFFF8.
    expect([out[42], out[43]]).toEqual([0xff, 0xf8])
  })

  it('komprimiert tonales Material deutlich und Stille fast vollständig', () => {
    const n = 44_100
    const tone = sine(n, 0.03, 12000)
    expect(encodeFlac([tone, tone], 44_100).length).toBeLessThan(n * 2 * 2 * 0.5)
    expect(encodeFlac([new Int16Array(n)], 44_100).length).toBeLessThan(500)
  })

  it('meldet monotonen Fortschritt bis 1', () => {
    const seen: number[] = []
    encodeFlac([sine(20_000, 0.1, 1000)], 44_100, { onProgress: (f) => seen.push(f) })
    expect(seen.at(-1)).toBe(1)
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1])).toBe(true)
  })

  it('lehnt ungültige Eingaben ab', () => {
    expect(() => encodeFlac([], 44_100)).toThrow()
    expect(() =>
      encodeFlac(
        Array.from({ length: 9 }, () => new Int16Array(4)),
        44_100,
      ),
    ).toThrow()
    expect(() => encodeFlac([new Int16Array(4), new Int16Array(5)], 44_100)).toThrow()
    expect(() => encodeFlac([new Int16Array(4)], 0)).toThrow()
  })

  describe.skipIf(!hasFfmpeg())('Bit-genauer Round-Trip mit FFmpeg', () => {
    const n = 44_100 * 2 + 777 // kein Vielfaches der Blockgröße
    const left = sine(n, 0.031, 12000)
    const right = Int16Array.from(left, (v, i) => Math.round(v * 0.7 + 900 * Math.sin(i * 0.2)))
    const noise = Int16Array.from({ length: n }, (_, i) => ((i * 2654435761) >>> 16) - 32768)
    const extremes = Int16Array.from({ length: n }, (_, i) => (i % 2 ? 32767 : -32768))

    const cases: [string, Int16Array[], number, number?][] = [
      ['Stereo 44,1 kHz', [left, right], 44_100],
      ['Mono 48 kHz', [left], 48_000],
      ['Rauschen + Extremwerte (Stereo)', [noise, extremes], 44_100],
      ['Stille', [new Int16Array(n), new Int16Array(n)], 22_050],
      ['ungewöhnliche Rate + Blockgröße', [left.slice(0, 5000)], 37_800, 1000],
      ['sehr kurz', [new Int16Array([1, -5, 3]), new Int16Array([7, 7, 7])], 96_000],
      ['6 Kanäle', [left, right, noise, extremes, left, right], 44_100],
    ]
    for (const [name, channels, rate, blockSize] of cases) {
      it(name, () => {
        const decoded = decodeWithFfmpeg(encodeFlac(channels, rate, { blockSize }))
        expect(decoded.length).toBe(channels[0].length * channels.length)
        expect(
          Buffer.from(decoded.buffer, decoded.byteOffset, decoded.byteLength).equals(
            Buffer.from(interleave(channels).buffer),
          ),
        ).toBe(true)
      })
    }
  })
})
