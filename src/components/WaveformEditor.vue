<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'
import { useWaveform } from '../composables/useWaveform'
import { absToView, clampZoom, viewToAbs, viewWindow } from '../utils/zoom'
import { formatMs } from '../utils/audioMath'

const { t } = useI18n({ useScope: 'global' })
const store = useAudioCutterStore()
const { decoded, region, durationMs, canUndo, canRedo } = storeToRefs(store)
const { draw } = useWaveform()

/** Der Nutzer hat per Klick einen Abspielpunkt (ms) gewaehlt. */
const emit = defineEmits<{ (e: 'seek', ms: number): void }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const playhead = ref<number | null>(null)

// --- Zoom / Sichtfenster ---
const ZOOM_STEP = 1.6
const zoom = ref(1) // 1 = ganze Datei
const viewCenterFrac = ref(0.5) // Mitte des sichtbaren Fensters [0..1]
/** Optional: Sichtfenster folgt dem Marker (Standard: aus -> Ansicht bleibt ruhig). */
const followMarker = ref(false)
const win = computed(() => viewWindow(zoom.value, viewCenterFrac.value))
const zoomLabel = computed(() => `${Math.round(zoom.value * 10) / 10}×`)
const canZoomOut = computed(() => zoom.value > 1.001)
const canZoomIn = computed(() => zoom.value < 499)

type DragTarget = 'start' | 'end' | 'new' | null
const dragging = ref<DragTarget>(null)
/** Anker (ms) für eine neue Auswahl – erlaubt Ziehen in BEIDE Richtungen. */
const anchorMs = ref(0)
/** Merkt, ob seit pointerdown wirklich gezogen wurde (Klick vs. Drag). */
const moved = ref(false)
const downX = ref(0)
const DRAG_THRESHOLD_PX = 3

// Aktives Theme (vom [data-theme]-Attribut der globalen Nav gesteuert).
function readTheme(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}
const theme = ref<'light' | 'dark'>(readTheme())

// Canvas-Farben passend zum Theme (Light = heller Hintergrund, dunkler Marker).
const colors = computed(() =>
  theme.value === 'dark'
    ? {
        waveform: '#34d399',
        regionFill: 'rgba(52, 211, 153, 0.12)',
        regionBorder: '#34d399',
        playhead: '#f5f5f5',
        background: '#0a0a0a',
        axis: '#262626',
      }
    : {
        waveform: '#059669',
        regionFill: 'rgba(5, 150, 105, 0.14)',
        regionBorder: '#059669',
        playhead: '#0a0a0a',
        background: '#ffffff',
        axis: '#e5e5e5',
      },
)

// Live-Anzeigen: Gesamtdauer, Cursorposition, Restdauer (ms + mm:ss.mmm).
const cursorLiveMs = computed(() =>
  playhead.value !== null ? playhead.value * durationMs.value : null,
)
const remainingMs = computed(() =>
  cursorLiveMs.value !== null ? Math.max(0, durationMs.value - cursorLiveMs.value) : null,
)
const msLabel = (ms: number) => `${formatMs(ms)} · ${Math.round(ms)} ms`

const regionStartFrac = computed(() =>
  durationMs.value > 0 ? region.value.startMs / durationMs.value : 0,
)
const regionEndFrac = computed(() =>
  durationMs.value > 0 ? region.value.endMs / durationMs.value : 0,
)

function render(): void {
  const canvas = canvasRef.value
  if (!canvas) return
  const channel = decoded.value?.channels[0] ?? null
  draw(canvas, channel, {
    regionStart: regionStartFrac.value,
    regionEnd: regionEndFrac.value,
    playhead: playhead.value,
    viewStart: win.value.start,
    viewEnd: win.value.end,
    colors: colors.value,
  })
}

/** Pixel-X -> ms unter Beruecksichtigung des Zoom-Fensters. */
function xToMs(clientX: number): number {
  const canvas = canvasRef.value
  if (!canvas) return 0
  const rect = canvas.getBoundingClientRect()
  const viewFrac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  return viewToAbs(viewFrac, win.value) * durationMs.value
}

// --- Zoom-Steuerung ---
function zoomBy(factor: number): void {
  // Um den Marker (falls vorhanden) oder die aktuelle Mitte herum zoomen.
  const anchor = playhead.value ?? viewCenterFrac.value
  zoom.value = clampZoom(zoom.value * factor)
  viewCenterFrac.value = anchor
}
function zoomIn(): void {
  zoomBy(ZOOM_STEP)
}
function zoomOut(): void {
  zoomBy(1 / ZOOM_STEP)
}
function zoomReset(): void {
  zoom.value = 1
  viewCenterFrac.value = 0.5
}

function onWheel(e: WheelEvent): void {
  if (!store.hasAudio) return
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  if (e.shiftKey) {
    // Shift+Rad: horizontal verschieben (Pan).
    const frac = (e.deltaY || e.deltaX) / rect.width
    viewCenterFrac.value = Math.max(0, Math.min(1, viewCenterFrac.value + frac * win.value.width))
    return
  }
  // Rad: an der Cursorposition zoomen (Frac unter dem Cursor bleibt fix).
  const cursorViewFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const absUnderCursor = viewToAbs(cursorViewFrac, win.value)
  zoom.value = clampZoom(zoom.value * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP))
  const newWidth = 1 / zoom.value
  viewCenterFrac.value = absUnderCursor - cursorViewFrac * newWidth + newWidth / 2
}

const HANDLE_PX = 8

function onPointerDown(e: PointerEvent): void {
  if (!store.hasAudio) return
  const canvas = canvasRef.value!
  canvas.setPointerCapture(e.pointerId)
  const rect = canvas.getBoundingClientRect()
  const xStart = absToView(regionStartFrac.value, win.value) * rect.width
  const xEnd = absToView(regionEndFrac.value, win.value) * rect.width
  const x = e.clientX - rect.left

  downX.value = x
  moved.value = false

  if (Math.abs(x - xStart) <= HANDLE_PX) dragging.value = 'start'
  else if (Math.abs(x - xEnd) <= HANDLE_PX) dragging.value = 'end'
  else {
    // Neue Auswahl: Anker merken, aber noch NICHTS setzen -> ein reiner Klick
    // (ohne Bewegung) laesst die bestehende Auswahl unangetastet.
    dragging.value = 'new'
    anchorMs.value = xToMs(e.clientX)
  }
}

function onPointerMove(e: PointerEvent): void {
  const ms = xToMs(e.clientX)
  if (dragging.value) {
    const rect = canvasRef.value!.getBoundingClientRect()
    if (Math.abs(e.clientX - rect.left - downX.value) > DRAG_THRESHOLD_PX) moved.value = true
  }

  if (dragging.value === 'start') store.setStart(ms)
  else if (dragging.value === 'end') store.setEnd(ms)
  // Anker + aktuelle Position -> setRegion sortiert selbst (Ziehen in beide Richtungen).
  else if (dragging.value === 'new') {
    if (moved.value) store.setRegion(anchorMs.value, ms)
  }
}

function onPointerUp(e: PointerEvent): void {
  if (dragging.value === 'new' && !moved.value && store.hasAudio) {
    // Reiner Klick: Abspielpunkt setzen (Marker) und den Eltern-Container informieren.
    const ms = xToMs(e.clientX)
    playhead.value = durationMs.value > 0 ? ms / durationMs.value : null
    emit('seek', ms)
  }
  dragging.value = null
  canvasRef.value?.releasePointerCapture(e.pointerId)
}

let ro: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
watch([regionStartFrac, regionEndFrac, decoded, playhead, zoom, viewCenterFrac, theme], render)

// Neue Datei -> Zoom zuruecksetzen.
watch(decoded, () => {
  zoom.value = 1
  viewCenterFrac.value = 0.5
})

onMounted(() => {
  render()
  ro = new ResizeObserver(render)
  if (canvasRef.value) ro.observe(canvasRef.value)
  // Theme-Umschaltung (globale Nav setzt [data-theme] auf <html>) beobachten
  // und die Canvas-Farben neu zeichnen.
  themeObserver = new MutationObserver(() => {
    const next = readTheme()
    if (next !== theme.value) theme.value = next
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
})
onBeforeUnmount(() => {
  ro?.disconnect()
  themeObserver?.disconnect()
})

defineExpose({
  // Sichtfenster folgt dem Marker nur, wenn "Marker folgen" aktiv ist (Standard: aus).
  // opts.follow  -> bei Wiedergabe zentrieren, wenn "Marker folgen" aktiv ist.
  // opts.ensure  -> Cursor ins Sichtfenster holen, falls ausserhalb (Spinner/Feld),
  //                 unabhaengig vom Toggle. Ein Klick (ohne opts) laesst die
  //                 Ansicht ruhig, weil der Klick ohnehin im Fenster liegt.
  setPlayhead: (frac: number | null, opts: { follow?: boolean; ensure?: boolean } = {}) => {
    playhead.value = frac
    if (frac === null) return
    if (opts.ensure) {
      if (frac < win.value.start || frac > win.value.end) viewCenterFrac.value = frac
    } else if (opts.follow && followMarker.value) {
      viewCenterFrac.value = frac
    }
  },
})
</script>

<template>
  <div class="w-full">
    <!-- Zoom-Toolbar -->
    <div class="mb-2 flex items-center justify-between gap-1">
      <div class="flex items-center gap-1">
      <!-- Undo / Redo -->
      <button
        class="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-emerald-300 dark:disabled:hover:border-neutral-700 dark:disabled:hover:text-neutral-300"
        :title="`${t('history.undo')} (Ctrl+Z)`"
        :aria-label="t('history.undo')"
        :disabled="!canUndo"
        @click="store.undo()"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 14 4 9l5-5" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 9h11a5 5 0 0 1 0 10h-2" />
        </svg>
      </button>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-emerald-300 dark:disabled:hover:border-neutral-700 dark:disabled:hover:text-neutral-300"
        :title="`${t('history.redo')} (Ctrl+Y)`"
        :aria-label="t('history.redo')"
        :disabled="!canRedo"
        @click="store.redo()"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="m15 14 5-5-5-5" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M20 9H9a5 5 0 0 0 0 10h2" />
        </svg>
      </button>
      <!-- Optional: Sichtfenster folgt dem Marker (Standard aus) -->
      <button
        class="flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors"
        :class="followMarker
          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-neutral-300 text-neutral-600 hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-emerald-300'"
        :aria-pressed="followMarker"
        :title="t('waveform.followMarker')"
        @click="followMarker = !followMarker"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path stroke-linecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
        {{ t('waveform.followMarker') }}
      </button>
      </div>

      <div class="flex items-center gap-1">
      <button
        class="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-emerald-300 dark:disabled:hover:border-neutral-700 dark:disabled:hover:text-neutral-300"
        :title="t('waveform.zoomOut')"
        :aria-label="t('waveform.zoomOut')"
        :disabled="!canZoomOut"
        @click="zoomOut"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" d="M5 12h14" />
        </svg>
      </button>
      <span class="w-12 text-center font-mono text-xs text-neutral-600 dark:text-neutral-400">{{ zoomLabel }}</span>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-emerald-300 dark:disabled:hover:border-neutral-700 dark:disabled:hover:text-neutral-300"
        :title="t('waveform.zoomIn')"
        :aria-label="t('waveform.zoomIn')"
        :disabled="!canZoomIn"
        @click="zoomIn"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button
        class="ml-1 flex h-8 items-center justify-center rounded-md border border-neutral-300 px-2 text-xs font-medium text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-emerald-300 dark:disabled:hover:border-neutral-700 dark:disabled:hover:text-neutral-300"
        :title="t('waveform.zoomReset')"
        :aria-label="t('waveform.zoomReset')"
        :disabled="!canZoomOut"
        @click="zoomReset"
      >
        1:1
      </button>
      </div>
    </div>

    <canvas
      ref="canvasRef"
      class="h-40 w-full cursor-crosshair rounded-lg border border-neutral-200 bg-white touch-none select-none dark:border-transparent dark:bg-neutral-950"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @wheel.prevent="onWheel"
    ></canvas>

    <!-- Live-Werte: Gesamtdauer (links) · Cursor (Mitte) · Restdauer (rechts) -->
    <div class="mt-2 flex items-start justify-between gap-2 font-mono text-xs">
      <div class="text-left text-neutral-600 dark:text-neutral-400">
        <div class="text-[10px] uppercase tracking-wide text-neutral-500">{{ t('waveform.total') }}</div>
        <div class="text-neutral-800 dark:text-neutral-200">{{ msLabel(durationMs) }}</div>
      </div>
      <div class="text-center">
        <div class="text-[10px] uppercase tracking-wide text-neutral-500">{{ t('waveform.cursor') }}</div>
        <div class="text-emerald-700 dark:text-emerald-300">{{ cursorLiveMs !== null ? msLabel(cursorLiveMs) : '–' }}</div>
      </div>
      <div class="text-right text-neutral-600 dark:text-neutral-400">
        <div class="text-[10px] uppercase tracking-wide text-neutral-500">{{ t('waveform.remaining') }}</div>
        <div class="text-neutral-800 dark:text-neutral-200">{{ remainingMs !== null ? msLabel(remainingMs) : '–' }}</div>
      </div>
    </div>

    <p class="mt-1 text-center text-xs text-neutral-500">
      {{ t('waveform.hint') }}
    </p>
  </div>
</template>
