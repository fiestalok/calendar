<script setup>
import { computed } from 'vue'
import AppSidebar from '../components/AppSidebar.vue'
import NouveauDevis from '../components/NouveauDevis.vue'
import ReservationModal from '../components/ReservationModal.vue'
import { useNouveauDevisStore } from '../stores/nouveauDevis'
import { useReservationsStore } from '../stores/reservations'

// L'écran « Nouveau devis » s'ouvre depuis n'importe quelle page, puis laisse place à la réservation créée
const nouveauDevis = useNouveauDevisStore()
const reservations = useReservationsStore()
const reservationCreee = computed(() =>
  reservations.reservations.find(r => r.id === nouveauDevis.reservationId) ?? null
)
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-100">
    <AppSidebar />
    <main class="flex-1 overflow-y-auto p-6">
      <RouterView />
    </main>
    <NouveauDevis v-if="nouveauDevis.ouvert" />
    <ReservationModal :reservation="reservationCreee" @close="nouveauDevis.reservationId = null" />
  </div>
</template>
