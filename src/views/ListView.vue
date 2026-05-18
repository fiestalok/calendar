<script setup>
import { computed, onMounted, ref } from 'vue'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useReservationsStore } from '../stores/reservations'
import StatusBadge from '../components/StatusBadge.vue'
import ReservationModal from '../components/ReservationModal.vue'

const store = useReservationsStore()
const selectedId = ref(null)

const selected = computed(() =>
  selectedId.value ? store.reservations.find(r => r.id === selectedId.value) : null
)

const fmtDate = (d) => d ? format(parseISO(d), 'd MMM yyyy', { locale: fr }) : '—'

const statusFilters = [
  { value: 'all', label: 'Tous' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'devis_realise', label: 'Devis réalisé' },
  { value: 'devis_confirme', label: 'Confirmés' },
  { value: 'terminee', label: 'Terminées' },
  { value: 'annulee', label: 'Annulées' }
]

onMounted(() => {
  if (!store.reservations.length) store.fetchReservations()
})
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <button
        v-for="f in statusFilters"
        :key="f.value"
        class="btn btn-sm"
        :class="store.filterStatus === f.value ? 'btn-primary' : 'btn-ghost'"
        @click="store.setFilter(f.value)"
      >
        {{ f.label }}
      </button>
    </div>

    <div v-if="store.loading" class="space-y-2">
      <div v-for="i in 6" :key="i" class="skeleton h-20 w-full rounded-box"></div>
    </div>

    <div v-else-if="store.error" class="alert alert-error">
      <span>{{ store.error }}</span>
    </div>

    <div v-else-if="!store.filteredReservations.length" class="py-20 text-center">
      <p class="text-5xl mb-4">🏰</p>
      <p class="text-base-content/50">Aucune réservation pour ce filtre</p>
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="r in store.filteredReservations"
        :key="r.id"
        class="card card-compact bg-base-100 shadow cursor-pointer hover:shadow-md transition-shadow"
        @click="selectedId = r.id"
      >
        <div class="card-body">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-semibold">
                {{ r.client?.first_name }} {{ r.client?.last_name }}
              </p>
              <p class="text-sm text-base-content/60">
                {{ fmtDate(r.date_start) }} → {{ fmtDate(r.date_end) }}
              </p>
            </div>
            <StatusBadge :status="r.status" />
          </div>
        </div>
      </div>
    </div>

    <ReservationModal :reservation="selected" @close="selectedId = null" />
  </div>
</template>
