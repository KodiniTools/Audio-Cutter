<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'
import type { CutMode, ExportFormat, ProcessingMode } from '../types/audio'
import { FORMAT_META, formatsForMode } from '../utils/formats'

const { t } = useI18n({ useScope: 'global' })
const store = useAudioCutterStore()
const { mode, exportOptions, error, result, busy, canCut, canExport, hasEdits } =
  storeToRefs(store)

const emit = defineEmits<{
  (e: 'cut'): void
  (e: 'export'): void
  (e: 'cancel'): void
  (e: 'download'): void
  (e: 'delete'): void
}>()

function setMode(m: ProcessingMode): void {
  store.setMode(m)
}
function setFormat(f: ExportFormat): void {
  store.patchExportOptions({ format: f })
}
function setCutMode(m: CutMode): void {
  store.patchExportOptions({ cutMode: m })
}

const modes: ProcessingMode[] = ['browser', 'server']
const cutModes: CutMode[] = ['keep', 'remove']
// Im Browser-Modus nur WAV/MP3, im Server-Modus alle Formate.
const formats = computed<ExportFormat[]>(() => formatsForMode(mode.value))
const formatLabel = (f: ExportFormat): string => FORMAT_META[f].label
// Bitrate nur für verlustbehaftete Formate anzeigen (MP3, OGG, AAC, WebM).
const showBitrate = computed(() => FORMAT_META[exportOptions.value.format].lossy)
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- ===== Schnitt (kumulativ: wirkt auf den bearbeiteten Puffer) ===== -->
    <div class="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
      <h2 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{{ t('export.cutTitle') }}</h2>

      <!-- Aktion -->
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">{{
          t('export.cutModeLabel')
        }}</span>
        <div class="select-wrap">
          <select
            class="select"
            :value="exportOptions.cutMode"
            @change="setCutMode(($event.target as HTMLSelectElement).value as CutMode)"
          >
            <option v-for="m in cutModes" :key="m" :value="m">
              {{ t(`export.cutModes.${m}.label`) }}
            </option>
          </select>
        </div>
      </label>

      <!-- Fades -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">{{ t('export.fadeIn') }}</label>
          <input
            type="number"
            min="0"
            step="10"
            :value="exportOptions.fadeInMs"
            class="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-sm text-neutral-900 outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            @input="
              store.patchExportOptions({
                fadeInMs: Math.max(0, Number(($event.target as HTMLInputElement).value)),
              })
            "
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">{{ t('export.fadeOut') }}</label>
          <input
            type="number"
            min="0"
            step="10"
            :value="exportOptions.fadeOutMs"
            class="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-sm text-neutral-900 outline-none focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            @input="
              store.patchExportOptions({
                fadeOutMs: Math.max(0, Number(($event.target as HTMLInputElement).value)),
              })
            "
          />
        </div>
      </div>

      <button
        class="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-400"
        :disabled="!canCut"
        @click="emit('cut')"
      >
        {{ t('export.cut') }}
      </button>
      <p class="text-xs text-neutral-500">{{ t('export.cutHint') }}</p>
    </div>

    <!-- ===== Export (encodiert den finalen Puffer) ===== -->
    <div class="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
      <h2 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{{ t('export.title') }}</h2>

      <!-- Verarbeitung -->
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">{{
          t('export.processingLabel')
        }}</span>
        <div class="select-wrap">
          <select
            class="select"
            :value="mode"
            @change="setMode(($event.target as HTMLSelectElement).value as ProcessingMode)"
          >
            <option v-for="m in modes" :key="m" :value="m">
              {{ t(`export.modes.${m}.label`) }}
            </option>
          </select>
        </div>
      </label>

      <!-- Format -->
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">{{ t('export.format') }}</span>
        <div class="select-wrap">
          <select
            class="select"
            :value="exportOptions.format"
            @change="setFormat(($event.target as HTMLSelectElement).value as ExportFormat)"
          >
            <option v-for="f in formats" :key="f" :value="f">{{ formatLabel(f) }}</option>
          </select>
        </div>
      </label>

      <!-- Bitrate (nur verlustbehaftete Formate) -->
      <div v-if="showBitrate">
        <label class="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">{{
          t('export.bitrate', { value: exportOptions.mp3Bitrate })
        }}</label>
        <input
          type="range"
          min="96"
          max="320"
          step="32"
          :value="exportOptions.mp3Bitrate"
          class="w-full accent-emerald-500"
          @input="
            store.patchExportOptions({
              mp3Bitrate: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
      </div>

      <!-- Aktion -->
      <div class="flex flex-col gap-2 pt-1">
        <button
          v-if="!busy"
          class="rounded-lg border border-emerald-500 px-4 py-2.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400 disabled:hover:bg-transparent dark:text-emerald-300 dark:disabled:border-neutral-700 dark:disabled:text-neutral-500"
          :disabled="!canExport"
          @click="emit('export')"
        >
          {{ t('export.submit') }}
        </button>
        <button
          v-else
          class="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:border-red-500 hover:text-red-400 dark:border-neutral-600 dark:text-neutral-200"
          @click="emit('cancel')"
        >
          {{ t('export.cancel') }}
        </button>

        <p v-if="!hasEdits && !busy" class="text-xs text-neutral-500">{{ t('export.noEdits') }}</p>
        <p v-if="error" class="text-sm text-red-400">{{ error }}</p>

        <template v-if="result">
          <button
            class="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-emerald-400"
            @click="emit('download')"
          >
            ⬇ {{ t('export.download', { name: result.filename }) }}
          </button>
          <button
            class="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-red-500 hover:text-red-400 dark:border-neutral-700 dark:text-neutral-300"
            @click="emit('delete')"
          >
            🗑 {{ t('export.delete') }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Kompakte Dropdowns mit eigenem Chevron statt großer Buttons. */
.select-wrap {
  position: relative;
}
.select {
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 0.375rem;
  border: 1px solid rgb(212 212 212); /* neutral-300 (light) */
  background-color: #ffffff;
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: rgb(23 23 23); /* neutral-900 (light) */
  outline: none;
  cursor: pointer;
}
/* Dark-Theme (Attribut auf <html>, daher als Vorfahren-Selektor). */
[data-theme='dark'] .select {
  border-color: rgb(64 64 64); /* neutral-700 */
  background-color: rgb(10 10 10); /* neutral-950 */
  color: rgb(245 245 245); /* neutral-100 */
}
.select:focus {
  border-color: rgb(16 185 129); /* emerald-500 */
}
.select-wrap::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 0.75rem;
  width: 0.5rem;
  height: 0.5rem;
  border-right: 2px solid rgb(115 115 115); /* neutral-500 */
  border-bottom: 2px solid rgb(115 115 115);
  transform: translateY(-65%) rotate(45deg);
  pointer-events: none;
}
</style>
