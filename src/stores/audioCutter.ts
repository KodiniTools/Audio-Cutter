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
  }

  function setStart(ms: number): void {
    const start = clamp(ms, 0, region.value.endMs)
    region.value = { ...region.value, startMs: start }
  }

  function setEnd(ms: number): void {
    const end = clamp(ms, region.value.startMs, durationMs.value)
    region.value = { ...region.value, endMs: end }
  }

  /** Beide Grenzen setzen (z. B. beim Ziehen in der Waveform). Auto-sortiert. */
  function setRegion(startMs: number, endMs: number): void {
    let a = clamp(startMs, 0, durationMs.value)
    let b = clamp(endMs, 0, durationMs.value)
    if (a > b) [a, b] = [b, a]
    region.value = { startMs: a, endMs: b }
  }

  function setMode(m: ProcessingMode): void {
    mode.value = m
  }

  function patchExportOptions(patch: Partial<ExportOptions>): void {
    exportOptions.value = { ...exportOptions.value, ...patch }
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
  }
})
