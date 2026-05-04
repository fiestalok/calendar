<script setup>
import AppHeader from './components/AppHeader.vue'
</script>

<template>
  <div data-theme="light" class="min-h-screen bg-base-200">
    <AppHeader />
    <main class="container mx-auto px-4 py-6 max-w-7xl">
      <RouterView />
    </main>
  </div>
</template>
