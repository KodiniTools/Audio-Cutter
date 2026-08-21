import { describe, expect, it } from 'vitest'
import {
  MP3_BLOCK_SIZE,
  channelCountFor,
  concatInt8,
  encodeMp3Blocks,
  type Mp3EncoderLike,
} from '../src/utils/mp3Encoder'

/** Fake-Encoder: 2 Bytes pro encodeBuffer, 1 Byte bei flush. Merkt sich Aufrufe. */
class FakeEncoder implements Mp3EncoderLike {
  bufferCalls = 0
  sawRight = false
  encodeBuffer(_left: Int16Array, right?: Int16Array): Int8Array {
    this.bufferCalls++
    if (right) this.sawRight = true
    return new Int8Array([1, 2])
  }
  flush(): Int8Array {
    return new Int8Array([9])
  }
}

function silent(n: number): Float32Array {
  return new Float32Array(n)
}

describe('channelCountFor', () => {
  it('mono/stereo korrekt', () => {
    expect(channelCountFor([silent(4)])).toBe(1)
    expect(channelCountFor([silent(4), silent(4)])).toBe(2)
    expect(channelCountFor([silent(4), silent(4), silent(4)])).toBe(2)
  })
})

describe('concatInt8', () => {
  it('fügt Chunks in Reihenfolge zusammen', () => {
    const out = concatInt8([new Int8Array([1, 2]), new Int8Array([3]), new Int8Array([])])
    expect(Array.from(out)).toEqual([1, 2, 3])
  })
})

describe('encodeMp3Blocks', () => {
  it('ruft encodeBuffer pro Block auf und hängt flush an (mono)', () => {
    const enc = new FakeEncoder()
    const channels = [silent(MP3_BLOCK_SIZE * 3)] // exakt 3 Blöcke
    const out = encodeMp3Blocks(channels, enc)
    expect(enc.bufferCalls).toBe(3)
    expect(enc.sawRight).toBe(false)
    // 3 Blöcke * 2 Bytes + 1 Byte flush
    expect(out.length).toBe(3 * 2 + 1)
  })

  it('rundet Teilblöcke auf (mono)', () => {
    const enc = new FakeEncoder()
    const channels = [silent(MP3_BLOCK_SIZE + 1)] // 2 Blöcke (1 voll, 1 Rest)
    encodeMp3Blocks(channels, enc)
    expect(enc.bufferCalls).toBe(2)
  })

  it('übergibt rechten Kanal bei Stereo', () => {
    const enc = new FakeEncoder()
    encodeMp3Blocks([silent(MP3_BLOCK_SIZE), silent(MP3_BLOCK_SIZE)], enc)
    expect(enc.sawRight).toBe(true)
  })

  it('meldet monotonen Fortschritt, endet bei 1', () => {
    const enc = new FakeEncoder()
    const seen: number[] = []
    encodeMp3Blocks([silent(MP3_BLOCK_SIZE * 4)], enc, (f) => seen.push(f))
    expect(seen.length).toBeGreaterThan(0)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
    expect(seen[seen.length - 1]).toBe(1)
    // Fortschritt vor flush ist <= 0.99
    expect(Math.max(...seen.slice(0, -1))).toBeLessThanOrEqual(0.99)
  })

  it('behandelt leere Eingabe defensiv', () => {
    const enc = new FakeEncoder()
    const seen: number[] = []
    expect(encodeMp3Blocks([], enc, (f) => seen.push(f)).length).toBe(0)
    expect(encodeMp3Blocks([silent(0)], enc, (f) => seen.push(f)).length).toBe(0)
    expect(enc.bufferCalls).toBe(0)
    expect(seen.every((v) => v === 1)).toBe(true)
  })
})
