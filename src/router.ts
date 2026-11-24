// src/router.ts
import { createRouter, createWebHistory } from 'vue-router'
import LandingPage from './pages/LandingPage.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: LandingPage,
    },
    {
      path: '/app',
      name: 'cutter',
      component: () => import('./pages/AudioCutterPage.vue'),
    },
  ],
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash === '#funktionen' && to.name === 'landing') return { el: to.hash }
    if (to.name !== from.name) return { top: 0 }
    return false
  },
})

router.beforeEach((to) => {
  if (to.name === 'landing' && to.query.source != null) {
    return { name: 'cutter', query: to.query, hash: to.hash, replace: true }
  }
  return true
})
