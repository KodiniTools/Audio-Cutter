<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })
const emit = defineEmits<{ (e: 'file', file: File): void }>()

const isOver = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

function pick(): void {
  inputRef.value?.click()
}

function onInput(e: Event): void {
  const files = (e.target as HTMLInputElement).files
  if (files && files[0]) emit('file', files[0])
}

function onDrop(e: DragEvent): void {
  isOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) emit('file', file)
}
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors"
    :class="isOver ? 'border-emerald-400 bg-emerald-400/10 dark:bg-emerald-400/5' : 'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900/40'"
    role="button"
    tabindex="0"
    @click="pick"
    @keydown.enter.prevent="pick"
    @keydown.space.prevent="pick"
    @dragover.prevent="isOver = true"
    @dragleave.prevent="isOver = false"
    @drop.prevent="onDrop"
  >
    <svg class="h-10 w-10 text-neutral-400 dark:text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
    <p class="text-sm text-neutral-700 dark:text-neutral-300">
      {{ t('dropzone.dragHint') }} <span class="font-medium text-emerald-600 dark:text-emerald-400">{{ t('dropzone.browse') }}</span>
    </p>
    <p class="text-xs text-neutral-500">{{ t('dropzone.formats') }}</p>
    <input ref="inputRef" type="file" accept="audio/*" class="hidden" @change="onInput" />
  </div>
</template>
