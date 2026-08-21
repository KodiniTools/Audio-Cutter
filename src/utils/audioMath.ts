// src/utils/audioMath.ts
// Reine, seiteneffektfreie Funktionen – vollständig unit-testbar (ohne Web Audio).

import type { CutRegion, RangeValidation } from '../types/audio'

/** Millisekunden -> Sample-Index (sample-genau gerundet). */
export function msToSamples(ms: number, sampleRate: number): number {
  return Math.round((ms / 1000) * sampleRate)
}

/** Sample-Index -> Millisekunden. */
export function samplesToMs(samples: number, sampleRate: number): number {
  return (samples / sampleRate) * 1000
}

/** Wert in [min, max] begrenzen. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}

/**
 * Prüft einen Schnittbereich gegen die Gesamtdauer.
 * Gibt bei Ungültigkeit einen stabilen Code zurück (UI übersetzt via i18n) –
 * so bleiben diese reinen Utils sprach- und framework-unabhängig.
 */
export function validateRegion(region: CutRegion, durationMs: number): RangeValidation {
  const { startMs, endMs } = region
  if (durationMs <= 0) return { valid: false, errorCode: 'noAudio' }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { valid: false, errorCode: 'nonFinite' }
  }
  if (startMs < 0) return { valid: false, errorCode: 'negativeStart' }
  if (endMs > durationMs) return { valid: false, errorCode: 'endBeyond' }
  if (endMs <= startMs) return { valid: false, errorCode: 'endBeforeStart' }
  return { valid: true }
}

/**
 * Formatiert Millisekunden als [hh:]mm:ss.mmm.
 * Beispiel: 65432 -> "01:05.432", 3_600_000 -> "1:00:00.000"
 */
export function formatMs(ms: number): string {
  const safe = Math.max(0, Math.round(ms))
  const millis = safe % 1000
  const totalSec = Math.floor(safe / 1000)
  const sec = totalSec % 60
  const totalMin = Math.floor(totalSec / 60)
  const min = totalMin % 60
  const hours = Math.floor(totalMin / 60)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const base = `${pad(min)}:${pad(sec)}.${pad(millis, 3)}`
  return hours > 0 ? `${hours}:${base}` : base
}

/**
 * Parst "[hh:]mm:ss.mmm", "ss.mmm" oder reine Zahl (=ms) nach Millisekunden.
 * Gibt null bei ungültiger Eingabe zurück.
 */
export function parseTimeToMs(input: string): number | null {
  const raw = input.trim()
  if (raw === '') return null

  // Reine Zahl -> als Millisekunden interpretieren.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw)
    return Number.isFinite(n) ? Math.round(n) : null
  }

  // Zeitformat mit ':' -> Teile von rechts (sec) nach links (h) einlesen.
  const parts = raw.split(':')
  if (parts.length < 2 || parts.length > 3) return null

  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null

  let hours = 0
  let minutes = 0
  let seconds = 0
  if (parts.length === 3) {
    ;[hours, minutes, seconds] = nums
  } else {
    ;[minutes, seconds] = nums
  }
  if (seconds >= 60 || minutes >= 60) return null

  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000)
}
