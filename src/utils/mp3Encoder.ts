// src/utils/mp3Encoder.ts
// Reine Block-Encoding-Logik für MP3.
// Bewusst OHNE `lamejs`-Import: Der eigentliche Encoder wird injiziert.
// -> In Node testbar (Fake-Encoder), ohne Browser/lamejs-Abhängigkeit.

import { floatToInt16 } from './sliceBuffer'

/** Byte-Chunk, wie ihn lamejs-Encoder liefern (Original: Int8Array, Fork: Uint8Array). */
export type Mp3Chunk = Int8Array | Uint8Array

/** Minimales Encoder-Interface (kompatibel zu lamejs `Mp3Encoder` und Fork). */
export interface Mp3EncoderLike {
  encodeBuffer(left: Int16Array, right?: Int16Array): Mp3Chunk
  flush(): Mp3Chunk
}

/** lamejs verarbeitet 1152 Samples pro Frame. */
export const MP3_BLOCK_SIZE = 1152

/** Zielkanalzahl (mono/stereo) für die gegebenen Eingangskanäle. */
export function channelCountFor(channels: Float32Array[]): 1 | 2 {
  return channels.length >= 2 ? 2 : 1
}

/**
 * Kodiert bereits geschnittene Float32-Kanäle blockweise zu MP3.
 * Der Encoder wird injiziert (Default in useAudioEngine / Worker: lamejs).
 *
 * @param channels Ein Float32Array pro Kanal ([-1,1]).
 * @param encoder  Encoder-Instanz (bereits mit numChannels/sampleRate/kbps erzeugt).
 * @param onProgress Optionaler Fortschritt 0..1 (monoton steigend, endet bei 1).
 * @returns Zusammengefügte MP3-Bytes.
 */
export function encodeMp3Blocks(
  channels: Float32Array[],
  encoder: Mp3EncoderLike,
  onProgress?: (fraction: number) => void,
): Uint8Array<ArrayBuffer> {
  if (channels.length === 0 || channels[0].length === 0) {
    onProgress?.(1)
    return new Uint8Array(0)
  }

  const numChannels = channelCountFor(channels)
  const left = floatToInt16(channels[0])
  const right = numChannels === 2 ? floatToInt16(channels[1]) : undefined

  const chunks: Mp3Chunk[] = []
  const total = left.length // > 0 (oben geprüft)

  for (let i = 0; i < left.length; i += MP3_BLOCK_SIZE) {
    const l = left.subarray(i, i + MP3_BLOCK_SIZE)
    const buf =
      numChannels === 2
        ? encoder.encodeBuffer(l, right!.subarray(i, i + MP3_BLOCK_SIZE))
        : encoder.encodeBuffer(l)
    if (buf.length > 0) chunks.push(buf)
    // 0.99 kappen -> die 1.0 kommt erst nach flush().
    onProgress?.(Math.min(0.99, (i + MP3_BLOCK_SIZE) / total))
  }

  const end = encoder.flush()
  if (end.length > 0) chunks.push(end)
  onProgress?.(1)

  return concatInt8(chunks)
}

/** Fügt eine Liste Byte-Chunks zu einem Uint8Array zusammen. */
export function concatInt8(chunks: Mp3Chunk[]): Uint8Array<ArrayBuffer> {
  let totalLen = 0
  for (const c of chunks) totalLen += c.length
  const out = new Uint8Array(totalLen)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}
