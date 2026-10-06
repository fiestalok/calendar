<script setup>
import { ref, computed, onMounted } from 'vue'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useReservationsStore } from '../stores/reservations'
import { useNouveauDevisStore } from '../stores/nouveauDevis'
import { nomFiche } from '../utils/clients'
import { joursLocation } from '../utils/tarifs'
import ReservationModal from '../components/ReservationModal.vue'
import StatusBadge from '../components/StatusBadge.vue'

const store = useReservationsStore()
const nouveauDevis = useNouveauDevisStore()

onMounted(() => store.fetchReservations())

// Le chargement n'est signalé qu'à la première ouverture : ensuite la liste se met à jour sur place
const chargement = computed(() => store.loading && !store.reservations.length)

// ── Modal de détail ──────────────────────────────────────────────────────────
const selectedId = ref(null)
const selectedReservation = computed(() =>
  store.reservations.find(r => r.id === selectedId.value) ?? null
)

// ── Filtres ──────────────────────────────────────────────────────────────────
const STATUS_TABS = [
  { key: 'all',            label: 'Tout' },
  { key: 'en_attente',     label: 'En attente' },
  { key: 'devis_realise',  label: 'Devis réalisé' },
  { key: 'devis_confirme', label: 'Devis confirmé' },
  { key: 'terminee',       label: 'Terminée' },
  { key: 'annulee',        label: 'Annulée' },
]
const filterStatus = ref('all')
const search = ref('')

const compte = computed(() => {
  const parStatut = { all: store.reservations.length }
  for (const r of store.reservations) parStatut[r.status] = (parStatut[r.status] ?? 0) + 1
  return parStatut
})

const sansAccent = (s) => (s ?? '').toString().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const produits = (r) => (r.lignes ?? [])
  .map(l => l.produits_id?.name && ((l.quantity || 1) > 1 ? `${l.produits_id.name} × ${l.quantity}` : l.produits_id.name))
  .filter(Boolean).join(', ')

// Réservations du statut choisi qui correspondent à la recherche, de la plus récente à la plus ancienne
const filteredList = computed(() => {
  const q = sansAccent(search.value).trim()
  return store.reservations
    .filter(r => filterStatus.value === 'all' || r.status === filterStatus.value)
    .filter(r => !q || sansAccent(
      [`n°${r.id}`, nomFiche(r.client), r.client?.company_name, r.client?.city, produits(r)].filter(Boolean).join(' ')
    ).includes(q))
    .sort((a, b) => (b.date_start ?? '').localeCompare(a.date_start ?? ''))
})

const jour = (iso, motif) => format(parseISO(iso), motif, { locale: fr })
const periode = (r) => {
  if (!r.date_start) return '—'
  const jours = joursLocation(r.date_start, r.date_end)
  return jours > 1
    ? `${jour(r.date_start, 'd MMM')} → ${jour(r.date_end, 'd MMM yyyy')} · ${jours} jours`
    : jour(r.date_start, 'd MMM yyyy')
}

function formatCurrency(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Page header ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path fill-rule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 15h-1.5l.5 2.75a.75.75 0 0 1-1.47.26L12.38 15H7.62l-.4 2.01a.75.75 0 0 1-1.47-.26L6.25 15h-1.5A2.75 2.75 0 0 1 2 12.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v3.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-3.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clip-rule="evenodd"/>
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Réservations</h1>
      <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{{ store.reservations.length }}</span>
      <button type="button"
        class="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
        @click="nouveauDevis.ouvrir()">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
        </svg>
        Nouveau devis
      </button>
    </div>

    <!-- ── Scrollable content ── -->
    <div class="flex-1 overflow-y-auto bg-gray-100 p-6">

      <!-- Filtre par statut + recherche -->
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <button
          v-for="tab in STATUS_TABS"
          :key="tab.key"
          type="button"
          class="text-xs py-1.5 px-3 rounded-lg font-semibold transition-colors"
          :class="filterStatus === tab.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'"
          @click="filterStatus = tab.key"
        >{{ tab.label }} <span class="font-normal opacity-70">{{ compte[tab.key] ?? 0 }}</span></button>
        <div class="relative ml-auto w-72 max-w-full">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
            class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <path fill-rule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clip-rule="evenodd"/>
          </svg>
          <input v-model="search" type="text" placeholder="Client, produit ou n° de réservation" aria-label="Rechercher une réservation"
            class="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
      </div>

      <!-- Liste -->
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">

        <div v-if="chargement" class="p-8 text-center text-sm text-gray-400">Chargement…</div>

        <div v-else-if="store.error" class="p-6 text-center text-red-500 text-sm">
          Connexion Directus indisponible — {{ store.error }}
        </div>

        <div v-else-if="!filteredList.length" class="p-8 text-center text-sm text-gray-400">
          Aucune réservation{{ search.trim() ? ' pour cette recherche' : filterStatus !== 'all' ? ' pour ce statut' : '' }}
        </div>

        <table v-else class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
              <th class="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Client</th>
              <th class="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Période</th>
              <th class="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Produits</th>
              <th class="px-5 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
              <th class="px-5 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr
              v-for="r in filteredList"
              :key="r.id"
              class="hover:bg-gray-50 transition-colors cursor-pointer"
              @click="selectedId = r.id"
            >
              <td class="px-5 py-3">
                <div class="font-medium text-gray-900">{{ nomFiche(r.client) }}</div>
                <div class="text-xs text-gray-400">n°{{ r.id }}<template v-if="r.client?.city"> · {{ r.client.city }}</template></div>
              </td>
              <td class="px-5 py-3 text-gray-500 whitespace-nowrap">{{ periode(r) }}</td>
              <td class="px-5 py-3 text-xs text-gray-500">
                <template v-if="produits(r)">{{ produits(r) }}</template>
                <span v-else class="text-gray-300 italic">Aucun produit</span>
              </td>
              <td class="px-5 py-3"><StatusBadge :status="r.status" /></td>
              <td class="px-5 py-3 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                {{ r.montant ? formatCurrency(r.montant) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>

    <!-- ── Modal de détail ── -->
    <ReservationModal
      :reservation="selectedReservation"
      @close="selectedId = null"
    />
  </div>
</template>
