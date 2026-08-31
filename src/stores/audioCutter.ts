// src/stores/audioCutter.ts
// Single source of truth für den Editor-Zustand.
// Große Rohdaten (Float32Arrays) liegen in shallowRef -> nicht tief reaktiv.
//
// Kumulatives Schneiden: `decoded` ist der AKTUELL bearbeitete Puffer. Jeder
// Schnitt (applyCut) wendet die gewählte Aktion (behalten/entfernen + Fades) auf
// diesen Puffer an und ersetzt ihn -> beliebig oft wiederholbar. Der Ursprungs-
// puffer bleibt in `original` erhalten (nur um zu erkennen, ob überhaupt schon
// geschnitten wurde). Der Export encodiert am Ende den finalen Puffer.

import { defineStore } from 'pinia'
import { computed, markRaw, ref, shallowRef } from 'vue'
import type {
  AudioMeta,
  CutRegion,
  CutResult,
  DecodedAudio,
  ExportOptions,
  ProcessingMode,
  Status,
} from '../types/audio'
import { clamp, msToSamples, samplesToMs, validateRegion } from '../utils/audioMath'
import { cutChannels } from '../utils/sliceBuffer'
import { FORMAT_META } from '../utils/formats'

/**
 * Ein Undo/Redo-Schnappschuss des editierbaren Zustands – inklusive des
 * bearbeiteten Puffers, damit ein Schnitt vollständig zurückgenommen werden
 * kann. Puffer werden nie in-place verändert (jeder Schnitt erzeugt frische
 * Arrays), daher genügt es, die Referenzen zu sichern.
 */
interface HistorySnapshot {
  decoded: DecodedAudio | null
  durationMs: number
  region: CutRegion
  exportOptions: ExportOptions
  mode: ProcessingMode
}

export const useAudioCutterStore = defineStore('audioCutter', () => {
  // --- State ---
  const meta = ref<AudioMeta | null>(null)
  /** Der aktuell bearbeitete Puffer (wird bei jedem Schnitt ersetzt). */
  const decoded = shallowRef<DecodedAudio | null>(null)
  /** Der Ursprungspuffer der geladenen Datei – Referenz für "wurde geschnitten?". */
  const original = shallowRef<DecodedAudio | null>(null)
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
  // Erfasst den editierbaren Zustand (Puffer, Auswahl, Export-Optionen, Modus).
  // Schnell aufeinanderfolgende Änderungen gleicher Art (Ziehen, Slider,
  // Tippen) werden per Zeitfenster zu EINEM Schritt zusammengefasst; ein Schnitt
  // (applyCut) ist dagegen immer ein eigener, diskreter Schritt.
  const MAX_HISTORY = 100
  const COALESCE_MS = 600
  const past = ref<HistorySnapshot[]>([])
  const future = ref<HistorySnapshot[]>([])
  let lastLabel = ''
  let lastTime = 0

  function snapshot(): HistorySnapshot {
    // region/exportOptions/decoded werden von den Actions stets immutabel
    // ersetzt, daher genügt es, die aktuellen Referenzen zu sichern.
    // markRaw: past/future sind (tief) reaktiv – ohne markRaw würde Vue den
    // großen Puffer beim Ablegen in einen Proxy verpacken. Dann wäre der
    // wiederhergestellte Puffer nicht mehr referenzgleich mit `original`, und
    // `hasEdits` bliebe nach dem Zurücknehmen aller Schnitte fälschlich wahr.
    return markRaw({
      decoded: decoded.value,
      durationMs: meta.value?.durationMs ?? 0,
      region: region.value,
      exportOptions: exportOptions.value,
      mode: mode.value,
    })
  }
  function applySnapshot(s: HistorySnapshot): void {
    decoded.value = s.decoded
    if (meta.value) meta.value = { ...meta.value, durationMs: s.durationMs }
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
  /** Diskreten Historien-Schritt erzwingen (nie zusammengefasst) – für Schnitte. */
  function pushHistory(): void {
    past.value.push(snapshot())
    if (past.value.length > MAX_HISTORY) past.value.shift()
    future.value = []
    // Reset, damit eine unmittelbar folgende Änderung nicht mit dem Schnitt
    // zusammengefasst wird.
    lastLabel = ''
    lastTime = 0
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
  /** Ein evtl. vorhandenes Export-Ergebnis verwerfen (nach Puffer-Änderungen). */
  function clearStaleResult(): void {
    if (result.value) result.value = null
    if (status.value === 'done' || status.value === 'error') status.value = 'idle'
  }

  // --- Getters ---
  const durationMs = computed(() => meta.value?.durationMs ?? 0)
  const hasAudio = computed(() => meta.value !== null)
  const selectedDurationMs = computed(() => Math.max(0, region.value.endMs - region.value.startMs))
  const regionValidation = computed(() => validateRegion(region.value, durationMs.value))
  const busy = computed(() => status.value === 'processing' || status.value === 'decoding')
  /** Mindestens ein Schnitt wurde angewendet (Puffer weicht vom Original ab). */
  const hasEdits = computed(
    () => decoded.value !== null && original.value !== null && decoded.value !== original.value,
  )
  /** Ein Schnitt ist möglich: gültige, nicht-leere Auswahl, die nicht alles entfernt. */
  const canCut = computed(
    () =>
      hasAudio.value &&
      regionValidation.value.valid &&
      !busy.value &&
      selectedDurationMs.value > 0 &&
      // "Entfernen" der gesamten Datei würde einen leeren Puffer erzeugen.
      !(exportOptions.value.cutMode === 'remove' && selectedDurationMs.value >= durationMs.value),
  )
  /** Export/Download ist erst möglich, sobald mindestens ein Schnitt existiert. */
  const canExport = computed(() => hasAudio.value && hasEdits.value && !busy.value)
  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  // --- Actions ---
  function reset(): void {
    meta.value = null
    decoded.value = null
    original.value = null
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
    original.value = newDecoded
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

  /**
   * Wendet den aktuellen Schnitt (Aktion behalten/entfernen + Fades) auf den
   * bearbeiteten Puffer an und ersetzt ihn. Jeder Aufruf ist ein eigener
   * Undo-Schritt. Nach dem Schnitt umfasst die Auswahl wieder den ganzen
   * (neuen) Puffer. Gibt true zurück, wenn ein Schnitt erfolgt ist.
   */
  function applyCut(): boolean {
    if (!decoded.value || !meta.value) return false
    const { sampleRate, channels } = decoded.value
    const startSample = msToSamples(region.value.startMs, sampleRate)
    const endSample = msToSamples(region.value.endMs, sampleRate)
    const next = cutChannels(
      channels,
      sampleRate,
      startSample,
      endSample,
      exportOptions.value.cutMode,
      exportOptions.value.fadeInMs,
      exportOptions.value.fadeOutMs,
    )
    if (next.length === 0 || next[0].length === 0) {
      error.value = 'emptyRegion'
      return false
    }

    // Aktuellen Zustand als diskreten Historien-Schritt sichern, dann anwenden.
    pushHistory()
    const newDurationMs = samplesToMs(next[0].length, sampleRate)
    decoded.value = { sampleRate, channels: next }
    meta.value = { ...meta.value, durationMs: newDurationMs }
    // Auswahl auf den gesamten neuen Puffer setzen (Ausgangspunkt für den
    // nächsten Schnitt).
    region.value = { startMs: 0, endMs: newDurationMs }
    error.value = null
    clearStaleResult()
    return true
  }

  /** Letzte Änderung rückgängig machen. */
  function undo(): void {
    if (past.value.length === 0) return
    future.value.push(snapshot())
    applySnapshot(past.value.pop() as HistorySnapshot)
    lastLabel = ''
    clearStaleResult()
  }

  /** Rückgängig gemachte Änderung wiederherstellen. */
  function redo(): void {
    if (future.value.length === 0) return
    past.value.push(snapshot())
    applySnapshot(future.value.pop() as HistorySnapshot)
    lastLabel = ''
    clearStaleResult()
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
    original,
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
    busy,
    hasEdits,
    canCut,
    canExport,
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
    applyCut,
    setStatus,
    setProgress,
    setError,
    setResult,
    undo,
    redo,
  }
})
