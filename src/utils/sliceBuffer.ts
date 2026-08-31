// src/utils/sliceBuffer.ts
// Reine Funktionen zum sample-genauen Schneiden und für Fades.
// Arbeiten auf Float32Array[] (ein Array pro Kanal) – kein Web-Audio-Objekt nötig.

import type { CutMode } from '../types/audio'

/**
 * Schneidet alle Kanäle auf [startSample, endSample).
 * Indizes werden defensiv auf gültige Grenzen geklemmt.
 */
export function sliceChannels(
  channels: Float32Array[],
  startSample: number,
  endSample: number,
): Float32Array[] {
  if (channels.length === 0) return []
  const total = channels[0].length
  const start = Math.max(0, Math.min(Math.round(startSample), total))
  const end = Math.max(start, Math.min(Math.round(endSample), total))
  // slice() erzeugt eine Kopie -> Original bleibt unverändert (keine Seiteneffekte).
  return channels.map((ch) => ch.slice(start, end))
}

/**
 * Entfernt [startSample, endSample) aus allen Kanälen und verbindet den Teil
 * davor mit dem Teil danach (inverser Modus). Indizes werden geklemmt.
 */
export function removeRegion(
  channels: Float32Array[],
  startSample: number,
  endSample: number,
): Float32Array[] {
  if (channels.length === 0) return []
  const total = channels[0].length
  const start = Math.max(0, Math.min(Math.round(startSample), total))
  const end = Math.max(start, Math.min(Math.round(endSample), total))
  const headLen = start
  const tailLen = total - end
  return channels.map((ch) => {
    const out = new Float32Array(headLen + tailLen)
    if (headLen > 0) out.set(ch.subarray(0, start), 0)
    if (tailLen > 0) out.set(ch.subarray(end, total), headLen)
    return out
  })
}

/**
 * Lineare Fade-In/Fade-Out in-place auf bereits geschnittene Kanäle anwenden.
 * fadeIn/fadeOut werden so begrenzt, dass sie sich nicht überlappen.
 */
export function applyFade(
  channels: Float32Array[],
  sampleRate: number,
  fadeInMs: number,
  fadeOutMs: number,
): void {
  if (channels.length === 0) return
  const length = channels[0].length
  if (length === 0) return

  const maxFade = Math.floor(length / 2)
  const fadeIn = Math.min(Math.round((Math.max(0, fadeInMs) / 1000) * sampleRate), maxFade)
  const fadeOut = Math.min(Math.round((Math.max(0, fadeOutMs) / 1000) * sampleRate), maxFade)

  for (const ch of channels) {
    for (let i = 0; i < fadeIn; i++) {
      ch[i] *= i / fadeIn
    }
    for (let i = 0; i < fadeOut; i++) {
      const idx = length - 1 - i
      ch[idx] *= i / fadeOut
    }
  }
}

/**
 * Ein vollständiger Schnitt auf Kanaldaten: wählt den Bereich (behalten oder
 * entfernen) und legt anschliessend die Fades an. Erzeugt stets FRISCHE Arrays
 * (slice/removeRegion kopieren), sodass die Eingabe unverändert bleibt – die
 * Grundlage des kumulativen Schneidens (jeder Schnitt = neuer Puffer, alte
 * Puffer bleiben für Undo/Redo erhalten).
 */
export function cutChannels(
  channels: Float32Array[],
  sampleRate: number,
  startSample: number,
  endSample: number,
  cutMode: CutMode,
  fadeInMs: number,
  fadeOutMs: number,
): Float32Array[] {
  const cut =
    cutMode === 'remove'
      ? removeRegion(channels, startSample, endSample)
      : sliceChannels(channels, startSample, endSample)
  applyFade(cut, sampleRate, fadeInMs, fadeOutMs)
  return cut
}

/** Float32 [-1,1] -> Int16 PCM (mit Clipping-Schutz). */
export function floatToInt16(channel: Float32Array): Int16Array {
  const out = new Int16Array(channel.length)
  for (let i = 0; i < channel.length; i++) {
    const s = Math.max(-1, Math.min(1, channel[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}
