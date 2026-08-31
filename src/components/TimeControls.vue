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
    <div class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
      <label class="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-400">{{ t('time.start') }}</label>
      <input
        v-model="startText"
        class="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-lg text-amber-600 outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-amber-400"
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
          class="w-32 rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-sm text-amber-600 outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-amber-400"
        />
        <span class="text-xs text-neutral-500">ms</span>
      </div>
      <div class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="d in nudges"
          :key="'s' + d"
          class="rounded border border-neutral-300 px-2 py-1 font-mono text-xs text-neutral-700 hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-emerald-300"
          @click="nudgeStart(d)"
        >
          {{ fmtDelta(d) }}ms
        </button>
      </div>
    </div>

    <div class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
      <label class="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-400">{{ t('time.end') }}</label>
      <input
        v-model="endText"
        class="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-lg text-red-600 outline-none focus:border-red-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-red-400"
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
          class="w-32 rounded-md border border-neutral-300 bg-white px-2 py-1 font-mono text-sm text-red-600 outline-none focus:border-red-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-red-400"
        />
        <span class="text-xs text-neutral-500">ms</span>
      </div>
      <div class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="d in nudges"
          :key="'e' + d"
          class="rounded border border-neutral-300 px-2 py-1 font-mono text-xs text-neutral-700 hover:border-emerald-500 hover:text-emerald-600 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-emerald-300"
          @click="nudgeEnd(d)"
        >
          {{ fmtDelta(d) }}ms
        </button>
      </div>
    </div>

    <div class="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-100 px-4 py-2 text-sm dark:bg-neutral-900/30">
      <span class="text-neutral-600 dark:text-neutral-400">
        {{ t('time.selection') }} <span class="font-mono text-neutral-900 dark:text-neutral-100">{{ formatMs(selectedDurationMs) }}</span>
        <span class="text-neutral-500"> / {{ formatMs(durationMs) }}</span>
      </span>
      <div class="flex items-center gap-3">
        <span v-if="!regionValidation.valid && regionValidation.errorCode" class="font-medium text-amber-600 dark:text-amber-400">
          {{ t(`validation.${regionValidation.errorCode}`) }}
        </span>
        <span v-else-if="regionValidation.valid" class="text-emerald-600 dark:text-emerald-400">{{ t('time.valid') }}</span>
        <button
          class="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-emerald-500 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:text-emerald-300 dark:disabled:hover:border-neutral-700 dark:disabled:hover:text-neutral-300"
          :disabled="!canReset"
          :title="t('time.reset')"
          @click="resetSelection"
        >
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v6h6M20 20v-6h-6" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M20 10a8 8 0 0 0-14.9-3M4 14a8 8 0 0 0 14.9 3" />
          </svg>
          {{ t('time.reset') }}
        </button>
      </div>
    </div>
  </div>
</template>
