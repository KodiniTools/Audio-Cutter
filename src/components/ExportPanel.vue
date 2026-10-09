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
  <!-- ===== Schnitt (kumulativ: wirkt auf den bearbeiteten Puffer) ===== -->
  <section class="panel-section">
    <div class="panel-section-head">
      <h2 class="panel-section-title">{{ t('export.cutTitle') }}</h2>
    </div>
    <div class="panel-section-body">
      <!-- Aktion -->
      <div class="field-row">
        <label for="ac-cut-mode">{{ t('export.cutModeLabel') }}</label>
        <select
          id="ac-cut-mode"
          class="field-select"
          :value="exportOptions.cutMode"
          @change="setCutMode(($event.target as HTMLSelectElement).value as CutMode)"
        >
          <option v-for="m in cutModes" :key="m" :value="m">
            {{ t(`export.cutModes.${m}.label`) }}
          </option>
        </select>
      </div>

      <!-- Fades -->
      <div class="field-row">
        <label for="ac-fade-in">{{ t('export.fadeIn') }}</label>
        <input
          id="ac-fade-in"
          type="number"
          min="0"
          step="10"
          :value="exportOptions.fadeInMs"
          class="field-input"
          @input="
            store.patchExportOptions({
              fadeInMs: Math.max(0, Number(($event.target as HTMLInputElement).value)),
            })
          "
        />
      </div>
      <div class="field-row">
        <label for="ac-fade-out">{{ t('export.fadeOut') }}</label>
        <input
          id="ac-fade-out"
          type="number"
          min="0"
          step="10"
          :value="exportOptions.fadeOutMs"
          class="field-input"
          @input="
            store.patchExportOptions({
              fadeOutMs: Math.max(0, Number(($event.target as HTMLInputElement).value)),
            })
          "
        />
      </div>

      <div class="export-buttons">
        <button class="export-btn export-btn-primary" :disabled="!canCut" @click="emit('cut')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <line x1="20" y1="4" x2="8.12" y2="15.88" />
            <line x1="14.47" y1="14.48" x2="20" y2="20" />
            <line x1="8.12" y1="8.12" x2="12" y2="12" />
          </svg>
          <span>{{ t('export.cut') }}</span>
        </button>
      </div>
      <p class="sidebar-hint text-xs">{{ t('export.cutHint') }}</p>
    </div>
  </section>

  <!-- ===== Export (encodiert den finalen Puffer) ===== -->
  <section class="panel-section">
    <div class="panel-section-head">
      <h2 class="panel-section-title">{{ t('export.title') }}</h2>
    </div>
    <div class="panel-section-body">
      <!-- Verarbeitung -->
      <div class="field-row">
        <label for="ac-mode">{{ t('export.processingLabel') }}</label>
        <select
          id="ac-mode"
          class="field-select"
          :value="mode"
          @change="setMode(($event.target as HTMLSelectElement).value as ProcessingMode)"
        >
          <option v-for="m in modes" :key="m" :value="m">
            {{ t(`export.modes.${m}.label`) }}
          </option>
        </select>
      </div>

      <!-- Format -->
      <div class="field-row">
        <label for="ac-format">{{ t('export.format') }}</label>
        <select
          id="ac-format"
          class="field-select"
          :value="exportOptions.format"
          @change="setFormat(($event.target as HTMLSelectElement).value as ExportFormat)"
        >
          <option v-for="f in formats" :key="f" :value="f">{{ formatLabel(f) }}</option>
        </select>
      </div>

      <!-- Bitrate (nur verlustbehaftete Formate) -->
      <div v-if="showBitrate" class="flex flex-col gap-1">
        <label for="ac-bitrate" class="caps-label">{{
          t('export.bitrate', { value: exportOptions.mp3Bitrate })
        }}</label>
        <input
          id="ac-bitrate"
          type="range"
          min="96"
          max="320"
          step="32"
          :value="exportOptions.mp3Bitrate"
          @input="
            store.patchExportOptions({
              mp3Bitrate: Number(($event.target as HTMLInputElement).value),
            })
          "
        />
      </div>

      <!-- Aktion -->
      <div class="export-buttons">
        <button v-if="!busy" class="export-btn" :disabled="!canExport" @click="emit('export')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>{{ t('export.submit') }}</span>
        </button>
        <button v-else class="export-btn export-btn-danger" @click="emit('cancel')">
          {{ t('export.cancel') }}
        </button>

        <template v-if="result">
          <button class="export-btn export-btn-primary" @click="emit('download')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span class="truncate">{{ t('export.download', { name: result.filename }) }}</span>
          </button>
          <button class="export-btn export-btn-danger" @click="emit('delete')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7" />
            </svg>
            <span>{{ t('export.delete') }}</span>
          </button>
        </template>
      </div>

      <p v-if="!hasEdits && !busy" class="sidebar-hint text-xs">{{ t('export.noEdits') }}</p>
      <p v-if="error" class="text-sm font-medium text-danger">{{ error }}</p>
    </div>
  </section>
</template>
