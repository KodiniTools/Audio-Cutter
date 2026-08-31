<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'
import { useAudioEngine, type RegionPlayer } from '../composables/useAudioEngine'
import { cutOnServer } from '../services/api'
import { formatMs } from '../utils/audioMath'
import { FORMAT_META } from '../utils/formats'
import FileDropzone from '../components/FileDropzone.vue'
import WaveformEditor from '../components/WaveformEditor.vue'
import TimeControls from '../components/TimeControls.vue'
import ExportPanel from '../components/ExportPanel.vue'
import ProgressOverlay from '../components/ProgressOverlay.vue'
import ShortcutsHelp from '../components/ShortcutsHelp.vue'

const { t, te } = useI18n({ useScope: 'global' })
const store = useAudioCutterStore()
const { meta, decoded, region, hasAudio, mode, exportOptions } = storeToRefs(store)
const engine = useAudioEngine()

const waveformRef = ref<InstanceType<typeof WaveformEditor> | null>(null)
let abortController: AbortController | null = null

/** Overlay mit der Tastenkürzel-/Touch-Übersicht (Taste „?"). */
const showHelp = ref(false)

// --- Wiedergabe (Vorschau) ---
type PlayState = 'stopped' | 'playing' | 'paused'
const playState = ref<PlayState>('stopped')
/**
 * Aktuelle Cursor-/Abspielposition (ms); null = kein Cursor gesetzt.
 * Einzige Quelle fuer Marker, Wiedergabe-Start UND "Als Anfang/Ende".
 * Wird per Klick (onSeek) und beim Pausieren aktualisiert.
 */
const cursorMs = ref<number | null>(null)
/** true, solange die Vorschau der Auswahl laeuft (fuer Button-Zustand). */
const previewing = ref(false)
let player: RegionPlayer | null = null
/** Endgrenze der aktuellen Wiedergabe (ms) – fuer Live-Seek beibehalten. */
let playEndMs = 0

/** Auswahl-Uebernahme moeglich, sobald ein Cursor steht und nicht gespielt wird. */
const canApplyCursor = computed(() => cursorMs.value !== null && playState.value !== 'playing')

/**
 * Startet die Wiedergabe von startMs bis endMs (frischer Player).
 * @param preview  true = Vorschau der Auswahl (Button-Zustand).
 */
function startPlayback(startMs: number, endMs: number, preview = false): void {
  if (!decoded.value) return
  player?.stop()
  const dur = store.durationMs
  const s = Math.max(0, Math.min(startMs, dur))
  const e = Math.max(s, Math.min(endMs, dur))
  playEndMs = e
  previewing.value = preview
  cursorMs.value = s
  setPlayheadMs(s)
  player = engine.createRegionPlayer(
    decoded.value,
    { startMs: s, endMs: e },
    {
      onTime: (ms) => setPlayheadMs(ms, { follow: true }),
      onEnded: () => {
        playState.value = 'stopped'
        previewing.value = false
        player = null
        setPlayheadMs(cursorMs.value)
      },
    },
  )
  playState.value = 'playing'
}

function setPlayheadMs(ms: number | null, opts: { follow?: boolean; ensure?: boolean } = {}): void {
  const d = store.durationMs
  waveformRef.value?.setPlayhead(ms !== null && d > 0 ? ms / d : null, opts)
}

/** Cursor manuell verschieben.
 *  - Waehrend der Wiedergabe: sofort ab dem neuen Punkt weiterspielen (Live-Seek).
 *  - Bei Pause: pausierten Player verwerfen -> naechstes Play startet am neuen Cursor.
 *  - Gestoppt: nur Cursor/Marker setzen. */
function moveCursor(ms: number, ensure: boolean): void {
  if (playState.value === 'playing') {
    startPlayback(ms, playEndMs, previewing.value)
    return
  }
  cursorMs.value = ms
  if (playState.value === 'paused') {
    player?.stop()
    player = null
    playState.value = 'stopped'
  }
  setPlayheadMs(ms, { ensure })
}

/** Klick in die Waveform: Cursor setzen; Ansicht bleibt ruhig (Klick ist im Fenster). */
function onSeek(ms: number): void {
  moveCursor(ms, false)
}

/** Pfeil links: Cursor an den Track-Anfang (0:00) setzen. */
function cursorToStart(): void {
  if (!decoded.value) return
  moveCursor(0, true)
}

/** Pfeil rechts: Cursor an das Track-Ende setzen. */
function cursorToEnd(): void {
  if (!decoded.value) return
  moveCursor(store.durationMs, true)
}

/** Seek aus Zahlenfeldern/Spinnern: Cursor ggf. ins Sichtfenster holen. */
function onSeekReveal(ms: number): void {
  moveCursor(ms, true)
}

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

/**
 * Kumulativer Schnitt: wendet die gewählte Aktion (behalten/entfernen + Fades)
 * auf den aktuellen Puffer an – beliebig oft wiederholbar, je ein Undo-Schritt.
 * Läuft rein lokal und synchron (kein Overlay nötig).
 */
function onCut(): void {
  if (!store.canCut) return
  // Laufende Wiedergabe bezieht sich auf den alten Puffer -> stoppen.
  player?.stop()
  player = null
  playState.value = 'stopped'
  previewing.value = false
  store.setError(null)
  if (store.applyCut()) {
    // Marker auf den Anfang des neuen Puffers setzen.
    cursorMs.value = 0
    setPlayheadMs(0)
  } else if (store.error) {
    store.setError(toMessage(new Error(store.error), 'errors.processFailed'))
  }
}

/**
 * Exportiert den finalen Puffer: encodiert (Browser) bzw. transkodiert per
 * Server (erweiterte Formate laden den bearbeiteten Puffer als WAV hoch).
 * Erst aktiv, sobald mindestens ein Schnitt existiert.
 */
async function onExport(): Promise<void> {
  if (!store.canExport || !decoded.value || !meta.value) return
  store.setError(null)
  store.setResult(null)
  store.setStatus('processing')
  store.setProgress(0)

  abortController = new AbortController()
  try {
    if (mode.value === 'server') {
      // Server transkodiert den bereits geschnittenen Puffer (als WAV) in das
      // Zielformat – Auswahl/Fades sind schon im Puffer enthalten.
      const stem = meta.value.name.replace(/\.[^.]+$/, '') || 'audio'
      const wavFile = new File([engine.toWavBlob(decoded.value)], `${stem}.wav`, {
        type: 'audio/wav',
      })
      const res = await cutOnServer(
        {
          file: wavFile,
          startMs: 0,
          endMs: store.durationMs,
          options: { ...exportOptions.value, fadeInMs: 0, fadeOutMs: 0, cutMode: 'keep' },
        },
        {
          signal: abortController.signal,
          onProgress: (f) => store.setProgress(f * 0.9),
          timeoutMs: 180_000,
        },
      )
      store.setResult(res)
    } else {
      // Kurzer Yield, damit die UI den Busy-State rendern kann.
      await new Promise((r) => setTimeout(r, 0))
      const res = await engine.encode(decoded.value, exportOptions.value, meta.value.name, {
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

/** Ergebnis aus der App verwerfen (Blob freigeben). Server-Temp ist bereits weg. */
function discardResult(): void {
  store.setResult(null)
  store.setStatus('idle')
}

function onDelete(): void {
  discardResult()
}

async function onDownload(): Promise<void> {
  const r = store.result
  if (!r) return
  const fmt = FORMAT_META[r.format]

  // Moderne Browser: Speicherort + Name per Dialog waehlen (File System Access API).
  const picker = (
    window as unknown as {
      showSaveFilePicker?: (o: unknown) => Promise<{
        createWritable: () => Promise<{
          write: (d: Blob) => Promise<void>
          close: () => Promise<void>
        }>
      }>
    }
  ).showSaveFilePicker
  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName: r.filename,
        types: [{ description: fmt.label, accept: { [fmt.mime]: [`.${fmt.ext}`] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(r.blob)
      await writable.close()
      discardResult() // nach erfolgreichem Speichern aus der App entfernen
    } catch (e) {
      // Abbruch im Dialog -> Ergebnis behalten; anderer Fehler -> Fallback unten.
      if (e instanceof DOMException && e.name === 'AbortError') return
      fallbackDownload(r.blob, r.filename)
      discardResult()
    }
    return
  }

  // Fallback (Firefox/Safari): klassischer Download-Anchor.
  fallbackDownload(r.blob, r.filename)
  discardResult()
}

function fallbackDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
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
  // Frisch ab Cursor (sonst Auswahlanfang) bis Dateiende (freies Vorhoeren).
  const startMs = cursorMs.value !== null ? cursorMs.value : region.value.startMs
  startPlayback(startMs, store.durationMs, false)
}

/** Vorschau: nur den markierten Ausschnitt abspielen (hoeren + sehen). */
function onPreview(): void {
  if (!decoded.value) return
  startPlayback(region.value.startMs, region.value.endMs, true)
}

function onPause(): void {
  if (!player || playState.value !== 'playing') return
  cursorMs.value = player.pause()
  playState.value = 'paused'
  setPlayheadMs(cursorMs.value, { follow: true })
}

function onStopPlayback(): void {
  player?.stop()
  player = null
  playState.value = 'stopped'
  previewing.value = false
  // Cursor an den Track-Anfang (0:00) zuruecksetzen und dort ruhen lassen.
  cursorMs.value = 0
  setPlayheadMs(0)
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

/** Wiedergabe an-/aus (Space/K). */
function togglePlay(): void {
  if (!decoded.value) return
  if (playState.value === 'playing') onPause()
  else onPlay()
}

/** Cursor um deltaMs verschieben (Pfeiltasten). Live-Seek bei Wiedergabe. */
function nudgeCursor(deltaMs: number): void {
  if (!decoded.value) return
  const base = cursorMs.value ?? region.value.startMs
  const next = Math.max(0, Math.min(store.durationMs, base + deltaMs))
  moveCursor(next, true)
}

/**
 * Umfangreiche Tastenkürzel (Power-User). Textfelder werden nie gekapert
 * (native Text-Bearbeitung/Undo bleibt erhalten); Strg/Cmd-Kürzel wirken
 * überall ausserhalb von Feldern, Einzeltasten nicht auf fokussierten
 * Bedienelementen (Button/Link behalten ihre native Aktivierung).
 */
function onKeydown(e: KeyboardEvent): void {
  const el = e.target as HTMLElement | null
  const tag = el?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
  const mod = e.ctrlKey || e.metaKey

  // --- Strg/Cmd-Kombinationen ---
  if (mod) {
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault()
      store.undo()
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault()
      store.redo()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (store.canCut) onCut()
    }
    return
  }
  if (e.altKey && !['ArrowLeft', 'ArrowRight'].includes(e.key)) return

  // „?" öffnet die Übersicht immer (auch ohne geladene Datei).
  if (e.key === '?') {
    e.preventDefault()
    showHelp.value = !showHelp.value
    return
  }
  // Escape schliesst zuerst das Overlay.
  if (e.key === 'Escape' && showHelp.value) {
    showHelp.value = false
    return
  }
  // Einzeltasten nicht auf fokussierten Buttons/Links (native Aktivierung).
  if (tag === 'BUTTON' || tag === 'A') return
  if (!hasAudio.value) return

  const step = e.shiftKey ? 1000 : e.altKey ? 10 : 100
  switch (e.key) {
    case ' ':
    case 'k':
    case 'K':
      e.preventDefault()
      togglePlay()
      break
    case 'Enter':
      e.preventDefault()
      if (store.selectedDurationMs > 0) onPreview()
      break
    case 'Escape':
      if (playState.value !== 'stopped') onStopPlayback()
      break
    case 'Home':
      e.preventDefault()
      cursorToStart()
      break
    case 'End':
      e.preventDefault()
      cursorToEnd()
      break
    case 'ArrowLeft':
      e.preventDefault()
      nudgeCursor(-step)
      break
    case 'ArrowRight':
      e.preventDefault()
      nudgeCursor(step)
      break
    case 's':
    case 'S':
      applyCursorAsStart()
      break
    case 'e':
    case 'E':
      applyCursorAsEnd()
      break
    case 'r':
    case 'R':
      store.setRegion(0, store.durationMs)
      break
    case '+':
    case '=':
      waveformRef.value?.zoomIn()
      break
    case '-':
    case '_':
      waveformRef.value?.zoomOut()
      break
    case '0':
      waveformRef.value?.zoomReset()
      break
    case 'f':
    case 'F':
      waveformRef.value?.toggleFollow()
      break
  }
}

// --- Einfügen aus der Zwischenablage (Strg/Cmd+V) ---
const AUDIO_EXT = /\.(wav|mp3|ogg|oga|opus|flac|m4a|aac|weba|webm|aiff?|caf)$/i

/** Erste Audiodatei aus einer FileList holen (nach MIME-Typ oder Endung). */
function pickAudioFile(list: FileList | null | undefined): File | null {
  if (!list) return null
  for (const f of Array.from(list)) {
    if (f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)) return f
  }
  return null
}

/** Enthält die Zwischenablage eine Audiodatei -> laden (sonst native Paste). */
function onPaste(e: ClipboardEvent): void {
  const file = pickAudioFile(e.clipboardData?.files)
  if (!file) return
  e.preventDefault()
  void onFile(file)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('paste', onPaste)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('paste', onPaste)
  player?.stop()
  abortController?.abort()
})
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8 text-neutral-900 dark:text-neutral-100">
    <header class="mb-6">
      <h1 class="font-mono text-2xl font-semibold tracking-tight">
        {{ t('app.title') }} <span class="text-emerald-600 dark:text-emerald-400">{{ t('app.badge') }}</span>
      </h1>
      <p class="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{{ t('app.subtitle') }}</p>
    </header>

    <FileDropzone v-if="!hasAudio" @file="onFile" />

    <div v-else class="flex flex-col gap-6 lg:flex-row lg:items-start">
      <!-- Linke Sidebar: kompakte Export-Steuerung via Dropdowns -->
      <aside class="order-2 w-full shrink-0 lg:order-1 lg:w-72 lg:sticky lg:top-8">
        <ExportPanel
          @cut="onCut"
          @export="onExport"
          @cancel="onCancel"
          @download="onDownload"
          @delete="onDelete"
        />
      </aside>

      <!-- Hauptbereich: Datei-Info, Waveform, Player, Zeitfelder -->
      <main class="order-1 flex min-w-0 flex-1 flex-col gap-5 lg:order-2">
        <div
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-100 px-4 py-2 text-sm dark:bg-neutral-900/40"
        >
          <span class="truncate font-medium text-neutral-800 dark:text-neutral-200">{{ meta?.name }}</span>
          <span class="font-mono text-xs text-neutral-500">
            {{ meta?.sampleRate }} Hz · {{ meta?.numberOfChannels }} {{ t('meta.channels') }} ·
            {{ formatMs(meta?.durationMs ?? 0) }}
          </span>
          <div class="flex items-center gap-3">
            <button
              class="flex h-6 w-6 items-center justify-center rounded-md border border-neutral-300 text-xs font-semibold text-neutral-600 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-emerald-300"
              :title="`${t('shortcuts.open')} (?)`"
              :aria-label="t('shortcuts.open')"
              @click="showHelp = true"
            >
              ?
            </button>
            <button
              class="text-xs text-neutral-600 underline hover:text-emerald-600 dark:text-neutral-400 dark:hover:text-emerald-400"
              @click="store.reset()"
            >
              {{ t('meta.changeFile') }}
            </button>
          </div>
        </div>

        <WaveformEditor ref="waveformRef" @seek="onSeek" />

        <div class="flex flex-col items-center gap-3">
          <div class="flex items-center gap-3">
            <!-- Zum Track-Anfang springen (Cursor auf 0:00) -->
            <button
              class="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-emerald-300"
              :title="t('player.toStart')"
              :aria-label="t('player.toStart')"
              @click="cursorToStart"
            >
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M7 5v14H5V5h2zm12 0v14l-9-7 9-7z" />
              </svg>
            </button>
            <!-- Zum Track-Ende springen (Cursor auf Gesamtdauer) -->
            <button
              class="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-emerald-300"
              :title="t('player.toEnd')"
              :aria-label="t('player.toEnd')"
              @click="cursorToEnd"
            >
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M17 5v14h2V5h-2zM5 5v14l9-7-9-7z" />
              </svg>
            </button>
            <!-- Abspielen / Fortsetzen (wenn nicht gerade spielend) -->
            <button
              v-if="playState !== 'playing'"
              class="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-emerald-300"
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
              class="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-emerald-300"
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
              class="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-300 text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-emerald-300 dark:disabled:hover:border-neutral-700 dark:disabled:hover:text-neutral-200"
              :title="t('player.stop')"
              :aria-label="t('player.stop')"
              :disabled="playState === 'stopped'"
              @click="onStopPlayback"
            >
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="1.5" />
              </svg>
            </button>
            <!-- Vorschau der Auswahl (markierten Ausschnitt hoeren + sehen) -->
            <button
              class="flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              :class="
                previewing
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-neutral-300 text-neutral-700 hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-emerald-300'
              "
              :title="t('player.preview')"
              :aria-label="t('player.preview')"
              :disabled="store.selectedDurationMs <= 0"
              @click="onPreview"
            >
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M5 4v16M8 5v14l10-7z" />
              </svg>
              {{ t('player.preview') }}
            </button>
          </div>

          <!-- Cursor gesetzt: aktuelle Position als Anfang/Ende übernehmen -->
          <div
            v-if="canApplyCursor"
            class="flex flex-wrap items-center justify-center gap-2 text-sm"
          >
            <span class="text-neutral-600 dark:text-neutral-400">
              {{ t('player.cursorAt') }}
              <span class="font-mono text-emerald-700 dark:text-emerald-300">{{ formatMs(cursorMs ?? 0) }}</span>
            </span>
            <button
              class="rounded-md border border-neutral-300 px-3 py-1 font-medium text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-emerald-300"
              @click="applyCursorAsStart"
            >
              {{ t('player.setStart') }}
            </button>
            <button
              class="rounded-md border border-neutral-300 px-3 py-1 font-medium text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-200 dark:hover:text-emerald-300"
              @click="applyCursorAsEnd"
            >
              {{ t('player.setEnd') }}
            </button>
          </div>
        </div>

        <TimeControls @seek="onSeekReveal" />
      </main>
    </div>

    <footer class="mt-10 text-center text-xs text-neutral-600">
      {{ t('app.footer') }}
    </footer>

    <!-- Schneideprozess-Overlay mit Balken und Prozenten -->
    <ProgressOverlay @cancel="onCancel" />

    <!-- Tastenkürzel-/Touch-Übersicht (Taste „?" oder Button in der Datei-Leiste) -->
    <ShortcutsHelp :open="showHelp" @close="showHelp = false" />
  </div>
</template>
