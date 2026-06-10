<script setup>
import AppSidebar from '../components/AppSidebar.vue'
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-100">
    <AppSidebar />
    <main class="flex-1 overflow-y-auto p-6">
      <RouterView />
    </main>
  </div>
</template>
