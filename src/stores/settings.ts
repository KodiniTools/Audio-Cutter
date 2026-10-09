import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * Startwert: gespeicherte Wahl, sonst das vom Inline-Skript in index.html vor
 * dem ersten Paint gesetzte data-theme, sonst Light (Standard wie im Collage Maker).
 */
function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isTheme(stored)) return stored
  } catch {
    // localStorage gesperrt (Privatmodus) -> Attribut/Standard
  }
  const attr = document.documentElement.getAttribute('data-theme')
  return isTheme(attr) ? attr : 'light'
}

/**
 * Theme-Mechanik (aus dem Collage Maker übernommen):
 * - html[data-theme] schaltet die Design-Tokens (--ds-*) und die SSI-Partials,
 * - body.light-theme hält Parität zum Playlist Generator,
 * - html.dark bleibt als Altbestand für externe Skripte erhalten.
 * Die globale Nav schaltet das Theme selbst über data-theme; ein
 * MutationObserver übernimmt diese Änderung in den Store.
 */
export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<Theme>(initialTheme())

  let themeObserver: MutationObserver | null = null
  let ignoreMutation = false

  function applyTheme(next: Theme): void {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Speichern optional
    }
    // MutationObserver unterdrücken, solange wir das Attribut selbst setzen.
    ignoreMutation = true
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.setAttribute('data-theme', next)
    document.body.classList.toggle('light-theme', next === 'light')
    ignoreMutation = false
    // Theme-Icons der SSI-Nav (Mond = nach Dark wechseln, Sonne = nach Light).
    document.querySelectorAll('.global-nav-theme-icon').forEach((icon) => {
      icon.textContent = next === 'light' ? '🌙' : '☀️'
    })
  }

  watch(theme, applyTheme, { immediate: true })

  function startListening(): void {
    if (themeObserver) return
    themeObserver = new MutationObserver((mutations) => {
      if (ignoreMutation) return
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-theme') {
          const next = document.documentElement.getAttribute('data-theme')
          if (isTheme(next) && next !== theme.value) theme.value = next
        }
      }
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
  }

  function stopListening(): void {
    themeObserver?.disconnect()
    themeObserver = null
  }

  startListening()

  function setTheme(next: Theme): void {
    theme.value = next
  }

  function toggleTheme(): void {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  return { theme, setTheme, toggleTheme, startListening, stopListening }
})
