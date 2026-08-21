<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'
import { useAudioEngine } from '../composables/useAudioEngine'
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
let stopPlayback: (() => void) | null = null
const isPlaying = ref(false)

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

function togglePlay(): void {
  if (!decoded.value) return
  if (isPlaying.value) {
    stopPlayback?.()
    return
  }
  isPlaying.value = true
  stopPlayback = engine.playRegion(decoded.value, region.value, () => {
    isPlaying.value = false
    stopPlayback = null
    waveformRef.value?.setPlayhead(null)
  })
}

onBeforeUnmount(() => {
  stopPlayback?.()
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

      <WaveformEditor ref="waveformRef" />

      <div class="flex justify-center">
        <button
          class="rounded-full border border-neutral-700 px-5 py-2 text-sm font-medium text-neutral-200 hover:border-emerald-500 hover:text-emerald-300"
          @click="togglePlay"
        >
          {{ isPlaying ? '■ ' + t('player.stop') : '▶ ' + t('player.play') }}
        </button>
      </div>

      <TimeControls />

      <ExportPanel @process="onProcess" @cancel="onCancel" @download="onDownload" />
    </div>

    <footer class="mt-10 text-center text-xs text-neutral-600">
      {{ t('app.footer') }}
    </footer>
  </div>
</template>
