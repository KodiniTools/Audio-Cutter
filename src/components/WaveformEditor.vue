<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'
import { useWaveform } from '../composables/useWaveform'
import { absToView, clampZoom, viewToAbs, viewWindow } from '../utils/zoom'

const { t } = useI18n({ useScope: 'global' })
const store = useAudioCutterStore()
const { decoded, region, durationMs } = storeToRefs(store)
const { draw } = useWaveform()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const playhead = ref<number | null>(null)

// --- Zoom / Sichtfenster ---
const ZOOM_STEP = 1.6
const zoom = ref(1) // 1 = ganze Datei
const viewCenterFrac = ref(0.5) // Mitte des sichtbaren Fensters [0..1]
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

const colors = {
  waveform: '#34d399',
  regionFill: 'rgba(52, 211, 153, 0.12)',
  regionBorder: '#34d399',
  playhead: '#f5f5f5',
  background: '#0a0a0a',
  axis: '#262626',
}

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
    colors,
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
  } else if (store.hasAudio) {
    playhead.value = durationMs.value > 0 ? ms / durationMs.value : null
  }
}

function onPointerUp(e: PointerEvent): void {
  if (dragging.value === 'new' && !moved.value) {
    // Reiner Klick: Auswahl unveraendert lassen, nur den Playhead setzen.
    playhead.value = durationMs.value > 0 ? xToMs(e.clientX) / durationMs.value : null
  }
  dragging.value = null
  canvasRef.value?.releasePointerCapture(e.pointerId)
}

function onLeave(): void {
  if (!dragging.value) playhead.value = null
}

let ro: ResizeObserver | null = null
watch([regionStartFrac, regionEndFrac, decoded, playhead, zoom, viewCenterFrac], render)

// Neue Datei -> Zoom zuruecksetzen.
watch(decoded, () => {
  zoom.value = 1
  viewCenterFrac.value = 0.5
})

onMounted(() => {
  render()
  ro = new ResizeObserver(render)
  if (canvasRef.value) ro.observe(canvasRef.value)
})
onBeforeUnmount(() => ro?.disconnect())

defineExpose({
  // follow=true -> Sichtfenster folgt dem Marker (Wiedergabe/Pause).
  setPlayhead: (frac: number | null, follow = false) => {
    playhead.value = frac
    if (follow && frac !== null) viewCenterFrac.value = frac
  },
})
</script>

<template>
  <div class="w-full">
    <!-- Zoom-Toolbar -->
    <div class="mb-2 flex items-center justify-end gap-1">
      <button
        class="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 transition-colors hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:text-neutral-300"
        :title="t('waveform.zoomOut')"
        :aria-label="t('waveform.zoomOut')"
        :disabled="!canZoomOut"
        @click="zoomOut"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" d="M5 12h14" />
        </svg>
      </button>
      <span class="w-12 text-center font-mono text-xs text-neutral-400">{{ zoomLabel }}</span>
      <button
        class="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 transition-colors hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:text-neutral-300"
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
        class="ml-1 flex h-8 items-center justify-center rounded-md border border-neutral-700 px-2 text-xs font-medium text-neutral-300 transition-colors hover:border-emerald-500 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-700 disabled:hover:text-neutral-300"
        :title="t('waveform.zoomReset')"
        :aria-label="t('waveform.zoomReset')"
        :disabled="!canZoomOut"
        @click="zoomReset"
      >
        1:1
      </button>
    </div>

    <canvas
      ref="canvasRef"
      class="h-40 w-full cursor-crosshair rounded-lg bg-neutral-950 touch-none select-none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onLeave"
      @wheel.prevent="onWheel"
    ></canvas>
    <p class="mt-2 text-center text-xs text-neutral-500">
      {{ t('waveform.hint') }}
    </p>
  </div>
</template>
