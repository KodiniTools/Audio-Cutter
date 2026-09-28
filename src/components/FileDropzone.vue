<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Datei-Eingabe in zwei Darstellungen (Color-Extractor-Muster):
 * - Standard: große gestrichelte Ablagefläche im Arbeitsbereich.
 * - compact:  Akzent-Upload-Button für die Sidebar.
 * Beide emittieren `file` mit der gewählten/abgelegten Datei.
 */
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const { t } = useI18n({ useScope: 'global' })
const emit = defineEmits<{ (e: 'file', file: File): void }>()

const isOver = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

function pick(): void {
  inputRef.value?.click()
}

function onInput(e: Event): void {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (files && files[0]) emit('file', files[0])
  // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
  input.value = ''
}

function onDrop(e: DragEvent): void {
  isOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) emit('file', file)
}
</script>

<template>
  <button
    v-if="compact"
    type="button"
    class="upload-btn"
    :class="{ dragging: isOver }"
    :title="t('dropzone.browse')"
    :aria-label="t('dropzone.browse')"
    @click="pick"
    @dragover.prevent="isOver = true"
    @dragleave.prevent="isOver = false"
    @drop.prevent="onDrop"
  >
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  </button>

  <div
    v-else
    class="dropzone"
    :class="{ dragging: isOver }"
    role="button"
    tabindex="0"
    @click="pick"
    @keydown.enter.prevent="pick"
    @keydown.space.prevent="pick"
    @dragover.prevent="isOver = true"
    @dragleave.prevent="isOver = false"
    @drop.prevent="onDrop"
  >
    <svg class="dropzone-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
    <p class="dropzone-text">
      {{ t('dropzone.dragHint') }} <span class="dropzone-link">{{ t('dropzone.browse') }}</span>
    </p>
    <p class="dropzone-hint">{{ t('dropzone.paste') }}</p>
    <p class="dropzone-hint">{{ t('dropzone.formats') }}</p>
  </div>

  <!-- Ausserhalb von Button/Ablage: kein interaktives Element im <button>. -->
  <input ref="inputRef" type="file" accept="audio/*" class="hidden" @change="onInput" />
</template>

<style scoped>
/* Sidebar-Upload: identisch zum ImageUploader des Color Extractors. */
.upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 16px 24px;
  border: none;
  border-radius: 8px;
  background: var(--accent-bg);
  color: var(--accent-text);
  cursor: pointer;
  transition: all 0.2s ease;
}

.upload-btn:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
}

.upload-btn.dragging {
  background: var(--accent-hover);
  box-shadow: 0 0 0 3px var(--selection-glow);
}

/* Ablagefläche: Platzhalter-Container des Color Extractors. */
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 360px;
  padding: 40px;
  text-align: center;
  background: var(--bg-primary);
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition:
    background 0.3s ease,
    border-color 0.3s ease;
}

.dropzone:hover {
  border-color: var(--border-hover);
}

.dropzone:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--selection-glow);
}

.dropzone.dragging {
  border-color: var(--selection-color);
  border-width: 3px;
  background: var(--bg-hover);
}

.dropzone-icon {
  margin-bottom: 20px;
  color: var(--text-tertiary);
  transition: color 0.3s ease;
}

.dropzone-text {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: color 0.3s ease;
}

.dropzone-link {
  color: var(--accent-bg);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.dropzone-hint {
  margin: 0;
  font-size: 14px;
  color: var(--text-tertiary);
  transition: color 0.3s ease;
}

.dropzone-hint + .dropzone-hint {
  margin-top: 4px;
}

@media (max-width: 480px) {
  .upload-btn {
    padding: 14px 18px;
    min-height: 44px;
  }

  .dropzone {
    min-height: 260px;
    padding: 24px;
  }
}
</style>
