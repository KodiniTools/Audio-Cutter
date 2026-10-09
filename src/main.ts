// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n, currentLocale, setLocale } from './i18n'
import { mountGlobalPartials } from './partials'
import { useSettingsStore } from './stores/settings'
import './style.css'

// Erkannte Sprache <html lang> setzen UND in beide localStorage-Keys
// schreiben (still), damit die gleich eingehaengte globale Nav dieselbe
// Sprache anzeigt wie die App.
setLocale(currentLocale(), { silent: true })

const pinia = createPinia()
createApp(App).use(pinia).use(router).use(i18n).mount('#app')

// Theme-Store vor den Partials starten: er schreibt localStorage.theme und
// setzt data-theme/body.light-theme, damit die globale Nav dasselbe Theme
// übernimmt und Theme-Wechsel der Nav im Store ankommen.
useSettingsStore(pinia)

// Globale KodiniTools-Partials (Nav oben, Footer + Cookie-Banner unten)
// ausserhalb von #app einhaengen. Ihre Sprache steuern sie selbst, das Theme
// gleicht der Settings-Store ab; der Locale-Bridge in ./i18n haelt beide
// Sprachumschalter synchron.
mountGlobalPartials()
