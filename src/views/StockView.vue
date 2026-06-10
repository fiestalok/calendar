<script setup>
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useStockStore } from '../stores/stock'

const store = useStockStore()
const { items: stock, loading, error } = storeToRefs(store)
onMounted(() => store.fetch())

const search = ref('')
const catFilter = ref('all')
const selectedId = ref(null)
const activeTab = ref('infos')

const categories = computed(() => [...new Set(stock.value.map(s => s.categorie).filter(Boolean))])

const filteredStock = computed(() => {
  let list = stock.value
  if (catFilter.value !== 'all') list = list.filter(s => s.categorie === catFilter.value)
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(s =>
      s.nom?.toLowerCase().includes(q) ||
      s.reference?.toLowerCase().includes(q) ||
      s.categorie?.toLowerCase().includes(q)
    )
  }
  return list
})

const selected = computed(() => stock.value.find(s => s.id === selectedId.value) ?? null)

function selectItem(item) {
  selectedId.value = item.id
  activeTab.value = 'infos'
}

function formatCurrency(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
}

function echeanceInfo(dateStr) {
  const d = daysUntil(dateStr)
  if (d < 0)  return { bg: '#b71c1c', label: 'Dépassée',   text: `Il y a ${Math.abs(d)} jour(s)` }
  if (d <= 7)  return { bg: '#c62828', label: 'Urgent',     text: `Dans ${d} jour(s)` }
  if (d <= 30) return { bg: '#e65100', label: 'Proche',     text: `Dans ${d} jours` }
  if (d <= 90) return { bg: '#f57f17', label: 'À planifier', text: `Dans ${d} jours` }
  return       { bg: '#2e7d32', label: 'Planifiée',    text: `Dans ${d} jours` }
}

const STATUT = {
  disponible:     { label: 'Disponible',    cls: 'bg-blue-100 text-blue-700' },
  en_location:    { label: 'En location',   cls: 'bg-blue-100 text-blue-700' },
  en_maintenance: { label: 'Maintenance',   cls: 'bg-amber-100 text-amber-700' },
  hors_service:   { label: 'Hors service',  cls: 'bg-red-100 text-red-700' },
}

const FACTURE_TYPE = {
  Achat:       'bg-blue-100 text-blue-700',
  Réparation:  'bg-orange-100 text-orange-700',
  Révision:    'bg-blue-100 text-blue-700',
  Remplacement:'bg-amber-100 text-amber-700',
}

const TABS = [
  { key: 'infos',    label: 'Informations' },
  { key: 'notes',    label: 'Notes' },
  { key: 'factures', label: 'Factures' },
  { key: 'echeance', label: 'Prochaine échéance' },
]
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Page header ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path d="M2 3a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2Z" />
        <path fill-rule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 0 1-1.99 1.79H4.802a2 2 0 0 1-1.99-1.79L2 7.5ZM7 11a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z" clip-rule="evenodd" />
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Stock</h1>
      <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{{ stock.length }} article(s)</span>
    </div>

    <!-- ── Master-detail ── -->
    <div class="flex flex-1 overflow-hidden">

      <!-- ── Left panel: list ── -->
      <div class="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">

        <!-- Search + category filter -->
        <div class="p-3 border-b border-gray-100">
          <div class="relative mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
                 class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              v-model="search"
              type="text"
              placeholder="Rechercher…"
              class="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-gray-50"
            />
          </div>

          <!-- Category filter pills -->
          <div class="flex flex-wrap gap-1">
            <button
              class="text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors"
              :class="catFilter === 'all' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="catFilter = 'all'"
            >Tous</button>
            <button
              v-for="cat in categories"
              :key="cat"
              class="text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors"
              :class="catFilter === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="catFilter = cat"
            >{{ cat }}</button>
          </div>
        </div>

        <!-- Stock list -->
        <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">Chargement…</div>
        <div v-else-if="error" class="flex-1 flex items-center justify-center px-4"><p class="text-sm text-red-500">{{ error }}</p></div>
        <div v-else class="flex-1 overflow-y-auto">
          <div
            v-for="item in filteredStock"
            :key="item.id"
            class="flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors border-l-[3px]"
            :class="selectedId === item.id ? 'bg-orange-50 border-l-orange-500' : 'border-l-transparent'"
            @click="selectItem(item)"
          >
            <!-- Category colored box -->
            <div class="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
                 :style="{background: {
                   Structures: '#f97316',
                   Mobilier: '#3b82f6',
                   'Audio/Vidéo': '#3b82f6',
                   Éclairage: '#f59e0b',
                   Vaisselle: '#3b82f6',
                 }[item.categorie] ?? '#6b7280'}">
              {{ item.nom[0] }}
            </div>

            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">{{ item.nom }}</div>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span class="text-[10px] font-mono text-gray-400">{{ item.reference }}</span>
                <span class="text-gray-300">·</span>
                <span class="text-[11px] text-gray-500">{{ item.quantite_disponible }}/{{ item.quantite_totale }} dispo</span>
              </div>
            </div>

            <!-- Status dot -->
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :class="{
                'bg-blue-400': item.statut === 'disponible',
                'bg-blue-400': item.statut === 'en_location',
                'bg-amber-400': item.statut === 'en_maintenance',
                'bg-red-400': item.statut === 'hors_service',
              }"
            />
          </div>

          <div v-if="filteredStock.length === 0" class="p-6 text-center text-sm text-gray-400">
            Aucun article trouvé
          </div>
        </div>
      </div>

      <!-- ── Right panel: detail ── -->
      <div class="flex-1 overflow-hidden flex flex-col bg-gray-100">

        <!-- Empty state -->
        <div v-if="!selected" class="flex-1 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-14 h-14 mx-auto mb-3 opacity-30">
              <path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
            <p class="text-sm">Sélectionnez un article</p>
          </div>
        </div>

        <template v-else>

          <!-- ── Detail header ── -->
          <div class="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">

            <!-- Breadcrumb -->
            <div class="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
              <span>Stock</span>
              <span>›</span>
              <span class="text-gray-700 font-medium">{{ selected.nom }}</span>
            </div>

            <div class="flex items-start gap-4">
              <!-- Category icon -->
              <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0 shadow-sm"
                   :style="{background: {
                     Structures: '#f97316', Mobilier: '#3b82f6', 'Audio/Vidéo': '#3b82f6',
                     Éclairage: '#f59e0b', Vaisselle: '#3b82f6',
                   }[selected.categorie] ?? '#6b7280'}">
                {{ selected.nom[0] }}
              </div>

              <div class="flex-1 min-w-0">
                <h2 class="text-xl font-bold text-gray-900 leading-tight">{{ selected.nom }}</h2>
                <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold border border-gray-200 bg-gray-50 text-gray-600">{{ selected.reference }}</span>
                  <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-orange-50 text-orange-700 border border-orange-100">{{ selected.categorie }}</span>
                  <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold" :class="STATUT[selected.statut]?.cls">{{ STATUT[selected.statut]?.label }}</span>
                </div>
              </div>

              <!-- KPI mini cards -->
              <div class="flex gap-3 flex-shrink-0">
                <div class="text-center px-4 py-2 rounded-xl" style="background:#1565c0;">
                  <div class="text-xl font-bold text-white leading-none">{{ selected.quantite_disponible }}<span class="text-sm font-normal text-blue-200">/{{ selected.quantite_totale }}</span></div>
                  <div class="text-[10px] text-blue-200 mt-1 font-medium uppercase tracking-wide">Disponibles</div>
                </div>
                <div class="text-center px-4 py-2 rounded-xl" style="background:#1b5e20;">
                  <div class="text-xl font-bold text-white leading-none">{{ formatCurrency(selected.prix_location) }}</div>
                  <div class="text-[10px] text-green-200 mt-1 font-medium uppercase tracking-wide">Prix location</div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Tabs (UPPERCASE style Creatio) ── -->
          <div class="bg-white border-b border-gray-200 px-6 flex-shrink-0">
            <div class="flex">
              <button
                v-for="t in TABS"
                :key="t.key"
                class="px-5 py-3 text-[13px] font-semibold border-b-2 transition-colors -mb-px uppercase tracking-wide"
                :class="activeTab === t.key
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'"
                @click="activeTab = t.key"
              >
                {{ t.label }}
                <!-- Urgency dot on "Prochaine échéance" -->
                <span
                  v-if="t.key === 'echeance' && selected.prochaine_echeance"
                  class="ml-1.5 w-1.5 h-1.5 rounded-full inline-block align-middle"
                  :class="daysUntil(selected.prochaine_echeance.date) <= 30 ? 'bg-red-500' : 'bg-amber-400'"
                />
              </button>
            </div>
          </div>

          <!-- ── Tab content ── -->
          <div class="flex-1 overflow-y-auto p-6">

            <!-- ── Informations ── -->
            <template v-if="activeTab === 'infos'">
              <div class="bg-white rounded-xl shadow-sm overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <span class="text-[#e65100]">▲</span>
                  <span class="text-sm font-semibold text-gray-700">Informations générales</span>
                </div>
                <div class="p-6 grid grid-cols-2 gap-x-10 gap-y-5">
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Référence</div>
                    <div class="text-gray-900 font-mono font-medium">{{ selected.reference }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Catégorie</div>
                    <div class="text-gray-900">{{ selected.categorie }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Quantité totale</div>
                    <div class="text-gray-900 font-semibold">{{ selected.quantite_totale }} unités</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Disponibles</div>
                    <div class="text-blue-700 font-semibold">{{ selected.quantite_disponible }} unités</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">En location</div>
                    <div class="text-blue-700 font-semibold">{{ selected.quantite_en_location }} unités</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Statut</div>
                    <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold" :class="STATUT[selected.statut]?.cls">{{ STATUT[selected.statut]?.label }}</span>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Prix de location</div>
                    <div class="text-gray-900 font-semibold">{{ formatCurrency(selected.prix_location) }} / unité</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Valeur d'achat unitaire</div>
                    <div class="text-gray-900">{{ formatCurrency(selected.valeur_achat) }}</div>
                  </div>
                  <div class="col-span-2">
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Description</div>
                    <div class="text-gray-700 text-sm leading-relaxed">{{ selected.description }}</div>
                  </div>
                </div>
              </div>
            </template>

            <!-- ── Notes ── -->
            <template v-if="activeTab === 'notes'">
              <div class="bg-white rounded-xl shadow-sm overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <span class="text-[#e65100]">▲</span>
                  <span class="text-sm font-semibold text-gray-700">Notes & consignes</span>
                </div>
                <div class="p-6">
                  <p v-if="selected.notes" class="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{{ selected.notes }}</p>
                  <p v-else class="text-sm text-gray-400 italic">Aucune note pour cet article.</p>
                </div>
              </div>
            </template>

            <!-- ── Factures ── -->
            <template v-if="activeTab === 'factures'">
              <div class="bg-white rounded-xl shadow-sm overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-[#e65100]">▲</span>
                    <span class="text-sm font-semibold text-gray-700">Factures & achats</span>
                  </div>
                  <span class="text-xs text-gray-400">{{ selected.factures?.length ?? 0 }} document(s)</span>
                </div>
                <table class="w-full text-sm">
                  <thead class="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">N°</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Fournisseur</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                      <th class="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Montant</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-50">
                    <tr v-for="f in selected.factures" :key="f.id" class="hover:bg-gray-50">
                      <td class="px-4 py-3 font-mono text-xs text-gray-500">{{ f.numero }}</td>
                      <td class="px-4 py-3 text-gray-500 whitespace-nowrap">{{ formatDate(f.date) }}</td>
                      <td class="px-4 py-3">
                        <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold" :class="FACTURE_TYPE[f.type] ?? 'bg-gray-100 text-gray-600'">{{ f.type }}</span>
                      </td>
                      <td class="px-4 py-3 text-gray-600">{{ f.fournisseur }}</td>
                      <td class="px-4 py-3 text-gray-700 text-xs">{{ f.description }}</td>
                      <td class="px-4 py-3 text-right font-semibold text-gray-800">{{ formatCurrency(f.montant) }}</td>
                    </tr>
                  </tbody>
                  <tfoot class="border-t border-gray-200 bg-gray-50">
                    <tr>
                      <td colspan="5" class="px-4 py-2.5 text-xs font-semibold text-gray-500 text-right uppercase tracking-wide">Total investi</td>
                      <td class="px-4 py-2.5 text-right font-bold text-gray-900">
                        {{ formatCurrency((selected.factures ?? []).reduce((s, f) => s + f.montant, 0)) }}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </template>

            <!-- ── Prochaine échéance ── -->
            <template v-if="activeTab === 'echeance'">

              <!-- No deadline -->
              <div v-if="!selected.prochaine_echeance" class="bg-white rounded-xl shadow-sm p-8 text-center">
                <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6 text-gray-400">
                    <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
                  </svg>
                </div>
                <p class="text-sm font-medium text-gray-600">Aucune échéance planifiée</p>
                <p class="text-xs text-gray-400 mt-1">Cet article ne nécessite pas de maintenance programmée actuellement.</p>
              </div>

              <!-- Has deadline -->
              <div v-else class="space-y-4">

                <!-- Urgency banner -->
                <div class="rounded-xl overflow-hidden shadow-sm">
                  <div class="px-6 py-4 text-white" :style="{ background: echeanceInfo(selected.prochaine_echeance.date).bg }">
                    <div class="flex items-center justify-between">
                      <div>
                        <div class="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">{{ echeanceInfo(selected.prochaine_echeance.date).label }}</div>
                        <div class="text-2xl font-bold leading-none">{{ echeanceInfo(selected.prochaine_echeance.date).text }}</div>
                      </div>
                      <div class="text-right opacity-80">
                        <div class="text-xs font-medium uppercase tracking-wide mb-1">Date prévue</div>
                        <div class="text-lg font-semibold">{{ formatDate(selected.prochaine_echeance.date) }}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Detail card -->
                <div class="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                    <span class="text-[#e65100]">▲</span>
                    <span class="text-sm font-semibold text-gray-700">Détail de l'échéance</span>
                  </div>
                  <div class="p-6 grid grid-cols-2 gap-x-10 gap-y-5">
                    <div>
                      <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Type</div>
                      <div class="text-gray-900 font-medium">{{ selected.prochaine_echeance.type }}</div>
                    </div>
                    <div>
                      <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Date planifiée</div>
                      <div class="text-gray-900">{{ formatDate(selected.prochaine_echeance.date) }}</div>
                    </div>
                    <div class="col-span-2">
                      <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Description</div>
                      <div class="text-gray-700 text-sm leading-relaxed bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                        {{ selected.prochaine_echeance.description }}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </template>

          </div>
        </template>
      </div>
    </div>
  </div>
</template>
