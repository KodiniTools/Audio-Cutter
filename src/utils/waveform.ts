// src/utils/waveform.ts
// Berechnet Min/Max-Peaks pro Pixel-Bucket für die Waveform-Darstellung.

export interface Peak {
  min: number
  max: number
}

/**
 * Reduziert Kanaldaten auf `width` Buckets (ein Bucket pro Pixel-Spalte).
 * Robust gegen leere Daten und width <= 0.
 */
export function computePeaks(channel: Float32Array, width: number): Peak[] {
  const w = Math.max(0, Math.floor(width))
  if (w === 0 || channel.length === 0) return []

  const peaks: Peak[] = new Array(w)
  const samplesPerBucket = channel.length / w

  for (let x = 0; x < w; x++) {
    const start = Math.floor(x * samplesPerBucket)
    const end = Math.min(channel.length, Math.floor((x + 1) * samplesPerBucket))
    let min = 1
    let max = -1
    // Mindestens ein Sample betrachten, auch wenn Bucket sonst leer wäre.
    const safeEnd = Math.max(end, start + 1)
    for (let i = start; i < safeEnd && i < channel.length; i++) {
      const v = channel[i]
      if (v < min) min = v
      if (v > max) max = v
    }
    if (min > max) {
      min = 0
      max = 0
    }
    peaks[x] = { min, max }
  }
  return peaks
}
