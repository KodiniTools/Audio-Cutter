<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

// Modifier-Anzeige plattformabhängig (macOS: ⌘, sonst Ctrl).
const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
const mod = isMac ? '⌘' : 'Ctrl'

/** Eine Zeile: mehrere Alternativ-Akkorde (chords); je Akkord Tasten mit „+“. */
interface Row {
  chords: string[][]
  desc: string
}
const rows = computed<Row[]>(() => [
  { chords: [['Space'], ['K']], desc: t('shortcuts.playPause') },
  { chords: [['Enter']], desc: t('shortcuts.preview') },
  { chords: [['Esc']], desc: t('shortcuts.stop') },
  { chords: [['Home']], desc: t('shortcuts.toStart') },
  { chords: [['End']], desc: t('shortcuts.toEnd') },
  { chords: [['←'], ['→']], desc: t('shortcuts.nudge') },
  { chords: [['S']], desc: t('shortcuts.setStart') },
  { chords: [['E']], desc: t('shortcuts.setEnd') },
  { chords: [['R']], desc: t('shortcuts.resetSelection') },
  { chords: [['+']], desc: t('shortcuts.zoomIn') },
  { chords: [['−']], desc: t('shortcuts.zoomOut') },
  { chords: [['0']], desc: t('shortcuts.zoomReset') },
  { chords: [['F']], desc: t('shortcuts.followMarker') },
  { chords: [[mod, 'Z']], desc: t('shortcuts.undo') },
  { chords: [[mod, 'Y'], [mod, '⇧', 'Z']], desc: t('shortcuts.redo') },
  { chords: [[mod, 'Enter']], desc: t('shortcuts.process') },
  { chords: [[mod, 'V']], desc: t('shortcuts.paste') },
  { chords: [['?']], desc: t('shortcuts.help') },
])
const touchRows = computed<string[]>(() => [
  t('shortcuts.touchTap'),
  t('shortcuts.touchDrag'),
  t('shortcuts.touchPinch'),
])
</script>

<template>
  <Teleport defer to="#modal-portal">
    <Transition name="help-fade">
      <div
        v-if="open"
        class="modal-overlay fixed inset-0 flex items-center justify-center p-5"
        role="dialog"
        aria-modal="true"
        :aria-label="t('shortcuts.title')"
        @click.self="emit('close')"
      >
        <div
          class="modal-content flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden"
        >
          <div class="modal-header flex items-center justify-between px-5 py-4">
            <h3 class="text-lg font-semibold text-ink">
              {{ t('shortcuts.title') }}
            </h3>
            <button
              class="close-btn"
              :aria-label="t('shortcuts.close')"
              @click="emit('close')"
            >
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                <path stroke-linecap="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div class="overflow-y-auto p-5">
            <div class="panel-section-title mb-2">
              {{ t('shortcuts.keyboard') }}
            </div>
            <ul class="flex flex-col divide-y divide-line">
              <li v-for="row in rows" :key="row.desc" class="flex items-center justify-between gap-4 py-1.5">
                <span class="text-sm text-ink-2">{{ row.desc }}</span>
                <span class="flex shrink-0 items-center gap-1">
                  <template v-for="(chord, ci) in row.chords" :key="ci">
                    <span v-if="ci > 0" class="text-xs text-ink-3">/</span>
                    <template v-for="(k, ki) in chord" :key="ki">
                      <span v-if="ki > 0" class="text-xs text-ink-3">+</span>
                      <kbd
                        class="inline-flex min-w-[1.6rem] items-center justify-center rounded-sm border border-line-strong border-b-2 bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold text-ink"
                        >{{ k }}</kbd
                      >
                    </template>
                  </template>
                </span>
              </li>
            </ul>

            <div class="panel-section-title mb-2 mt-5">
              {{ t('shortcuts.touch') }}
            </div>
            <ul class="flex flex-col gap-1.5">
              <li
                v-for="row in touchRows"
                :key="row"
                class="flex items-center gap-2 text-sm text-ink-2"
              >
                <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-ink-3" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 11V6a2 2 0 1 1 4 0v5m0-1a2 2 0 1 1 4 0v3a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-3a1.5 1.5 0 0 1 2.5-1.6L7 13" />
                </svg>
                {{ row }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.help-fade-enter-active,
.help-fade-leave-active {
  transition: opacity var(--ds-duration-slow) var(--ds-ease);
}
.help-fade-enter-from,
.help-fade-leave-to {
  opacity: 0;
}
</style>
