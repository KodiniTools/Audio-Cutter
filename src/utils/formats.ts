// src/utils/formats.ts
// Zentrale Metadaten aller Export-Formate: Dateiendung, MIME-Typ, ob
// verlustbehaftet (Bitrate relevant) und wie es im Browser-Modus (lokal)
// verfügbar ist. Einzige Quelle für Client (Dropdown, Download-Name/MIME) und
// als Referenz für die Server-Codec-Zuordnung.

import type { ExportFormat, ProcessingMode } from '../types/audio'

/**
 * Verfügbarkeit im Browser-Modus:
 * - 'builtin'   immer (eigener Encoder: WAV, MP3/lamejs, FLAC)
 * - 'webcodecs' nur wenn der Browser den Codec per WebCodecs kodieren kann
 * - 'none'      nur im Server-Modus
 */
export type BrowserSupport = 'builtin' | 'webcodecs' | 'none'

export interface FormatMeta {
  /** Dateiendung ohne Punkt (z. B. 'm4a' für AAC). */
  ext: string
  /** MIME-Typ für Blob/Download. */
  mime: string
  /** Verlustbehaftet -> Bitrate-Regler sinnvoll. */
  lossy: boolean
  /** Verfügbarkeit im Browser-Modus (lokal, ohne Server). */
  browser: BrowserSupport
  /** Anzeigename im Format-Dropdown. */
  label: string
}

export const FORMAT_META: Record<ExportFormat, FormatMeta> = {
  wav: { ext: 'wav', mime: 'audio/wav', lossy: false, browser: 'builtin', label: 'WAV' },
  mp3: { ext: 'mp3', mime: 'audio/mpeg', lossy: true, browser: 'builtin', label: 'MP3' },
  ogg: { ext: 'ogg', mime: 'audio/ogg', lossy: true, browser: 'none', label: 'OGG' },
  aac: { ext: 'm4a', mime: 'audio/mp4', lossy: true, browser: 'webcodecs', label: 'AAC (M4A)' },
  webm: {
    ext: 'webm',
    mime: 'audio/webm',
    lossy: true,
    browser: 'webcodecs',
    label: 'WebM (Opus)',
  },
  flac: { ext: 'flac', mime: 'audio/flac', lossy: false, browser: 'builtin', label: 'FLAC' },
}

/** Alle Formate in Anzeige-Reihenfolge. */
export const ALL_FORMATS: ExportFormat[] = ['wav', 'mp3', 'ogg', 'aac', 'webm', 'flac']

/**
 * Ist das Format im Browser-Modus kodierbar?
 * @param webCodecsFormats Per Feature-Erkennung ermittelte WebCodecs-Formate.
 */
export function isBrowserFormat(
  format: ExportFormat,
  webCodecsFormats: readonly ExportFormat[] = [],
): boolean {
  const support = FORMAT_META[format].browser
  return support === 'builtin' || (support === 'webcodecs' && webCodecsFormats.includes(format))
}

/**
 * Im jeweiligen Modus verfügbare Formate (Server = alle, Browser = eingebaute
 * Encoder plus die per WebCodecs erkannten).
 */
export function formatsForMode(
  mode: ProcessingMode,
  webCodecsFormats: readonly ExportFormat[] = [],
): ExportFormat[] {
  return ALL_FORMATS.filter((f) => mode === 'server' || isBrowserFormat(f, webCodecsFormats))
}
