<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import heroImage from '../assets/audio-schneider-hero.webp'

// Aufbau und Maße wie die Landingpage des Playlist Generators
// (Hero zweispaltig, Funktionen als Panel-Band, zentrierte Sektionstitel).
// Styles: assets/kodini-stage1.css
const { locale, t } = useI18n()
const editorLink = computed(() => ({ name: 'cutter', query: { lang: locale.value } }))
const features = [0, 1, 2] as const
</script>

<template>
  <main class="cutter-landing">
    <section class="cutter-landing__hero">
      <div class="cutter-landing__container">
        <div class="cutter-landing__content">
          <p class="cutter-landing__category">{{ t('landing.category') }}</p>
          <h1>{{ t('app.title') }}</h1>
          <p class="cutter-landing__lead">{{ t('landing.description') }}</p>
          <div class="cutter-landing__actions">
            <RouterLink
              class="cutter-landing__button cutter-landing__button--primary"
              :to="editorLink"
            >
              {{ t('landing.open') }} →
            </RouterLink>
            <RouterLink
              class="cutter-landing__button"
              :to="{ name: 'landing', query: $route.query, hash: '#funktionen' }"
            >
              {{ t('landing.featuresLink') }}
            </RouterLink>
          </div>
          <ul class="cutter-landing__trust">
            <li>{{ t('landing.trust.0') }}</li>
            <li>{{ t('landing.trust.1') }}</li>
          </ul>
        </div>
        <figure class="cutter-landing__media">
          <img
            class="cutter-landing__image"
            :src="heroImage"
            :alt="t('landing.imageAlt')"
            width="1080"
            height="760"
            loading="eager"
            fetchpriority="high"
            decoding="async"
          />
        </figure>
      </div>
    </section>

    <section id="funktionen" class="cutter-landing__features" aria-labelledby="cutter-features">
      <div class="cutter-landing__container">
        <h2 id="cutter-features" class="cutter-landing__section-title">
          {{ t('landing.featureTitle') }}
        </h2>
        <div class="cutter-landing__cards">
          <article v-for="index in features" :key="index" class="cutter-landing__card">
            <span class="cutter-landing__icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <!-- Bereich wählen: Klammern um eine Auswahl -->
                <template v-if="index === 0">
                  <path d="M6 4H4v16h2" />
                  <path d="M18 4h2v16h-2" />
                  <path d="M9 12h6" />
                </template>
                <!-- Vorhören: Kopfhörer -->
                <template v-else-if="index === 1">
                  <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
                  <path d="M3 14h3v6H4a1 1 0 0 1-1-1z" />
                  <path d="M21 14h-3v6h2a1 1 0 0 0 1-1z" />
                </template>
                <!-- Exportieren: Download -->
                <template v-else>
                  <path d="M12 4v11" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 20h14" />
                </template>
              </svg>
            </span>
            <h3>{{ t(`landing.features.${index}.0`) }}</h3>
            <p>{{ t(`landing.features.${index}.1`) }}</p>
          </article>
        </div>
      </div>
    </section>

    <section class="cutter-landing__start" aria-labelledby="cutter-start">
      <div class="cutter-landing__container">
        <h2 id="cutter-start" class="cutter-landing__section-title">
          {{ t('landing.finalTitle') }}
        </h2>
        <p class="cutter-landing__section-lead">{{ t('landing.finalText') }}</p>
        <RouterLink class="cutter-landing__button cutter-landing__button--primary" :to="editorLink">
          {{ t('landing.open') }} →
        </RouterLink>
      </div>
    </section>
  </main>
</template>
