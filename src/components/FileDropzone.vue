<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Datei-Eingabe in zwei Darstellungen:
 * - Standard: große gestrichelte Ablagefläche im Arbeitsbereich.
 * - compact:  Upload-Button (Sekundär) für die Sidebar.
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
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
    <svg class="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
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
/* Sidebar-Upload: Sekundär-Button (die Goldfläche gehört der Schnitt-Aktion). */
.upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: var(--ds-control-lg);
  padding: var(--ds-space-3) var(--ds-space-6);
  border: var(--ds-border-width) solid var(--ds-border-strong);
  border-radius: var(--ds-radius-md);
  background: var(--ds-surface-2);
  color: var(--ds-text);
  cursor: pointer;
  transition:
    background-color var(--ds-duration) var(--ds-ease),
    border-color var(--ds-duration) var(--ds-ease);
}

.upload-btn svg {
  width: var(--ds-icon-md);
  height: var(--ds-icon-md);
}

.upload-btn:hover {
  background: var(--ds-surface-3);
}

.upload-btn:focus-visible {
  outline: none;
  box-shadow: var(--ds-focus-ring);
}

.upload-btn.dragging {
  border-color: var(--ds-accent);
  background: var(--ds-accent-soft);
}

/* Ablagefläche: Panel-Fläche mit gestricheltem 1-px-Rahmen; beim Ziehen
   im Auswahl-Stil (accent-soft + Akzentrahmen). */
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 360px;
  padding: var(--ds-space-10);
  text-align: center;
  background: var(--ds-surface-1);
  border: var(--ds-border-width) dashed var(--ds-border-strong);
  border-radius: var(--ds-radius-lg);
  cursor: pointer;
  transition:
    background-color var(--ds-duration) var(--ds-ease),
    border-color var(--ds-duration) var(--ds-ease);
}

.dropzone:hover {
  background: var(--ds-surface-2);
}

.dropzone:focus-visible {
  outline: none;
  box-shadow: var(--ds-focus-ring);
}

.dropzone.dragging {
  border-color: var(--ds-accent);
  background: var(--ds-accent-soft);
}

.dropzone-icon {
  width: 32px;
  height: 32px;
  margin-bottom: var(--ds-space-4);
  color: var(--ds-text-3);
}

.dropzone-text {
  margin: 0 0 var(--ds-space-2);
  font-size: var(--ds-text-lg);
  font-weight: var(--ds-weight-medium);
  color: var(--ds-text);
}

/* Gold ist als Text im Light-Theme tabu -> Link-Farbe. */
.dropzone-link {
  color: var(--ds-link);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.dropzone-hint {
  margin: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-2);
}

.dropzone-hint + .dropzone-hint {
  margin-top: var(--ds-space-1);
}

@media (max-width: 480px) {
  .upload-btn {
    min-height: var(--ds-row-height);
  }

  .dropzone {
    min-height: 260px;
    padding: var(--ds-space-6);
  }
}
</style>
