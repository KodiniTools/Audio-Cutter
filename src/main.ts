// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n, currentLocale } from './i18n'
import './style.css'

// <html lang> initial an die erkannte Sprache angleichen.
document.documentElement.lang = currentLocale()

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
