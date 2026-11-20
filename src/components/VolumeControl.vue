<script setup lang="ts">
// Lautstärke-Regler im Player-Bereich.
// Wirkt live auf die Wiedergabe (AudioCutterPage reicht `gain` an den Player
// weiter) und wird beim nächsten Schnitt in den Puffer übernommen.
// Hinweise (übernommen beim Schneiden / Übersteuerung) zeigt AudioCutterPage.
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'
import {
  gainToDb,
  VOLUME_DEFAULT_PERCENT,
  VOLUME_MAX_PERCENT,
  VOLUME_MIN_PERCENT,
} from '../utils/sliceBuffer'

const { t, locale } = useI18n({ useScope: 'global' })
const store = useAudioCutterStore()
const { volume, gain, clipping, busy } = storeToRefs(store)

const changed = computed(() => volume.value !== VOLUME_DEFAULT_PERCENT)

/** z. B. „+1,6 dB" (DE) bzw. „+1.6 dB" (EN); 0 % -> „−∞ dB". */
const dbLabel = computed(() => {
  const db = gainToDb(gain.value)
  if (!Number.isFinite(db)) return '−∞ dB'
  const rounded = Math.round(db * 10) / 10
  const abs = Math.abs(rounded).toLocaleString(locale.value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${abs} dB`
})

function onInput(e: Event): void {
  store.setVolume(Number((e.target as HTMLInputElement).value))
}

function resetVolume(): void {
  store.setVolume(VOLUME_DEFAULT_PERCENT)
}
</script>

<template>
  <div class="volume-control">
    <svg
      class="volume-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
      <path v-if="volume > 0" d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path v-if="volume > 100" d="M18.5 5.5a9 9 0 0 1 0 13" />
      <path v-if="volume === 0" d="m16 9 5 6m0-6-5 6" />
    </svg>
    <input
      id="ac-volume"
      class="volume-slider"
      type="range"
      :min="VOLUME_MIN_PERCENT"
      :max="VOLUME_MAX_PERCENT"
      step="1"
      :value="volume"
      :disabled="busy"
      :aria-label="t('volume.label')"
      :aria-valuetext="`${volume} % (${dbLabel})`"
      :title="t('volume.label')"
      @input="onInput"
    />
    <span class="volume-value" :class="{ 'is-clipping': clipping }">
      {{ volume }} %<span class="volume-db">{{ dbLabel }}</span>
    </span>
    <button
      class="volume-reset"
      :disabled="!changed || busy"
      :title="t('volume.reset')"
      :aria-label="t('volume.reset')"
      @click="resetVolume"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    </button>
  </div>
</template>
