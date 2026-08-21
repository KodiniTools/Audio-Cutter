// src/utils/wavEncoder.ts
// Reiner 16-bit-PCM-WAV-Encoder (verlustfrei, sample-genau) – testbar in Node.

/**
 * Kodiert Kanal-Float-Daten als 16-bit-PCM-WAV.
 * @param channels Ein Float32Array pro Kanal ([-1,1]), alle gleich lang.
 * @param sampleRate z. B. 44100
 * @returns ArrayBuffer mit vollständiger WAV-Datei (RIFF/WAVE).
 */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = channels.length
  const numFrames = numChannels > 0 ? channels[0].length : 0
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  // RIFF-Header
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')

  // fmt-Chunk
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // Chunk-Größe
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // Byte-Rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 8 * bytesPerSample, true) // Bits pro Sample

  // data-Chunk
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  // Interleaved PCM schreiben
  let offset = 44
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let s = channels[ch][frame]
      s = Math.max(-1, Math.min(1, s))
      const val = s < 0 ? s * 0x8000 : s * 0x7fff
      view.setInt16(offset, val, true)
      offset += 2
    }
  }

  return buffer
}
