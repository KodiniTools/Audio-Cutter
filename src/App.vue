<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
  <!-- Ziel der Modal-Teleports (eigener Stacking-Context über der SSI-Nav, siehe style.css) -->
  <div id="modal-portal"></div>
</template>
