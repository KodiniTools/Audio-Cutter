<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'
import { useAudioEngine, type RegionPlayer } from '../composables/useAudioEngine'
import { cutOnServer } from '../services/api'
import { formatMs } from '../utils/audioMath'
import { i18n, setLocale } from '../i18n'
import type { AppLocale } from '../i18n/messages'
import FileDropzone from '../components/FileDropzone.vue'
import WaveformEditor from '../components/WaveformEditor.vue'
import TimeControls from '../components/TimeControls.vue'
import ExportPanel from '../components/ExportPanel.vue'

const { t, te } = useI18n({ useScope: 'global' })
const store = useAudioCutterStore()
const { meta, decoded, region, hasAudio, mode, exportOptions } = storeToRefs(store)
const engine = useAudioEngine()

const waveformRef = ref<InstanceType<typeof WaveformEditor> | null>(null)
let abortController: AbortController | null = null

// --- Wiedergabe (Vorschau) ---
type PlayState = 'stopped' | 'playing' | 'paused'
const playState = ref<PlayState>('stopped')
/**
 * Aktuelle Cursor-/Abspielposition (ms); null = kein Cursor gesetzt.
 * Einzige Quelle fuer Marker, Wiedergabe-Start UND "Als Anfang/Ende".
 * Wird per Klick (onSeek) und beim Pausieren aktualisiert.
 */
const cursorMs = ref<number | null>(null)
let player: RegionPlayer | null = null

/** Auswahl-Uebernahme moeglich, sobald ein Cursor steht und nicht gespielt wird. */
const canApplyCursor = computed(() => cursorMs.value !== null && playState.value !== 'playing')

function setPlayheadMs(ms: number | null): void {
  const d = store.durationMs
  waveformRef.value?.setPlayhead(ms !== null && d > 0 ? ms / d : null)
}

/** Klick in die Waveform: Cursor-/Abspielpunkt setzen (auch waehrend Pause). */
function onSeek(ms: number): void {
  cursorMs.value = ms
  if (playState.value !== 'playing') setPlayheadMs(ms)
}

const activeLocale = computed<AppLocale>(() => i18n.global.locale.value)
const locales: AppLocale[] = ['de', 'en']

/** Übersetzt bekannte Fehler-Codes; Server-/Fremdtexte werden unverändert gezeigt. */
function toMessage(e: unknown, fallbackKey: string): string {
  if (e instanceof DOMException && e.name === 'AbortError') return t('errors.aborted')
  if (e instanceof Error) {
    const key = `errors.${e.message}`
    // te() prüft, ob ein Übersetzungs-Key existiert.
    return te(key) ? t(key) : e.message
  }
  return t(fallbackKey)
}

async function onFile(file: File): Promise<void> {
  store.reset()
  cursorMs.value = null
  store.setStatus('decoding')
  try {
    const { meta: m, decoded: d } = await engine.decode(file)
    store.setDecoded(m, d, file)
  } catch (e) {
    store.setError(toMessage(e, 'errors.loadUnknown'))
  }
}

async function onProcess(): Promise<void> {
  if (!store.canProcess) return
  store.setError(null)
  store.setResult(null)
  store.setStatus('processing')
  store.setProgress(0)

  abortController = new AbortController()
  try {
    if (mode.value === 'server') {
      const file = store.sourceFile
      if (!file) throw new Error('noSourceFile')
      const res = await cutOnServer(
        { file, startMs: region.value.startMs, endMs: region.value.endMs, options: exportOptions.value },
        {
          signal: abortController.signal,
          onProgress: (f) => store.setProgress(f * 0.9),
          timeoutMs: 180_000,
        },
      )
      store.setResult(res)
    } else {
      if (!decoded.value || !meta.value) throw new Error('noDecodedData')
      // Kurzer Yield, damit die UI den Busy-State rendern kann.
      await new Promise((r) => setTimeout(r, 0))
      const res = await engine.cut(decoded.value, region.value, exportOptions.value, meta.value.name, {
        signal: abortController.signal,
        onProgress: (f) => store.setProgress(f),
      })
      store.setResult(res)
    }
  } catch (e) {
    store.setError(toMessage(e, 'errors.processFailed'))
    store.setStatus('error')
  } finally {
    abortController = null
  }
}

function onCancel(): void {
  abortController?.abort()
}

function onDownload(): void {
  const r = store.result
  if (!r) return
  const url = URL.createObjectURL(r.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = r.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function onPlay(): void {
  if (!decoded.value) return
  // Aus Pause fortsetzen.
  if (playState.value === 'paused' && player) {
    player.resume()
    playState.value = 'playing'
    return
  }
  // Frisch starten – ab dem Cursor (sonst Auswahlanfang), bis Dateiende
  // (freies Vorhoeren, unabhaengig von der Auswahl).
  player?.stop()
  const dur = store.durationMs
  const cursor = cursorMs.value
  const startMs = cursor !== null ? Math.max(0, Math.min(cursor, dur)) : region.value.startMs
  player = engine.createRegionPlayer(
    decoded.value,
    { startMs, endMs: dur },
    {
      onTime: (ms) => setPlayheadMs(ms),
      onEnded: () => {
        playState.value = 'stopped'
        player = null
        setPlayheadMs(cursorMs.value)
      },
    },
  )
  playState.value = 'playing'
}

function onPause(): void {
  if (!player || playState.value !== 'playing') return
  cursorMs.value = player.pause()
  playState.value = 'paused'
  setPlayheadMs(cursorMs.value)
}

function onStopPlayback(): void {
  player?.stop()
  player = null
  playState.value = 'stopped'
  // Cursor sichtbar lassen (dort startet die naechste Wiedergabe).
  setPlayheadMs(cursorMs.value)
}

/** Aktuelle Cursor-Position als Anfang bzw. Ende der Auswahl übernehmen. */
function applyCursorAsStart(): void {
  if (cursorMs.value === null) return
  store.setStart(cursorMs.value)
  // Marker exakt auf den neuen Auswahlanfang setzen (deckungsgleich).
  cursorMs.value = region.value.startMs
  setPlayheadMs(cursorMs.value)
}
function applyCursorAsEnd(): void {
  if (cursorMs.value === null) return
  store.setEnd(cursorMs.value)
  cursorMs.value = region.value.endMs
  setPlayheadMs(cursorMs.value)
}

onBeforeUnmount(() => {
  player?.stop()
  abortController?.abort()
})
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-8 text-neutral-100">
    <header class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="font-mono text-2xl font-semibold tracking-tight">
          {{ t('app.title') }} <span class="text-emerald-400">{{ t('app.badge') }}</span>
        </h1>
        <p class="mt-1 text-sm text-neutral-400">{{ t('app.subtitle') }}</p>
      </div>

      <!-- Sprachumschalter -->
      <div class="flex shrink-0 overflow-hidden rounded-md border border-neutral-700" role="group" :aria-label="t('lang.label')">
        <button
          v-for="l in locales"
          :key="l"
          class="px-2.5 py-1 text-xs font-medium transition-colors"
          :class="activeLocale === l ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-300 hover:bg-neutral-800'"
          :aria-pressed="activeLocale === l"
          @click="setLocale(l)"
        >
          {{ t(`lang.${l}`) }}
        </button>
      </div>
    </header>

    <FileDropzone v-if="!hasAudio" @file="onFile" />

    <div v-else class="flex flex-col gap-5">
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-900/40 px-4 py-2 text-sm">
        <span class="truncate font-medium text-neutral-200">{{ meta?.name }}</span>
        <span class="font-mono text-xs text-neutral-500">
          {{ meta?.sampleRate }} Hz · {{ meta?.numberOfChannels }} {{ t('meta.channels') }} · {{ formatMs(meta?.durationMs ?? 0) }}
        </span>
        <button class="text-xs text-neutral-400 underline hover:text-emerald-400" @click="store.reset()">
          {{ t('meta.changeFile') }}
        </button>
      </div>

      <WaveformEditor ref="waveformRef" @seek="onSeek" />

      <div class="flex flex-col items-center gap-3">
        <div class="flex items-center gap-3">
          <!-- Abspielen / Fortsetzen (wenn nicht gerade spielend) -->
          <button
            v-if="playState !== 'playing'"
            class="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-700 text-neutral-200 transition-colors hover:border-emerald-500 hover:text-emerald-300"
            :title="playState === 'paused' ? t('player.resume') : t('player.play')"
            :aria-label="playState === 'paused' ? t('player.resume') : t('player.play')"
            @click="onPlay"
          >
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <!-- Pause (nur während der Wiedergabe) -->
          <button
            v-else
            class="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-700 text-neutral-200 transition-colors hover:border-emerald-500 hover:text-emerald-300"
            :title="t('player.pause')"
            :aria-label="t('player.pause')"
            @click="onPause"
          >
            <svg viewBox="0 0 24 24" class="h-6 w-6" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </button>
          <!-- Stopp -->
          <button
            class="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-700 text-neutral-200 transition-colors hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:text-neutral-200"
            :title="t('player.stop')"
            :aria-label="t('player.stop')"
            :disabled="playState === 'stopped'"
            @click="onStopPlayback"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          </button>
        </div>

        <!-- Cursor gesetzt: aktuelle Position als Anfang/Ende übernehmen -->
        <div
          v-if="canApplyCursor"
          class="flex flex-wrap items-center justify-center gap-2 text-sm"
        >
          <span class="text-neutral-400">
            {{ t('player.cursorAt') }}
            <span class="font-mono text-emerald-300">{{ formatMs(cursorMs ?? 0) }}</span>
          </span>
          <button
            class="rounded-md border border-neutral-700 px-3 py-1 font-medium text-neutral-200 transition-colors hover:border-emerald-500 hover:text-emerald-300"
            @click="applyCursorAsStart"
          >
            {{ t('player.setStart') }}
          </button>
          <button
            class="rounded-md border border-neutral-700 px-3 py-1 font-medium text-neutral-200 transition-colors hover:border-emerald-500 hover:text-emerald-300"
            @click="applyCursorAsEnd"
          >
            {{ t('player.setEnd') }}
          </button>
        </div>
      </div>

      <TimeControls @seek="onSeek" />

      <ExportPanel @process="onProcess" @cancel="onCancel" @download="onDownload" />
    </div>

    <footer class="mt-10 text-center text-xs text-neutral-600">
      {{ t('app.footer') }}
    </footer>
  </div>
</template>
