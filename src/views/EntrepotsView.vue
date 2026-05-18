<script setup>
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useEntrepotsStore } from '../stores/entrepots'

const store = useEntrepotsStore()
const { entrepots, loading, error } = storeToRefs(store)
onMounted(() => store.fetch())

const search = ref('')
const selectedId = ref(null)

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return entrepots.value
  return entrepots.value.filter(e =>
    e.nom?.toLowerCase().includes(q) ||
    e.ville?.toLowerCase().includes(q) ||
    e.responsable?.toLowerCase().includes(q)
  )
})

const selected = computed(() => entrepots.value.find(e => e.id === selectedId.value) ?? null)

function formatDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Page header ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path fill-rule="evenodd" d="M1 2.75A.75.75 0 0 1 1.75 2h16.5a.75.75 0 0 1 0 1.5H18v8.75A2.75 2.75 0 0 1 15.25 15h-1.072l.798 3.06a.75.75 0 0 1-1.452.39L13.41 18H6.59l-.114.45a.75.75 0 0 1-1.452-.39L5.823 15H4.75A2.75 2.75 0 0 1 2 12.25V3.5h-.25A.75.75 0 0 1 1 2.75ZM7.373 15l-.391 1.5h6.036l-.391-1.5H7.373Zm5.52-9.252a.75.75 0 1 0-1.06-1.06l-1.83 1.83-.97-.97a.75.75 0 0 0-1.06 0L6.22 8.28a.75.75 0 1 0 1.06 1.06l1.22-1.22.97.97a.75.75 0 0 0 1.06 0l2.363-2.349Z" clip-rule="evenodd"/>
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Entrepôts</h1>
      <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{{ entrepots.length }} entrepôts</span>
    </div>

    <!-- ── Master-detail ── -->
    <div class="flex flex-1 overflow-hidden">

      <!-- ── Left panel ── -->
      <div class="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">

        <div class="p-3 border-b border-gray-100">
          <div class="relative">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
                 class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input v-model="search" type="text" placeholder="Rechercher…"
              class="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent bg-gray-50" />
          </div>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div v-if="loading" class="flex items-center justify-center py-10 text-sm text-gray-400">Chargement…</div>
          <div v-else-if="error" class="p-4 text-sm text-red-500 text-center">{{ error }}</div>
          <div v-else-if="filtered.length === 0" class="p-6 text-center text-sm text-gray-400">Aucun résultat</div>
          <div
            v-else v-for="e in filtered" :key="e.id"
            @click="selectedId = e.id"
            class="flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-gray-100 transition-colors"
            :class="selectedId === e.id ? 'bg-slate-50 border-l-2 border-l-slate-500' : 'hover:bg-gray-50'"
          >
            <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                 style="background:#64748b;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-white">
                <path fill-rule="evenodd" d="M1 2.75A.75.75 0 0 1 1.75 2h16.5a.75.75 0 0 1 0 1.5H18v8.75A2.75 2.75 0 0 1 15.25 15h-1.072l.798 3.06a.75.75 0 0 1-1.452.39L13.41 18H6.59l-.114.45a.75.75 0 0 1-1.452-.39L5.823 15H4.75A2.75 2.75 0 0 1 2 12.25V3.5h-.25A.75.75 0 0 1 1 2.75Z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-gray-900 truncate">{{ e.nom }}</div>
              <div class="text-xs text-gray-500 truncate">{{ e.ville }} · {{ e.superficie }} m²</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Right panel ── -->
      <div class="flex-1 overflow-y-auto bg-gray-50">

        <!-- Empty state -->
        <div v-if="!selected" class="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-10 h-10 text-gray-300">
            <path fill-rule="evenodd" d="M1 2.75A.75.75 0 0 1 1.75 2h16.5a.75.75 0 0 1 0 1.5H18v8.75A2.75 2.75 0 0 1 15.25 15h-1.072l.798 3.06a.75.75 0 0 1-1.452.39L13.41 18H6.59l-.114.45a.75.75 0 0 1-1.452-.39L5.823 15H4.75A2.75 2.75 0 0 1 2 12.25V3.5h-.25A.75.75 0 0 1 1 2.75Z" clip-rule="evenodd"/>
          </svg>
          <p class="text-sm">Sélectionnez un entrepôt</p>
        </div>

        <!-- Detail -->
        <div v-else class="p-6 max-w-2xl">

          <!-- Header card -->
          <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-4 flex items-start gap-4">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow"
                 style="background:#64748b;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6 text-white">
                <path fill-rule="evenodd" d="M1 2.75A.75.75 0 0 1 1.75 2h16.5a.75.75 0 0 1 0 1.5H18v8.75A2.75 2.75 0 0 1 15.25 15h-1.072l.798 3.06a.75.75 0 0 1-1.452.39L13.41 18H6.59l-.114.45a.75.75 0 0 1-1.452-.39L5.823 15H4.75A2.75 2.75 0 0 1 2 12.25V3.5h-.25A.75.75 0 0 1 1 2.75Z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="text-xl font-bold text-gray-900">{{ selected.nom }}</h2>
              <p class="text-sm text-gray-500 mt-0.5">{{ selected.adresse }}, {{ selected.code_postal }} {{ selected.ville }}</p>
              <div class="flex items-center gap-3 mt-2">
                <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{{ selected.superficie }} m²</span>
                <span class="text-xs text-gray-400">Depuis le {{ formatDate(selected.created_at) }}</span>
              </div>
            </div>
          </div>

          <!-- Info grid -->
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <div class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Responsable</div>
              <div class="text-sm font-semibold text-gray-900">{{ selected.responsable }}</div>
            </div>
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <div class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Contact</div>
              <div class="text-sm font-semibold text-gray-900">{{ selected.telephone }}</div>
              <div class="text-xs text-gray-500 mt-0.5">{{ selected.email }}</div>
            </div>
          </div>

          <!-- Emplacements -->
          <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">Emplacements</div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="emp in selected.emplacements" :key="emp"
                class="text-xs bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium"
              >{{ emp }}</span>
            </div>
          </div>

          <!-- Notes -->
          <div v-if="selected.notes" class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Notes</div>
            <p class="text-sm text-gray-700 leading-relaxed">{{ selected.notes }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
