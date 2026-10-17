// src/utils/wavEncoder.ts
// Reiner WAV-Encoder (verlustfrei, sample-genau) – testbar in Node.
// Bittiefen: 16/24 bit PCM (Format-Tag 1) und 32 bit Float (Format-Tag 3).

import type { WavBitDepth } from '../types/audio'

const BYTES_PER_SAMPLE: Record<WavBitDepth, number> = { pcm16: 2, pcm24: 3, float32: 4 }

/**
 * Kodiert Kanal-Float-Daten als WAV.
 * @param channels Ein Float32Array pro Kanal ([-1,1]), alle gleich lang.
 * @param sampleRate z. B. 44100
 * @param bitDepth 'pcm16' (Standard), 'pcm24' oder 'float32'
 * @returns ArrayBuffer mit vollständiger WAV-Datei (RIFF/WAVE).
 */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  bitDepth: WavBitDepth = 'pcm16',
): ArrayBuffer {
  const numChannels = channels.length
  const numFrames = numChannels > 0 ? channels[0].length : 0
  const bytesPerSample = BYTES_PER_SAMPLE[bitDepth]
  const isFloat = bitDepth === 'float32'
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  // Nicht-PCM (Float) braucht laut Spezifikation cbSize im fmt-Chunk (18 Byte)
  // und einen fact-Chunk mit der Frame-Anzahl.
  const fmtSize = isFloat ? 18 : 16
  const factSize = isFloat ? 12 : 0
  const headerSize = 12 + 8 + fmtSize + factSize + 8
  const buffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  // RIFF-Header
  writeString(0, 'RIFF')
  view.setUint32(4, headerSize - 8 + dataSize, true)
  writeString(8, 'WAVE')

  // fmt-Chunk
  let p = 12
  writeString(p, 'fmt ')
  view.setUint32(p + 4, fmtSize, true) // Chunk-Größe
  view.setUint16(p + 8, isFloat ? 3 : 1, true) // 3 = IEEE Float, 1 = PCM
  view.setUint16(p + 10, numChannels, true)
  view.setUint32(p + 12, sampleRate, true)
  view.setUint32(p + 16, sampleRate * blockAlign, true) // Byte-Rate
  view.setUint16(p + 20, blockAlign, true)
  view.setUint16(p + 22, 8 * bytesPerSample, true) // Bits pro Sample
  if (isFloat) view.setUint16(p + 24, 0, true) // cbSize
  p += 8 + fmtSize

  if (isFloat) {
    writeString(p, 'fact')
    view.setUint32(p + 4, 4, true)
    view.setUint32(p + 8, numFrames, true)
    p += factSize
  }

  // data-Chunk
  writeString(p, 'data')
  view.setUint32(p + 4, dataSize, true)

  // Interleaved Samples schreiben
  let offset = headerSize
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const raw = channels[ch][frame]
      if (isFloat) {
        // Float behält den vollen Wertebereich (kein Clipping).
        view.setFloat32(offset, raw, true)
      } else {
        const s = Math.max(-1, Math.min(1, raw))
        if (bitDepth === 'pcm16') {
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
        } else {
          const v = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff)
          view.setUint8(offset, v & 0xff)
          view.setUint8(offset + 1, (v >> 8) & 0xff)
          view.setUint8(offset + 2, (v >> 16) & 0xff)
        }
      }
      offset += bytesPerSample
    }
  }

  return buffer
}
