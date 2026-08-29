<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'
import type { ExportFormat, ProcessingMode } from '../types/audio'

const { t } = useI18n({ useScope: 'global' })
const store = useAudioCutterStore()
const { mode, exportOptions, status, progress, error, result, canProcess } = storeToRefs(store)

const emit = defineEmits<{
  (e: 'process'): void
  (e: 'cancel'): void
  (e: 'download'): void
  (e: 'delete'): void
}>()

const busy = computed(() => status.value === 'processing' || status.value === 'decoding')

function setMode(m: ProcessingMode): void {
  store.setMode(m)
}
function setFormat(f: ExportFormat): void {
  store.patchExportOptions({ format: f })
}

const modes: ProcessingMode[] = ['browser', 'server']
</script>

<template>
  <div class="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
    <!-- Modus -->
    <div>
      <p class="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{{ t('export.processingLabel') }}</p>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="m in modes"
          :key="m"
          class="flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors"
          :class="mode === m ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-600'"
          @click="setMode(m)"
        >
          <span class="text-sm font-medium text-neutral-100">{{ t(`export.modes.${m}.label`) }}</span>
          <span class="text-xs text-neutral-500">{{ t(`export.modes.${m}.hint`) }}</span>
        </button>
      </div>
    </div>

    <!-- Format -->
    <div>
      <p class="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{{ t('export.format') }}</p>
      <div class="flex gap-2">
        <button
          v-for="f in (['wav', 'mp3'] as ExportFormat[])"
          :key="f"
          class="flex-1 rounded-lg border px-3 py-2 text-sm font-medium uppercase transition-colors"
          :class="exportOptions.format === f ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-neutral-700 text-neutral-300 hover:border-neutral-600'"
          @click="setFormat(f)"
        >
          {{ f }}
        </button>
      </div>
      <div v-if="exportOptions.format === 'mp3'" class="mt-3">
        <label class="mb-1 block text-xs text-neutral-400">{{ t('export.bitrate', { value: exportOptions.mp3Bitrate }) }}</label>
        <input
          type="range" min="96" max="320" step="32"
          :value="exportOptions.mp3Bitrate"
          class="w-full accent-emerald-500"
          @input="store.patchExportOptions({ mp3Bitrate: Number(($event.target as HTMLInputElement).value) })"
        />
      </div>
    </div>

    <!-- Fades -->
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="mb-1 block text-xs text-neutral-400">{{ t('export.fadeIn') }}</label>
        <input
          type="number" min="0" step="10"
          :value="exportOptions.fadeInMs"
          class="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-sm text-neutral-100 outline-none focus:border-emerald-500"
          @input="store.patchExportOptions({ fadeInMs: Math.max(0, Number(($event.target as HTMLInputElement).value)) })"
        />
      </div>
      <div>
        <label class="mb-1 block text-xs text-neutral-400">{{ t('export.fadeOut') }}</label>
        <input
          type="number" min="0" step="10"
          :value="exportOptions.fadeOutMs"
          class="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-sm text-neutral-100 outline-none focus:border-emerald-500"
          @input="store.patchExportOptions({ fadeOutMs: Math.max(0, Number(($event.target as HTMLInputElement).value)) })"
        />
      </div>
    </div>

    <!-- Aktion -->
    <div class="flex flex-col gap-2">
      <button
        v-if="!busy"
        class="rounded-lg bg-emerald-500 px-4 py-2.5 font-medium text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
        :disabled="!canProcess"
        @click="emit('process')"
      >
        {{ t('export.submit') }}
      </button>
      <button
        v-else
        class="rounded-lg border border-neutral-600 px-4 py-2.5 font-medium text-neutral-200 hover:border-red-500 hover:text-red-400"
        @click="emit('cancel')"
      >
        {{ t('export.cancel') }}
      </button>

      <div v-if="busy" class="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div class="h-full bg-emerald-500 transition-[width]" :style="{ width: `${Math.round(progress * 100)}%` }"></div>
      </div>

      <p v-if="error" class="text-sm text-red-400">{{ error }}</p>

      <template v-if="result">
        <button
          class="rounded-lg border border-emerald-500 px-4 py-2.5 font-medium text-emerald-300 hover:bg-emerald-500/10"
          @click="emit('download')"
        >
          ⬇ {{ t('export.download', { name: result.filename }) }}
        </button>
        <button
          class="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:border-red-500 hover:text-red-400"
          @click="emit('delete')"
        >
          🗑 {{ t('export.delete') }}
        </button>
      </template>
    </div>
  </div>
</template>
