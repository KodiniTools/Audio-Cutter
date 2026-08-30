// src/stores/audioCutter.ts
// Single source of truth für den Editor-Zustand.
// Große Rohdaten (Float32Arrays) liegen in shallowRef -> nicht tief reaktiv.

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type {
  AudioMeta,
  CutRegion,
  CutResult,
  DecodedAudio,
  ExportOptions,
  ProcessingMode,
  Status,
} from '../types/audio'
import { clamp, validateRegion } from '../utils/audioMath'
import { FORMAT_META } from '../utils/formats'

/** Ein Undo/Redo-Schnappschuss des editierbaren Zustands. */
interface HistorySnapshot {
  region: CutRegion
  exportOptions: ExportOptions
  mode: ProcessingMode
}

export const useAudioCutterStore = defineStore('audioCutter', () => {
  // --- State ---
  const meta = ref<AudioMeta | null>(null)
  const decoded = shallowRef<DecodedAudio | null>(null)
  const region = ref<CutRegion>({ startMs: 0, endMs: 0 })
  const mode = ref<ProcessingMode>('browser')
  const exportOptions = ref<ExportOptions>({
    format: 'wav',
    mp3Bitrate: 192,
    fadeInMs: 0,
    fadeOutMs: 0,
    cutMode: 'keep',
  })
  const status = ref<Status>('idle')
  const progress = ref(0) // 0..1
  const error = ref<string | null>(null)
  const result = ref<CutResult | null>(null)
  /** Original-Datei für Server-Modus (Upload). */
  const sourceFile = shallowRef<File | null>(null)

  // --- Undo/Redo-Historie ---
  // Erfasst den editierbaren Zustand (Auswahl, Export-Optionen, Modus).
  // Schnell aufeinanderfolgende Änderungen gleicher Art (Ziehen, Slider,
  // Tippen) werden per Zeitfenster zu EINEM Schritt zusammengefasst.
  const MAX_HISTORY = 100
  const COALESCE_MS = 600
  const past = ref<HistorySnapshot[]>([])
  const future = ref<HistorySnapshot[]>([])
  let lastLabel = ''
  let lastTime = 0

  function snapshot(): HistorySnapshot {
    // region/exportOptions werden von den Actions stets immutabel ersetzt,
    // daher genügt es, die aktuellen Referenzen zu sichern (kein Deep-Copy).
    return { region: region.value, exportOptions: exportOptions.value, mode: mode.value }
  }
  function applySnapshot(s: HistorySnapshot): void {
    region.value = s.region
    exportOptions.value = s.exportOptions
    mode.value = s.mode
  }
  /** Ist-Zustand vor einer Änderung sichern (mit Zusammenfassung gleicher Art). */
  function record(label: string): void {
    const now = Date.now()
    if (label === lastLabel && now - lastTime < COALESCE_MS) {
      lastTime = now
      return
    }
    past.value.push(snapshot())
    if (past.value.length > MAX_HISTORY) past.value.shift()
    future.value = []
    lastLabel = label
    lastTime = now
  }
  function clearHistory(): void {
    past.value = []
    future.value = []
    lastLabel = ''
    lastTime = 0
  }
  function historyLabelFor(patch: Partial<ExportOptions>): string {
    if ('format' in patch) return 'format'
    if ('cutMode' in patch) return 'cutMode'
    if ('mp3Bitrate' in patch) return 'bitrate'
    return 'fade'
  }

  // --- Getters ---
  const durationMs = computed(() => meta.value?.durationMs ?? 0)
  const hasAudio = computed(() => meta.value !== null)
  const selectedDurationMs = computed(() => Math.max(0, region.value.endMs - region.value.startMs))
  const regionValidation = computed(() => validateRegion(region.value, durationMs.value))
  const canProcess = computed(
    () =>
      hasAudio.value &&
      regionValidation.value.valid &&
      status.value !== 'processing' &&
      status.value !== 'decoding',
  )
  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  // --- Actions ---
  function reset(): void {
    meta.value = null
    decoded.value = null
    sourceFile.value = null
    region.value = { startMs: 0, endMs: 0 }
    status.value = 'idle'
    progress.value = 0
    error.value = null
    result.value = null
    clearHistory()
  }

  /** Nach erfolgreichem Dekodieren aufrufen. Setzt Region auf volle Länge. */
  function setDecoded(newMeta: AudioMeta, newDecoded: DecodedAudio, file: File | null): void {
    meta.value = newMeta
    decoded.value = newDecoded
    sourceFile.value = file
    region.value = { startMs: 0, endMs: newMeta.durationMs }
    status.value = 'idle'
    progress.value = 0
    error.value = null
    result.value = null
    // Neue Datei = frischer Ausgangszustand -> Historie verwerfen.
    clearHistory()
  }

  function setStart(ms: number): void {
    const start = clamp(ms, 0, region.value.endMs)
    if (start === region.value.startMs) return
    record('region')
    region.value = { ...region.value, startMs: start }
  }

  function setEnd(ms: number): void {
    const end = clamp(ms, region.value.startMs, durationMs.value)
    if (end === region.value.endMs) return
    record('region')
    region.value = { ...region.value, endMs: end }
  }

  /** Beide Grenzen setzen (z. B. beim Ziehen in der Waveform). Auto-sortiert. */
  function setRegion(startMs: number, endMs: number): void {
    let a = clamp(startMs, 0, durationMs.value)
    let b = clamp(endMs, 0, durationMs.value)
    if (a > b) [a, b] = [b, a]
    if (a === region.value.startMs && b === region.value.endMs) return
    record('region')
    region.value = { startMs: a, endMs: b }
  }

  function setMode(m: ProcessingMode): void {
    // Server-only-Format (z. B. OGG/AAC/WebM/FLAC) im Browser-Modus nicht
    // zulassen -> auf WAV zurückfallen.
    const needsFormatReset = m === 'browser' && !FORMAT_META[exportOptions.value.format].browser
    if (m === mode.value && !needsFormatReset) return
    record('mode')
    mode.value = m
    if (needsFormatReset) {
      exportOptions.value = { ...exportOptions.value, format: 'wav' }
    }
  }

  function patchExportOptions(patch: Partial<ExportOptions>): void {
    const next = { ...exportOptions.value, ...patch }
    const cur = exportOptions.value
    // Keine echte Änderung -> keinen Historien-Schritt erzeugen.
    if (
      next.format === cur.format &&
      next.mp3Bitrate === cur.mp3Bitrate &&
      next.fadeInMs === cur.fadeInMs &&
      next.fadeOutMs === cur.fadeOutMs &&
      next.cutMode === cur.cutMode
    ) {
      return
    }
    record(historyLabelFor(patch))
    exportOptions.value = next
  }

  /** Letzte Änderung rückgängig machen. */
  function undo(): void {
    if (past.value.length === 0) return
    future.value.push(snapshot())
    applySnapshot(past.value.pop() as HistorySnapshot)
    lastLabel = ''
  }

  /** Rückgängig gemachte Änderung wiederherstellen. */
  function redo(): void {
    if (future.value.length === 0) return
    past.value.push(snapshot())
    applySnapshot(future.value.pop() as HistorySnapshot)
    lastLabel = ''
  }

  function setStatus(s: Status): void {
    status.value = s
  }

  function setProgress(p: number): void {
    progress.value = clamp(p, 0, 1)
  }

  function setError(message: string | null): void {
    error.value = message
    if (message) status.value = 'error'
  }

  function setResult(r: CutResult | null): void {
    result.value = r
    if (r) {
      status.value = 'done'
      progress.value = 1
    }
  }

  return {
    // state
    meta,
    decoded,
    region,
    mode,
    exportOptions,
    status,
    progress,
    error,
    result,
    sourceFile,
    // getters
    durationMs,
    hasAudio,
    selectedDurationMs,
    regionValidation,
    canProcess,
    canUndo,
    canRedo,
    // actions
    reset,
    setDecoded,
    setStart,
    setEnd,
    setRegion,
    setMode,
    patchExportOptions,
    setStatus,
    setProgress,
    setError,
    setResult,
    undo,
    redo,
  }
})
