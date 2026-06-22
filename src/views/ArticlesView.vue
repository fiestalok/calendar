<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useArticlesStore } from '../stores/articles'
import { useProduitsStore } from '../stores/produits'
import { getReservationsByArticle } from '../api/directus'
import AvailabilityCalendar from '../components/AvailabilityCalendar.vue'

const route = useRoute()
const articlesStore = useArticlesStore()
const produitsStore = useProduitsStore()
const { articles, loading, error } = storeToRefs(articlesStore)
onMounted(async () => {
  await Promise.all([articlesStore.fetch(), produitsStore.fetch()])
  if (route.query.search) {
    search.value = String(route.query.search)
    typeFilter.value = 'all'
  }
})

const search      = ref('')
const etatFilter  = ref('all')
const typeFilter  = ref('principal')
const selectedId  = ref(null)

const ETAT = {
  disponible:     { label: 'Disponible',   cls: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' },
  en_location:    { label: 'En location',  cls: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-400' },
  en_maintenance: { label: 'Maintenance',  cls: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-400' },
  hors_service:   { label: 'Hors service', cls: 'bg-red-100 text-red-700',         dot: 'bg-red-400' },
}

const filtered = computed(() => {
  let list = articles.value
  if (typeFilter.value !== 'all') list = list.filter(a => (a.type ?? 'principal') === typeFilter.value)
  if (etatFilter.value !== 'all') list = list.filter(a => a.etat === etatFilter.value)
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(a =>
      a.reference.toLowerCase().includes(q) ||
      a.produit_nom.toLowerCase().includes(q) ||
      a.entrepot_nom.toLowerCase().includes(q)
    )
  }
  return list
})

const selected = computed(() => articles.value.find(a => a.id === selectedId.value) ?? null)

const etatCounts = computed(() => {
  const counts = {}
  for (const a of articles.value) counts[a.etat] = (counts[a.etat] ?? 0) + 1
  return counts
})

// ── Disponibilités (après selected) ──────────────────────────────────────────
const reservations        = ref([])
const loadingReservations = ref(false)

watch(
  () => selected.value?.id,
  async (articleId) => {
    if (!articleId) { reservations.value = []; return }
    loadingReservations.value = true
    try {
      const raw = await getReservationsByArticle(articleId)
      reservations.value = (raw ?? [])
        .map(r => r.reservations_id)
        .filter(r => r?.date_start && r?.date_end && r.status !== 'annulee')
    } finally {
      loadingReservations.value = false
    }
  }
)

const selectedProduit = computed(() =>
  produitsStore.produits.find(p => p.id === selected.value?.produit_id)
)

const blockedRanges = computed(() => {
  const avant = selectedProduit.value?.jours_avant ?? 0
  const apres = selectedProduit.value?.jours_apres ?? 0
  return reservations.value.flatMap(r => {
    const ranges = []
    const start = new Date(r.date_start)
    const end   = new Date(r.date_end)
    const fmt   = d => d.toISOString().slice(0, 10)
    if (avant > 0) {
      const prepStart = new Date(start); prepStart.setDate(prepStart.getDate() - avant)
      const prepEnd   = new Date(start); prepEnd.setDate(prepEnd.getDate() - 1)
      ranges.push({ start: fmt(prepStart), end: fmt(prepEnd), type: 'prep' })
    }
    ranges.push({ start: fmt(start), end: fmt(end), type: 'reservation' })
    if (apres > 0) {
      const retourStart = new Date(end); retourStart.setDate(retourStart.getDate() + 1)
      const retourEnd   = new Date(end); retourEnd.setDate(retourEnd.getDate() + apres)
      ranges.push({ start: fmt(retourStart), end: fmt(retourEnd), type: 'retour' })
    }
    return ranges
  })
})

function formatCurrency(n) {
  if (!n) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Header ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path fill-rule="evenodd" d="M4 4a2 2 0 0 0-2 2v1h16V6a2 2 0 0 0-2-2H4Zm-2 5v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9H2Zm4 3a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Z" clip-rule="evenodd"/>
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Articles</h1>
      <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{{ filtered.length }} / {{ articles.length }}</span>
      <!-- Etat summary pills -->
      <div class="flex gap-1.5 ml-2">
        <span v-for="(count, etat) in etatCounts" :key="etat"
          class="text-[11px] px-2 py-0.5 rounded-full font-semibold" :class="ETAT[etat]?.cls">
          {{ count }} {{ ETAT[etat]?.label }}
        </span>
      </div>
    </div>

    <!-- ── Master-detail ── -->
    <div class="flex flex-1 overflow-hidden">

      <!-- ── Left panel ── -->
      <div class="w-[300px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">

        <div class="p-3 border-b border-gray-100 space-y-2">
          <div class="relative">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
                 class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>
            </svg>
            <input v-model="search" type="text" placeholder="Référence, produit, entrepôt…"
              class="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50"/>
          </div>
          <div class="flex flex-wrap gap-1">
            <button class="text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors"
              :class="etatFilter === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="etatFilter = 'all'">Tous états</button>
            <button v-for="(info, key) in ETAT" :key="key"
              class="text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors"
              :class="etatFilter === key ? info.cls : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="etatFilter = key">{{ info.label }}</button>
          </div>
          <div class="flex gap-1">
            <button class="text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors"
              :class="typeFilter === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="typeFilter = 'all'">Tous</button>
            <button class="text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors"
              :class="typeFilter === 'principal' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="typeFilter = 'principal'">Principal</button>
            <button class="text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors"
              :class="typeFilter === 'secondaire' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="typeFilter = 'secondaire'">Secondaire</button>
          </div>
        </div>

        <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">Chargement…</div>
        <div v-else-if="error" class="flex-1 flex items-center justify-center px-4"><p class="text-sm text-red-500">{{ error }}</p></div>
        <div v-else class="flex-1 overflow-y-auto">
          <div v-for="a in filtered" :key="a.id"
            class="flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors border-l-[3px]"
            :class="selectedId === a.id ? 'bg-orange-50 border-l-orange-500' : 'border-l-transparent'"
            @click="selectedId = a.id">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-gray-900">{{ a.name || a.reference }}</span>
                <span class="text-[10px] text-gray-400 font-mono">#{{ a.id }}</span>
                <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :class="ETAT[a.etat]?.dot"/>
                <span v-if="a.type === 'secondaire'" class="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">Secondaire</span>
              </div>
              <div class="text-[11px] text-gray-400 font-mono truncate mt-0.5">{{ a.reference }} · {{ a.produit_nom }}</div>
              <div class="text-[11px] text-gray-400 truncate">{{ a.entrepot_nom }}{{ a.emplacement ? ' · ' + a.emplacement : '' }}</div>
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0" :class="ETAT[a.etat]?.cls">
              {{ ETAT[a.etat]?.label }}
            </span>
          </div>
          <div v-if="filtered.length === 0" class="p-6 text-center text-sm text-gray-400">Aucun article trouvé</div>
        </div>
      </div>

      <!-- ── Right panel ── -->
      <div class="flex-1 overflow-y-auto bg-gray-50">

        <div v-if="!selected" class="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-12 h-12 opacity-30">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z"/>
          </svg>
          <p class="text-sm">Sélectionnez un article</p>
        </div>

        <div v-else class="p-6 max-w-2xl">

          <!-- Header card -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-4">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                <span class="text-orange-700 font-black text-lg font-mono">{{ selected.reference.slice(0, 2) }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="text-xl font-bold text-gray-900 font-mono">{{ selected.reference }}</h2>
                  <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold" :class="ETAT[selected.etat]?.cls">
                    {{ ETAT[selected.etat]?.label }}
                  </span>
                </div>
                <p class="text-sm text-gray-500 mt-1">{{ selected.produit_nom }}</p>
              </div>
            </div>
          </div>

          <!-- Info grid -->
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <div class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Entrepôt</div>
              <div class="text-sm font-semibold text-gray-900">{{ selected.entrepot_nom || '—' }}</div>
              <div class="text-xs text-gray-500 mt-0.5">{{ selected.emplacement || 'Emplacement non défini' }}</div>
            </div>
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <div class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Acquisition</div>
              <div class="text-sm font-semibold text-gray-900">{{ formatDate(selected.date_achat) }}</div>
              <div class="text-xs text-gray-500 mt-0.5">{{ formatCurrency(selected.valeur_achat) }}</div>
            </div>
          </div>

          <!-- Notes -->
          <div v-if="selected.notes" class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Notes</div>
            <p class="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{{ selected.notes }}</p>
          </div>

          <!-- Disponibilités -->
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="flex items-center gap-2 mb-3">
              <div class="text-xs text-gray-400 font-medium uppercase tracking-wide">Disponibilités</div>
              <span v-if="selectedProduit && (selectedProduit.jours_avant || selectedProduit.jours_apres)"
                class="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-medium">
                {{ selectedProduit.jours_avant }}j avant · {{ selectedProduit.jours_apres }}j après
              </span>
            </div>
            <AvailabilityCalendar :blocked-ranges="blockedRanges" :loading="loadingReservations" />
          </div>

        </div>
      </div>
    </div>
  </div>
</template>
