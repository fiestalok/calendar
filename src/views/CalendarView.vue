<script setup>
import { ref, computed, onMounted } from 'vue'
import { format, addMonths, subMonths } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useReservationsStore } from '../stores/reservations'
import CalendarGrid from '../components/CalendarGrid.vue'
import ReservationModal from '../components/ReservationModal.vue'

const store = useReservationsStore()
const current = ref(new Date())
const selectedId = ref(null)

const year = computed(() => current.value.getFullYear())
const month = computed(() => current.value.getMonth())
const title = computed(() => format(current.value, 'MMMM yyyy', { locale: fr }))

const selected = computed(() =>
  selectedId.value ? store.reservations.find(r => r.id === selectedId.value) : null
)

const statusFilters = [
  { value: 'all',          label: 'Tous' },
  { value: 'en_attente',   label: 'En attente' },
  { value: 'devis_realise', label: 'Devis réalisé' },
  { value: 'devis_confirme', label: 'Confirmés' },
  { value: 'terminee',     label: 'Terminées' },
  { value: 'annulee',      label: 'Annulées' },
]

// Couleurs en dur pour correspondre exactement aux classes de ReservationBadge
const STATUS_COLORS = {
  en_attente:     { bg: 'rgba(234,179,8,0.18)',   border: 'rgba(234,179,8,0.6)' },
  devis_realise:  { bg: 'rgba(14,165,233,0.18)',  border: 'rgba(14,165,233,0.6)' },
  devis_confirme: { bg: 'rgba(34,197,94,0.18)',   border: 'rgba(34,197,94,0.6)' },
  terminee:       { bg: 'rgba(115,115,115,0.18)', border: 'rgba(115,115,115,0.6)' },
  annulee:        { bg: 'rgba(239,68,68,0.18)',   border: 'rgba(239,68,68,0.6)' },
  blocage:        { bg: 'rgba(0,0,0,0.04)',        border: 'rgba(0,0,0,0.18)', dashed: true },
}

function legendStyle(key) {
  const c = STATUS_COLORS[key]
  return {
    backgroundColor: c.bg,
    borderColor: c.border,
    borderStyle: c.dashed ? 'dashed' : 'solid',
  }
}

function legendDot(statusValue) {
  const c = STATUS_COLORS[statusValue]
  if (!c) return {}
  return { backgroundColor: c.border }
}

const legend = [
  { label: 'En attente',         style: legendStyle('en_attente') },
  { label: 'Devis réalisé',      style: legendStyle('devis_realise') },
  { label: 'Confirmé',           style: legendStyle('devis_confirme') },
  { label: 'Terminé',            style: legendStyle('terminee') },
  { label: 'Annulé',             style: legendStyle('annulee') },
  { label: 'Blocage logistique', style: legendStyle('blocage') },
]

onMounted(() => store.fetchReservations())
</script>

<template>
  <div class="max-w-5xl mx-auto">

    <!-- ── Navigation mois ───────────────────────────────────────────────── -->
    <div class="flex items-center justify-between mb-4">
      <button class="btn btn-ghost btn-sm" @click="current = subMonths(current, 1)">‹ Préc.</button>
      <div class="flex items-center gap-3">
        <h2 class="text-xl font-bold capitalize">{{ title }}</h2>
        <button class="btn btn-ghost btn-xs" @click="current = new Date()">Aujourd'hui</button>
      </div>
      <button class="btn btn-ghost btn-sm" @click="current = addMonths(current, 1)">Suiv. ›</button>
    </div>

    <!-- ── Filtres centrés ───────────────────────────────────────────────── -->
    <div class="flex flex-wrap justify-center gap-2 mb-3">
      <button
        v-for="f in statusFilters"
        :key="f.value"
        class="btn btn-sm gap-1.5"
        :class="store.filterStatus === f.value ? 'btn-primary' : 'btn-ghost'"
        @click="store.setFilter(f.value)"
      >
        <span
          v-if="f.value !== 'all'"
          class="w-2 h-2 rounded-full shrink-0"
          :style="legendDot(f.value)"
        ></span>
        {{ f.label }}
        <span
          v-if="f.value === 'en_attente' && store.pendingCount > 0"
          class="badge badge-error badge-xs"
        >{{ store.pendingCount }}</span>
      </button>
    </div>

    <!-- ── Légende ───────────────────────────────────────────────────────── -->
    <div class="flex flex-wrap justify-center gap-x-5 gap-y-1.5 mb-5">
      <div v-for="l in legend" :key="l.label" class="flex items-center gap-1.5">
        <span
          class="inline-block h-3 w-8 rounded-sm border"
          :style="l.style"
        ></span>
        <span class="text-xs text-base-content/60">{{ l.label }}</span>
      </div>
    </div>

    <!-- ── Grille ────────────────────────────────────────────────────────── -->
    <div
      v-if="store.loading"
      class="grid grid-cols-7 gap-px bg-base-200 rounded-box overflow-hidden border border-base-200"
    >
      <div v-for="i in 35" :key="i" class="skeleton h-[90px] rounded-none"></div>
    </div>

    <div v-else-if="store.error" class="alert alert-error">
      <span>{{ store.error }}</span>
      <button class="btn btn-sm btn-ghost ml-auto" @click="store.fetchReservations()">Réessayer</button>
    </div>

    <CalendarGrid
      v-else
      :year="year"
      :month="month"
      :reservations="store.filteredReservations"
      @select-reservation="selectedId = $event"
    />

    <ReservationModal :reservation="selected" @close="selectedId = null" />
  </div>
</template>
