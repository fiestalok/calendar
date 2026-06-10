<script setup>
import { ref, computed, onMounted } from 'vue'
import { getConsommables, createConsommable, patchConsommable, deleteConsommable } from '../api/directus'

const items   = ref([])
const loading = ref(false)
const search  = ref('')
const saving  = ref(false)
const toast   = ref(null)

// Réappro
const restockId  = ref(null)
const restockQty = ref(0)

// Création / édition
const showForm   = ref(false)
const editingId  = ref(null)
const form       = ref({ nom: '', unite: '', stock: 0, seuil_alerte: 5, prix_unitaire: '', description: '' })

onMounted(load)

async function load() {
  loading.value = true
  try { items.value = await getConsommables() }
  finally { loading.value = false }
}

const filtered = computed(() => {
  if (!search.value.trim()) return items.value
  const q = search.value.toLowerCase()
  return items.value.filter(c => c.nom?.toLowerCase().includes(q))
})

const alertCount = computed(() => items.value.filter(c => {
  const s = c.stock ?? 0
  const seuil = c.seuil_alerte ?? 5
  return s <= seuil
}).length)

function stockCls(c) {
  const s = c.stock ?? 0
  if (s <= 0) return 'text-error'
  if (s <= (c.seuil_alerte ?? 5)) return 'text-warning'
  return 'text-success'
}
function stockBg(c) {
  const s = c.stock ?? 0
  if (s <= 0) return 'bg-error/10 border-error/30'
  if (s <= (c.seuil_alerte ?? 5)) return 'bg-warning/10 border-warning/30'
  return 'bg-success/10 border-success/30'
}

async function quickUpdate(c, delta) {
  const next = Math.max(0, (c.stock ?? 0) + delta)
  await patchConsommable(c.id, { stock: next }).catch(() => {})
  c.stock = next
}

function openRestock(c) { restockId.value = c.id; restockQty.value = 0 }
async function saveRestock() {
  if (!restockId.value || restockQty.value <= 0) { restockId.value = null; return }
  saving.value = true
  try {
    const c = items.value.find(x => x.id === restockId.value)
    const next = (c?.stock ?? 0) + Number(restockQty.value)
    await patchConsommable(restockId.value, { stock: next })
    if (c) c.stock = next
    restockId.value = null
  } finally { saving.value = false }
}

async function updateSeuil(c, val) {
  const n = Number(val)
  if (isNaN(n) || n < 0) return
  await patchConsommable(c.id, { seuil_alerte: n }).catch(() => {})
  c.seuil_alerte = n
}

function openNew() {
  editingId.value = null
  form.value = { nom: '', unite: '', stock: 0, seuil_alerte: 5, prix_unitaire: '', description: '' }
  showForm.value = true
}
function openEdit(c) {
  editingId.value = c.id
  form.value = {
    nom:          c.nom ?? '',
    unite:        c.unite ?? '',
    stock:        c.stock ?? 0,
    seuil_alerte: c.seuil_alerte ?? 5,
    prix_unitaire: c.prix_unitaire ?? '',
    description:  c.description ?? '',
  }
  showForm.value = true
}

async function saveForm() {
  if (!form.value.nom.trim()) return
  saving.value = true
  try {
    const data = {
      nom:          form.value.nom.trim(),
      unite:        form.value.unite || null,
      stock:        Number(form.value.stock) || 0,
      seuil_alerte: Number(form.value.seuil_alerte) || null,
      prix_unitaire: form.value.prix_unitaire !== '' ? Number(form.value.prix_unitaire) : null,
      description:  form.value.description || null,
    }
    if (editingId.value) {
      await patchConsommable(editingId.value, data)
      const idx = items.value.findIndex(c => c.id === editingId.value)
      if (idx >= 0) items.value[idx] = { ...items.value[idx], ...data }
    } else {
      const created = await createConsommable(data)
      items.value.push(created)
    }
    showForm.value = false
    showToast(editingId.value ? 'Modifié' : 'Consommable créé', 'success')
  } catch (e) {
    showToast(e.message ?? 'Erreur', 'error')
  } finally {
    saving.value = false
  }
}

async function remove(c) {
  if (!confirm(`Supprimer "${c.nom}" ?`)) return
  await deleteConsommable(c.id).catch(() => {})
  items.value = items.value.filter(x => x.id !== c.id)
}

function showToast(msg, type = 'success') {
  toast.value = { msg, type }
  setTimeout(() => { toast.value = null }, 3000)
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- Header -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15H13.5v.25a2.25 2.25 0 0 1-2.25 2.25H8.75a2.25 2.25 0 0 1-2.25-2.25V15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Z"/>
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Consommables</h1>
      <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{{ items.length }}</span>
      <span v-if="alertCount" class="text-xs bg-error/15 text-error px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
          <path fill-rule="evenodd" d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 5Zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
        </svg>
        {{ alertCount }} stock bas
      </span>
      <div class="ml-auto">
        <button class="btn btn-sm btn-primary gap-1" @click="openNew">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
          </svg>
          Nouveau consommable
        </button>
      </div>
    </div>

    <!-- Search -->
    <div class="bg-white border-b border-gray-100 px-6 py-2 flex-shrink-0">
      <div class="relative max-w-xs">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
             class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>
        </svg>
        <input v-model="search" type="text" placeholder="Rechercher…"
          class="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"/>
      </div>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div v-if="loading" class="flex items-center justify-center h-32 text-sm text-gray-400">Chargement…</div>

      <div v-else class="space-y-2">
        <div v-for="c in filtered" :key="c.id"
          class="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-4 group">

          <!-- Infos -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold text-sm text-gray-900">{{ c.nom }}</span>
              <span v-if="c.unite" class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{{ c.unite }}</span>
            </div>
            <div class="text-xs text-gray-400 mt-0.5">
              <span v-if="c.prix_unitaire != null">{{ c.prix_unitaire }} €/unité</span>
              <span v-if="c.description" class="ml-2">· {{ c.description }}</span>
            </div>
          </div>

          <!-- Seuil alerte -->
          <div class="flex flex-col items-center gap-0.5">
            <span class="text-[10px] text-gray-400 font-medium">Seuil alerte</span>
            <input :value="c.seuil_alerte ?? 5" type="number" min="0"
              class="w-14 text-center text-xs border border-gray-200 rounded-lg px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              @change="updateSeuil(c, $event.target.value)" />
          </div>

          <!-- Stock indicator -->
          <div :class="['flex items-center gap-1 px-3 py-1.5 rounded-lg border font-bold text-sm min-w-[80px] justify-center', stockBg(c)]">
            <span :class="stockCls(c)">{{ c.stock ?? 0 }}</span>
            <span class="text-xs font-normal text-gray-400 ml-1">{{ c.unite ?? 'u.' }}</span>
          </div>

          <!-- +/- rapide -->
          <div class="flex items-center gap-1">
            <button class="btn btn-xs btn-ghost btn-circle" @click="quickUpdate(c, -1)" :disabled="(c.stock ?? 0) <= 0">−</button>
            <button class="btn btn-xs btn-ghost btn-circle" @click="quickUpdate(c, +1)">+</button>
          </div>

          <!-- Réappro -->
          <button class="btn btn-xs btn-primary gap-1" @click="openRestock(c)">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
              <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
            </svg>
            Réappro
          </button>

          <!-- Modifier / Supprimer -->
          <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button class="btn btn-xs btn-ghost" @click="openEdit(c)">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
              </svg>
            </button>
            <button class="btn btn-xs btn-ghost text-error" @click="remove(c)">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd"/>
              </svg>
            </button>
          </div>
        </div>

        <div v-if="filtered.length === 0 && !loading" class="text-center py-12 text-sm text-gray-400">
          Aucun consommable{{ search ? ' pour cette recherche' : '' }}
        </div>
      </div>
    </div>

    <!-- Modal réappro -->
    <div v-if="restockId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div class="bg-white rounded-2xl shadow-xl p-6 w-80">
        <h3 class="font-bold text-base mb-1">Réapprovisionnement</h3>
        <p class="text-sm text-gray-500 mb-4">
          {{ items.find(x => x.id === restockId)?.nom }} —
          stock actuel : <strong>{{ items.find(x => x.id === restockId)?.stock ?? 0 }}</strong>
          {{ items.find(x => x.id === restockId)?.unite ?? '' }}
        </p>
        <label class="block text-xs font-medium text-gray-500 mb-1.5">Quantité à ajouter</label>
        <input v-model.number="restockQty" type="number" min="1"
          class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 mb-4"
          placeholder="ex: 100" />
        <div class="flex gap-2 justify-end">
          <button class="btn btn-sm btn-ghost" @click="restockId = null">Annuler</button>
          <button class="btn btn-sm btn-primary" :disabled="saving || restockQty <= 0" @click="saveRestock">
            <span v-if="saving" class="loading loading-spinner loading-xs"></span>
            <span v-else>Ajouter {{ restockQty > 0 ? restockQty : '' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal création / édition -->
    <div v-if="showForm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div class="bg-white rounded-2xl shadow-xl p-6 w-[400px]">
        <h3 class="font-bold text-base mb-4">{{ editingId ? 'Modifier le consommable' : 'Nouveau consommable' }}</h3>
        <div class="space-y-3">
          <div>
            <label class="text-xs font-medium text-gray-600 mb-1 block">Nom <span class="text-red-500">*</span></label>
            <input v-model="form.nom" type="text" placeholder="Ex: Feuilles d'impression, Gel…"
              class="input input-bordered input-sm w-full" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-gray-600 mb-1 block">Unité</label>
              <input v-model="form.unite" type="text" placeholder="Ex: feuilles, litres, kg"
                class="input input-bordered input-sm w-full" />
            </div>
            <div>
              <label class="text-xs font-medium text-gray-600 mb-1 block">Prix unitaire (€)</label>
              <input v-model="form.prix_unitaire" type="number" min="0" step="0.01" placeholder="0.00"
                class="input input-bordered input-sm w-full" />
            </div>
            <div>
              <label class="text-xs font-medium text-gray-600 mb-1 block">Stock initial</label>
              <input v-model="form.stock" type="number" min="0"
                class="input input-bordered input-sm w-full" />
            </div>
            <div>
              <label class="text-xs font-medium text-gray-600 mb-1 block">Seuil alerte</label>
              <input v-model="form.seuil_alerte" type="number" min="0"
                class="input input-bordered input-sm w-full" />
            </div>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 mb-1 block">Description</label>
            <input v-model="form.description" type="text" placeholder="Optionnel…"
              class="input input-bordered input-sm w-full" />
          </div>
        </div>
        <div class="flex gap-2 justify-end mt-5">
          <button class="btn btn-sm btn-ghost" @click="showForm = false">Annuler</button>
          <button class="btn btn-sm btn-primary" :disabled="saving || !form.nom.trim()" @click="saveForm">
            <span v-if="saving" class="loading loading-spinner loading-xs"></span>
            <span v-else>Enregistrer</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-6 right-6 z-50">
      <div :class="['px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white',
        toast.type === 'error' ? 'bg-error' : 'bg-success']">
        {{ toast.msg }}
      </div>
    </div>

  </div>
</template>
