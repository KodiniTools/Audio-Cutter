// src/utils/formats.ts
// Zentrale Metadaten aller Export-Formate: Dateiendung, MIME-Typ, ob
// verlustbehaftet (Bitrate relevant) und ob im Browser-Modus (lokal)
// verfügbar. Einzige Quelle für Client (Dropdown, Download-Name/MIME) und
// als Referenz für die Server-Codec-Zuordnung.

import type { ExportFormat, ProcessingMode } from '../types/audio'

export interface FormatMeta {
  /** Dateiendung ohne Punkt (z. B. 'm4a' für AAC). */
  ext: string
  /** MIME-Typ für Blob/Download. */
  mime: string
  /** Verlustbehaftet -> Bitrate-Regler sinnvoll. */
  lossy: boolean
  /** Im Browser-Modus (lokal, ohne Server) kodierbar. */
  browser: boolean
  /** Anzeigename im Format-Dropdown. */
  label: string
}

export const FORMAT_META: Record<ExportFormat, FormatMeta> = {
  wav: { ext: 'wav', mime: 'audio/wav', lossy: false, browser: true, label: 'WAV' },
  mp3: { ext: 'mp3', mime: 'audio/mpeg', lossy: true, browser: true, label: 'MP3' },
  ogg: { ext: 'ogg', mime: 'audio/ogg', lossy: true, browser: false, label: 'OGG' },
  aac: { ext: 'm4a', mime: 'audio/mp4', lossy: true, browser: false, label: 'AAC (M4A)' },
  webm: { ext: 'webm', mime: 'audio/webm', lossy: true, browser: false, label: 'WebM' },
  flac: { ext: 'flac', mime: 'audio/flac', lossy: false, browser: false, label: 'FLAC' },
}

/** Alle Formate in Anzeige-Reihenfolge. */
export const ALL_FORMATS: ExportFormat[] = ['wav', 'mp3', 'ogg', 'aac', 'webm', 'flac']

/** Im jeweiligen Modus verfügbare Formate (Server = alle, Browser = wav/mp3). */
export function formatsForMode(mode: ProcessingMode): ExportFormat[] {
  return ALL_FORMATS.filter((f) => mode === 'server' || FORMAT_META[f].browser)
}
