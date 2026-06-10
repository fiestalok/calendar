<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useReservationsStore } from '../stores/reservations'

const store = useReservationsStore()
const route = useRoute()
const pendingCount = computed(() => store.pendingCount)
const logoSrc = import.meta.env.BASE_URL + 'Logo.png'
</script>

<template>
  <header class="navbar bg-base-100 shadow-sm sticky top-0 z-50 px-4">
    <div class="flex-1">
      <img :src="logoSrc" class="h-8 object-contain" alt="Fiestalok" />
    </div>
    <nav class="flex-none flex items-center gap-2">
      <RouterLink
        to="/calendar"
        class="btn btn-sm btn-ghost"
        :class="{ 'btn-active': route.path === '/calendar' }"
      >
        Calendrier
      </RouterLink>
      <RouterLink
        to="/list"
        class="btn btn-sm btn-ghost"
        :class="{ 'btn-active': route.path === '/list' }"
      >
        Liste
      </RouterLink>
      <span v-if="pendingCount > 0" class="badge badge-warning ml-2">
        {{ pendingCount }} en attente
      </span>
    </nav>
  </header>
</template>
