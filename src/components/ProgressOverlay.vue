<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useAudioCutterStore } from '../stores/audioCutter'

const { t } = useI18n({ useScope: 'global' })
const store = useAudioCutterStore()
const { status, progress } = storeToRefs(store)

const emit = defineEmits<{ (e: 'cancel'): void }>()

/** Overlay nur während des laufenden Schneideprozesses. */
const visible = computed(() => status.value === 'processing')
const percent = computed(() => Math.round(progress.value * 100))
</script>

<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        :aria-label="t('overlay.title')"
      >
        <div
          class="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
        >
          <div class="flex items-baseline justify-between gap-4">
            <h3 class="text-sm font-medium text-neutral-100">{{ t('overlay.title') }}</h3>
            <span class="font-mono text-2xl font-semibold tabular-nums text-emerald-400"
              >{{ percent }}%</span
            >
          </div>

          <div class="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              class="h-full rounded-full bg-emerald-500 transition-[width] duration-200 ease-out"
              :style="{ width: `${percent}%` }"
            ></div>
          </div>

          <p class="mt-3 text-xs text-neutral-500">{{ t('overlay.hint') }}</p>

          <button
            class="mt-5 w-full rounded-lg border border-neutral-600 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-red-500 hover:text-red-400"
            @click="emit('cancel')"
          >
            {{ t('export.cancel') }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.15s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
