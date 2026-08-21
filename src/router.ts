// src/router.ts
import { createRouter, createWebHistory } from 'vue-router'
import AudioCutterPage from './pages/AudioCutterPage.vue'

export const router = createRouter({
  // base an das Subdir anpassen (siehe vite.config.ts base).
  history: createWebHistory('/audio-cutter/'),
  routes: [{ path: '/', name: 'cutter', component: AudioCutterPage }],
})
