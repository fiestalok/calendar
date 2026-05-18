<script setup>
import AppSidebar from '../components/AppSidebar.vue'
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-100">
    <AppSidebar />
    <main class="flex-1 overflow-hidden">
      <RouterView />
    </main>
  </div>
</template>
