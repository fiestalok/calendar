<script setup>
import { computed, onMounted } from 'vue'
import { useReservationsStore } from '../stores/reservations'

const store = useReservationsStore()

onMounted(() => {
  if (store.reservations.length === 0 && !store.loading) store.fetchReservations()
})

const today = new Date()
const currentMonth = today.getMonth()
const currentYear = today.getFullYear()

const dateLabel = computed(() =>
  today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
)

const thisMonthReservations = computed(() =>
  store.reservations.filter(r => {
    const d = new Date(r.date_start)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
)

const caThisMonth = computed(() =>
  thisMonthReservations.value
    .filter(r => r.status === 'devis_confirme' || r.status === 'terminee')
    .reduce((sum, r) => sum + (r.total_price || 0), 0)
)

const deliveriesThisMonth = computed(() =>
  thisMonthReservations.value.filter(r => r.delivery).length
)

const recentReservations = computed(() =>
  [...store.reservations]
    .sort((a, b) => new Date(b.date_start) - new Date(a.date_start))
    .slice(0, 6)
)

const STATUS = {
  en_attente:     { label: 'En attente',    cls: 'bg-amber-100 text-amber-800' },
  devis_realise:  { label: 'Devis réalisé', cls: 'bg-blue-100 text-blue-800' },
  devis_confirme: { label: 'Confirmé',      cls: 'bg-blue-100 text-blue-800' },
  terminee:       { label: 'Terminée',      cls: 'bg-gray-100 text-gray-600' },
  annulee:        { label: 'Annulée',       cls: 'bg-red-100 text-red-700' },
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatCurrency(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function clientName(r) {
  if (!r.client) return '—'
  return `${r.client.first_name ?? ''} ${r.client.last_name ?? ''}`.trim() || '—'
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Page header (white bar, Creatio style) ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
      <div>
        <h1 class="text-lg font-semibold text-gray-900">Tableau de bord</h1>
        <p class="text-xs text-gray-400 capitalize mt-0.5">{{ dateLabel }}</p>
      </div>
      <RouterLink
        to="/planning"
        class="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
          <path fill-rule="evenodd" d="M4 1.75a.75.75 0 0 1 1.5 0V3h5V1.75a.75.75 0 0 1 1.5 0V3h.25A2.75 2.75 0 0 1 15 5.75v7.5A2.75 2.75 0 0 1 12.25 16H3.75A2.75 2.75 0 0 1 1 13.25v-7.5A2.75 2.75 0 0 1 3.75 3H4V1.75ZM3.75 6.5c-.69 0-1.25.56-1.25 1.25v5.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25v-5.5c0-.69-.56-1.25-1.25-1.25H3.75Z" clip-rule="evenodd" />
        </svg>
        Voir le planning
      </RouterLink>
    </div>

    <!-- ── Scrollable content ── -->
    <div class="flex-1 overflow-y-auto bg-gray-100 p-6">

      <!-- KPI cards (Creatio style: flat colored, number large, label small below) -->
      <div class="grid grid-cols-4 gap-4 mb-6">

        <div class="rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[100px]" style="background:#1565c0;">
          <div class="text-3xl font-bold text-white leading-none">
            {{ store.loading ? '…' : thisMonthReservations.length }}
          </div>
          <div class="text-xs text-blue-200 mt-3 font-medium uppercase tracking-wide">Réservations ce mois</div>
        </div>

        <div class="rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[100px]" style="background:#e65100;">
          <div class="text-3xl font-bold text-white leading-none">
            {{ store.loading ? '…' : store.pendingCount }}
          </div>
          <div class="text-xs text-orange-200 mt-3 font-medium uppercase tracking-wide">En attente de validation</div>
        </div>

        <div class="rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[100px]" style="background:#1b5e20;">
          <div class="text-3xl font-bold text-white leading-none">
            {{ store.loading ? '…' : formatCurrency(caThisMonth) }}
          </div>
          <div class="text-xs text-green-200 mt-3 font-medium uppercase tracking-wide">CA confirmé du mois</div>
        </div>

        <div class="rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[100px]" style="background:#4a148c;">
          <div class="text-3xl font-bold text-white leading-none">
            {{ store.loading ? '…' : deliveriesThisMonth }}
          </div>
          <div class="text-xs text-blue-200 mt-3 font-medium uppercase tracking-wide">Livraisons planifiées</div>
        </div>

      </div>

      <!-- Recent reservations table -->
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">

        <div class="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <span class="text-[#e65100]">▲</span>
          <h2 class="text-sm font-semibold text-gray-800">Réservations récentes</h2>
        </div>

        <div v-if="store.loading" class="p-8 text-center text-sm text-gray-400">Chargement…</div>

        <div v-else-if="store.error" class="p-6 text-center text-red-500 text-sm">
          Connexion Directus indisponible — {{ store.error }}
        </div>

        <div v-else-if="recentReservations.length === 0" class="p-8 text-center text-sm text-gray-400">
          Aucune réservation
        </div>

        <table v-else class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
              <th class="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Client</th>
              <th class="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Début</th>
              <th class="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fin</th>
              <th class="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
              <th class="px-5 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="r in recentReservations" :key="r.id" class="hover:bg-gray-50 transition-colors cursor-default">
              <td class="px-5 py-3 font-medium text-gray-900">{{ clientName(r) }}</td>
              <td class="px-5 py-3 text-gray-500">{{ formatDate(r.date_start) }}</td>
              <td class="px-5 py-3 text-gray-500">{{ formatDate(r.date_end) }}</td>
              <td class="px-5 py-3">
                <span
                  class="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                  :class="STATUS[r.status]?.cls ?? 'bg-gray-100 text-gray-600'"
                >{{ STATUS[r.status]?.label ?? r.status }}</span>
              </td>
              <td class="px-5 py-3 text-right font-semibold text-gray-800">
                {{ r.total_price != null ? formatCurrency(r.total_price) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>
  </div>
</template>
