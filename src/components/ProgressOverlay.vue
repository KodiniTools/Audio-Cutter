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
  <Teleport defer to="#modal-portal">
    <Transition name="overlay-fade">
      <div
        v-if="visible"
        class="modal-overlay fixed inset-0 flex items-center justify-center p-5"
        role="dialog"
        aria-modal="true"
        :aria-label="t('overlay.title')"
      >
        <div
          class="modal-content w-full max-w-sm p-6"
        >
          <div class="flex items-baseline justify-between gap-4">
            <h3 class="text-lg font-semibold text-ink">{{ t('overlay.title') }}</h3>
            <span class="font-mono text-2xl font-bold tabular-nums text-ink-2"
              >{{ percent }}%</span
            >
          </div>

          <div class="mt-4 h-2.5 w-full overflow-hidden rounded-full border border-line bg-surface-2">
            <div
              class="h-full rounded-full bg-accent transition-[width]"
              :style="{ width: `${percent}%` }"
            ></div>
          </div>

          <p class="mt-3 text-xs text-ink-3">{{ t('overlay.hint') }}</p>

          <button
            class="export-btn export-btn-danger mt-5 w-full"
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
  transition: opacity var(--ds-duration-slow) var(--ds-ease);
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
