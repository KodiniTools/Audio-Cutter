<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'
import { formatMs, parseTimeToMs } from '../utils/audioMath'

const { t } = useI18n({ useScope: 'global' })
const store = useAudioCutterStore()
const { region, durationMs, selectedDurationMs, regionValidation } = storeToRefs(store)

/** Cursor mit dem editierten Wert synchronisieren (Waveform-Marker folgt). */
const emit = defineEmits<{ (e: 'seek', ms: number): void }>()

function applyStart(ms: number): void {
  store.setStart(ms)
  emit('seek', region.value.startMs) // geclampten Endwert melden
}
function applyEnd(ms: number): void {
  store.setEnd(ms)
  emit('seek', region.value.endMs)
}

const startText = computed({
  get: () => formatMs(region.value.startMs),
  set: (v: string) => {
    const ms = parseTimeToMs(v)
    if (ms !== null) applyStart(ms)
  },
})
const endText = computed({
  get: () => formatMs(region.value.endMs),
  set: (v: string) => {
    const ms = parseTimeToMs(v)
    if (ms !== null) applyEnd(ms)
  },
})

/** Ganzzahlige ms fuer die nativen Spinner (input type=number). */
const startMs = computed({
  get: () => Math.round(region.value.startMs),
  set: (v: number | string) => {
    const ms = Number(v)
    if (Number.isFinite(ms)) applyStart(ms)
  },
})
const endMs = computed({
  get: () => Math.round(region.value.endMs),
  set: (v: number | string) => {
    const ms = Number(v)
    if (Number.isFinite(ms)) applyEnd(ms)
  },
})
const maxMs = computed(() => Math.round(durationMs.value))

const nudges = [-100, -10, -1, 1, 10, 100]
function nudgeStart(delta: number): void {
  applyStart(region.value.startMs + delta)
}
function nudgeEnd(delta: number): void {
  applyEnd(region.value.endMs + delta)
}
function fmtDelta(d: number): string {
  return `${d > 0 ? '+' : ''}${d}`
}

/** Auswahl auf die volle Länge zurücksetzen -> neu wählbar. */
function resetSelection(): void {
  store.setRegion(0, durationMs.value)
}

/** Auswahl ist nicht bereits die volle Länge? (Reset dann sinnvoll) */
const canReset = computed(
  () => region.value.startMs > 0 || region.value.endMs < durationMs.value,
)
</script>

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div class="workspace-card p-4">
      <label class="caps-label mb-1.5 block">{{ t('time.start') }}</label>
      <input
        v-model="startText"
        class="field-input font-mono !w-full !text-lg !font-bold text-cut-start"
        inputmode="decimal"
        :placeholder="t('time.placeholder')"
      />
      <div class="mt-2 flex items-center gap-2">
        <input
          v-model.number="startMs"
          type="number"
          :min="0"
          :max="maxMs"
          step="1"
          :aria-label="t('time.start') + ' (ms)'"
          class="field-input font-mono !w-32 !font-bold text-cut-start"
        />
        <span class="text-xs text-ink-muted">ms</span>
      </div>
      <div class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="d in nudges"
          :key="'s' + d"
          class="btn-history font-mono !text-[11px] !normal-case"
          @click="nudgeStart(d)"
        >
          {{ fmtDelta(d) }}ms
        </button>
      </div>
    </div>

    <div class="workspace-card p-4">
      <label class="caps-label mb-1.5 block">{{ t('time.end') }}</label>
      <input
        v-model="endText"
        class="field-input font-mono !w-full !text-lg !font-bold text-cut-end"
        inputmode="decimal"
        :placeholder="t('time.placeholder')"
      />
      <div class="mt-2 flex items-center gap-2">
        <input
          v-model.number="endMs"
          type="number"
          :min="0"
          :max="maxMs"
          step="1"
          :aria-label="t('time.end') + ' (ms)'"
          class="field-input font-mono !w-32 !font-bold text-cut-end"
        />
        <span class="text-xs text-ink-muted">ms</span>
      </div>
      <div class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="d in nudges"
          :key="'e' + d"
          class="btn-history font-mono !text-[11px] !normal-case"
          @click="nudgeEnd(d)"
        >
          {{ fmtDelta(d) }}ms
        </button>
      </div>
    </div>

    <div class="workspace-card flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:col-span-2">
      <span class="text-ink-soft">
        {{ t('time.selection') }} <span class="font-mono font-semibold text-ink">{{ formatMs(selectedDurationMs) }}</span>
        <span class="text-ink-muted"> / {{ formatMs(durationMs) }}</span>
      </span>
      <div class="flex items-center gap-3">
        <span v-if="!regionValidation.valid && regionValidation.errorCode" class="font-medium text-cut-start">
          {{ t(`validation.${regionValidation.errorCode}`) }}
        </span>
        <span v-else-if="regionValidation.valid" class="font-medium text-accent">{{ t('time.valid') }}</span>
        <button
          class="btn-history btn-reset"
          :disabled="!canReset"
          :title="t('time.reset')"
          @click="resetSelection"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v6h6M20 20v-6h-6" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M20 10a8 8 0 0 0-14.9-3M4 14a8 8 0 0 0 14.9 3" />
          </svg>
          {{ t('time.reset') }}
        </button>
      </div>
    </div>
  </div>
</template>
