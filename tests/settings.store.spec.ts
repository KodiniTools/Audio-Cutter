// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '../src/stores/settings'

const html = document.documentElement

/** MutationObserver-Callbacks laufen als Microtask. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('Settings-Store (Theme-Mechanik)', () => {
  beforeEach(() => {
    localStorage.clear()
    html.removeAttribute('data-theme')
    html.className = ''
    document.body.className = ''
    document.body.innerHTML = ''
    setActivePinia(createPinia())
  })

  afterEach(() => {
    useSettingsStore().stopListening()
  })

  it('startet ohne gespeicherte Wahl in Light und setzt alle drei Marker', () => {
    const store = useSettingsStore()
    expect(store.theme).toBe('light')
    expect(html.getAttribute('data-theme')).toBe('light')
    expect(document.body.classList.contains('light-theme')).toBe(true)
    expect(html.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('übernimmt die gespeicherte Wahl', () => {
    localStorage.setItem('theme', 'dark')
    const store = useSettingsStore()
    expect(store.theme).toBe('dark')
    expect(html.getAttribute('data-theme')).toBe('dark')
    expect(html.classList.contains('dark')).toBe(true)
    expect(document.body.classList.contains('light-theme')).toBe(false)
  })

  it('ignoriert ungültige gespeicherte Werte', () => {
    localStorage.setItem('theme', 'sepia')
    expect(useSettingsStore().theme).toBe('light')
  })

  it('toggleTheme schaltet Attribut, Klassen, Speicher und Nav-Icons', async () => {
    document.body.innerHTML = '<span class="global-nav-theme-icon"></span>'
    const store = useSettingsStore()
    store.toggleTheme()
    await nextTick()
    expect(html.getAttribute('data-theme')).toBe('dark')
    expect(html.classList.contains('dark')).toBe(true)
    expect(document.body.classList.contains('light-theme')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.querySelector('.global-nav-theme-icon')?.textContent).toBe('☀️')
  })

  it('übernimmt einen Theme-Wechsel der globalen Nav (data-theme) in den Store', async () => {
    const store = useSettingsStore()
    html.setAttribute('data-theme', 'dark') // wie applyTheme() der Nav
    await flush()
    expect(store.theme).toBe('dark')
    await nextTick()
    expect(document.body.classList.contains('light-theme')).toBe(false)
    expect(html.classList.contains('dark')).toBe(true)
  })

  it('reagiert nach stopListening nicht mehr auf das Attribut', async () => {
    const store = useSettingsStore()
    store.stopListening()
    html.setAttribute('data-theme', 'dark')
    await flush()
    expect(store.theme).toBe('light')
  })
})
