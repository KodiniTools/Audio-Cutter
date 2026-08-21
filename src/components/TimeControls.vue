<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'
import { formatMs, parseTimeToMs } from '../utils/audioMath'

const { t } = useI18n({ useScope: 'global' })
const store = useAudioCutterStore()
const { region, durationMs, selectedDurationMs, regionValidation } = storeToRefs(store)

const startText = computed({
  get: () => formatMs(region.value.startMs),
  set: (v: string) => {
    const ms = parseTimeToMs(v)
    if (ms !== null) store.setStart(ms)
  },
})
const endText = computed({
  get: () => formatMs(region.value.endMs),
  set: (v: string) => {
    const ms = parseTimeToMs(v)
    if (ms !== null) store.setEnd(ms)
  },
})

const nudges = [-100, -10, -1, 1, 10, 100]
function nudgeStart(delta: number): void {
  store.setStart(region.value.startMs + delta)
}
function nudgeEnd(delta: number): void {
  store.setEnd(region.value.endMs + delta)
}
function fmtDelta(d: number): string {
  return `${d > 0 ? '+' : ''}${d}`
}
</script>

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div class="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <label class="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">{{ t('time.start') }}</label>
      <input
        v-model="startText"
        class="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-lg text-emerald-300 outline-none focus:border-emerald-500"
        inputmode="decimal"
        :placeholder="t('time.placeholder')"
      />
      <div class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="d in nudges"
          :key="'s' + d"
          class="rounded border border-neutral-700 px-2 py-1 font-mono text-xs text-neutral-300 hover:border-emerald-500 hover:text-emerald-300"
          @click="nudgeStart(d)"
        >
          {{ fmtDelta(d) }}ms
        </button>
      </div>
    </div>

    <div class="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <label class="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">{{ t('time.end') }}</label>
      <input
        v-model="endText"
        class="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-lg text-emerald-300 outline-none focus:border-emerald-500"
        inputmode="decimal"
        :placeholder="t('time.placeholder')"
      />
      <div class="mt-2 flex flex-wrap gap-1">
        <button
          v-for="d in nudges"
          :key="'e' + d"
          class="rounded border border-neutral-700 px-2 py-1 font-mono text-xs text-neutral-300 hover:border-emerald-500 hover:text-emerald-300"
          @click="nudgeEnd(d)"
        >
          {{ fmtDelta(d) }}ms
        </button>
      </div>
    </div>

    <div class="sm:col-span-2 flex items-center justify-between rounded-lg bg-neutral-900/30 px-4 py-2 text-sm">
      <span class="text-neutral-400">
        {{ t('time.selection') }} <span class="font-mono text-neutral-100">{{ formatMs(selectedDurationMs) }}</span>
        <span class="text-neutral-500"> / {{ formatMs(durationMs) }}</span>
      </span>
      <span v-if="!regionValidation.valid && regionValidation.errorCode" class="font-medium text-amber-400">
        {{ t(`validation.${regionValidation.errorCode}`) }}
      </span>
      <span v-else-if="regionValidation.valid" class="text-emerald-400">{{ t('time.valid') }}</span>
    </div>
  </div>
</template>
