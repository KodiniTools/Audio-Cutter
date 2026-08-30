// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n, currentLocale, setLocale } from './i18n'
import { mountGlobalPartials } from './partials'
import './style.css'

// Erkannte Sprache <html lang> setzen UND in beide localStorage-Keys
// schreiben (still), damit die gleich eingehaengte globale Nav dieselbe
// Sprache anzeigt wie die App.
setLocale(currentLocale(), { silent: true })

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')

// Globale KodiniTools-Partials (Nav oben, Footer + Cookie-Banner unten)
// ausserhalb von #app einhaengen. Ihre Sprache/das Theme steuern sie selbst;
// der Locale-Bridge in ./i18n haelt beide Sprachumschalter synchron.
mountGlobalPartials()
