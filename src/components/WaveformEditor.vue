<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'
import { useWaveform } from '../composables/useWaveform'

const { t } = useI18n({ useScope: 'global' })
const store = useAudioCutterStore()
const { decoded, region, durationMs } = storeToRefs(store)
const { draw } = useWaveform()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const playhead = ref<number | null>(null)

type DragTarget = 'start' | 'end' | 'new' | null
const dragging = ref<DragTarget>(null)

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
    colors,
  })
}

function xToMs(clientX: number): number {
  const canvas = canvasRef.value
  if (!canvas) return 0
  const rect = canvas.getBoundingClientRect()
  const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  return frac * durationMs.value
}

const HANDLE_PX = 8

function onPointerDown(e: PointerEvent): void {
  if (!store.hasAudio) return
  const canvas = canvasRef.value!
  canvas.setPointerCapture(e.pointerId)
  const rect = canvas.getBoundingClientRect()
  const xStart = regionStartFrac.value * rect.width
  const xEnd = regionEndFrac.value * rect.width
  const x = e.clientX - rect.left

  if (Math.abs(x - xStart) <= HANDLE_PX) dragging.value = 'start'
  else if (Math.abs(x - xEnd) <= HANDLE_PX) dragging.value = 'end'
  else {
    dragging.value = 'new'
    const ms = xToMs(e.clientX)
    store.setRegion(ms, ms)
  }
  onPointerMove(e)
}

function onPointerMove(e: PointerEvent): void {
  const ms = xToMs(e.clientX)
  if (dragging.value === 'start') store.setStart(ms)
  else if (dragging.value === 'end') store.setEnd(ms)
  else if (dragging.value === 'new') store.setEnd(ms)
  else if (store.hasAudio) playhead.value = durationMs.value > 0 ? ms / durationMs.value : null
}

function onPointerUp(e: PointerEvent): void {
  if (dragging.value === 'new' && region.value.startMs === region.value.endMs) {
    // reiner Klick -> keine Auswahl von Länge 0 stehen lassen
    store.setRegion(0, durationMs.value)
  }
  dragging.value = null
  canvasRef.value?.releasePointerCapture(e.pointerId)
}

function onLeave(): void {
  if (!dragging.value) playhead.value = null
}

let ro: ResizeObserver | null = null
watch([regionStartFrac, regionEndFrac, decoded, playhead], render)

onMounted(() => {
  render()
  ro = new ResizeObserver(render)
  if (canvasRef.value) ro.observe(canvasRef.value)
})
onBeforeUnmount(() => ro?.disconnect())

defineExpose({ setPlayhead: (frac: number | null) => (playhead.value = frac) })
</script>

<template>
  <div class="w-full">
    <canvas
      ref="canvasRef"
      class="h-40 w-full cursor-crosshair rounded-lg bg-neutral-950 touch-none select-none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onLeave"
    ></canvas>
    <p class="mt-2 text-center text-xs text-neutral-500">
      {{ t('waveform.hint') }}
    </p>
  </div>
</template>
