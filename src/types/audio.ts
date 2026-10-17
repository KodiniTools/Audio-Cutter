// src/types/audio.ts
// Zentrale Typdefinitionen für den Audio-Schneider.

export type ProcessingMode = 'browser' | 'server'
// Browser-Modus (lokal) kann nur WAV + MP3 kodieren; die übrigen Formate
// liefert ausschliesslich der Server-Modus (FFmpeg). Siehe utils/formats.ts.
export type ExportFormat = 'wav' | 'mp3' | 'ogg' | 'aac' | 'webm' | 'flac'
export type Status = 'idle' | 'decoding' | 'processing' | 'done' | 'error'
/** WAV-Bittiefe: 16/24 bit PCM oder 32 bit Float (nur Browser-Modus). */
export type WavBitDepth = 'pcm16' | 'pcm24' | 'float32'
/** 'keep' = Auswahl behalten (Standard), 'remove' = Auswahl aus dem Track entfernen. */
export type CutMode = 'keep' | 'remove'

/** Metadaten einer geladenen Audiodatei. */
export interface AudioMeta {
  name: string
  size: number
  mimeType: string
  durationMs: number
  sampleRate: number
  numberOfChannels: number
}

/** Roh-Audiodaten (nicht reaktiv halten – große Float32Arrays). */
export interface DecodedAudio {
  sampleRate: number
  /** Ein Float32Array pro Kanal, Werte im Bereich [-1, 1]. */
  channels: Float32Array[]
}

/** Ausgewählter Schnittbereich in Millisekunden. */
export interface CutRegion {
  startMs: number
  endMs: number
}

/** Export-Einstellungen. */
export interface ExportOptions {
  format: ExportFormat
  /** Ziel-Bitrate (kbps) für verlustbehaftete Formate (MP3, OGG, AAC, WebM). */
  mp3Bitrate: number
  /** Bittiefe für WAV-Export im Browser-Modus. */
  wavBitDepth: WavBitDepth
  fadeInMs: number
  fadeOutMs: number
  /** Auswahl behalten oder aus dem Track entfernen. */
  cutMode: CutMode
}

/** Ergebnis eines Schnitts. */
export interface CutResult {
  blob: Blob
  filename: string
  format: ExportFormat
  durationMs: number
}

/** Stabile Fehler-Codes der Bereichsvalidierung (UI übersetzt via i18n). */
export type RegionErrorCode =
  | 'noAudio'
  | 'nonFinite'
  | 'negativeStart'
  | 'endBeyond'
  | 'endBeforeStart'

export interface RangeValidation {
  valid: boolean
  /** Nur gesetzt, wenn valid === false. Übersetzung erfolgt im UI. */
  errorCode?: RegionErrorCode
}
