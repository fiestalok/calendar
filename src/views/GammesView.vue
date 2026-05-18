<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  getGammes, createGamme, patchGamme, deleteGamme,
  getConsommables, createConsommable, patchConsommable, deleteConsommable,
  getProduitGammes, createProduitGamme, deleteProduitGamme,
  getAllGammeArticlesMateriel, createGammeArticleMateriel, deleteGammeArticleMateriel,
  getProduits, getArticles,
} from '../api/directus'

// ── State ─────────────────────────────────────────────────────────────────
const gammes             = ref([])
const consommables       = ref([])   // all consommables
const produitGammes      = ref([])   // produits ↔ gammes junction
const gammeArts          = ref([])   // gamme_articles_materiel junction rows
const articlesSecondaires= ref([])   // articles with type='secondaire'
const produits           = ref([])   // for assignment
const loading            = ref(false)
const selectedId         = ref(null)
const toast              = ref(null)
const showMaterielPicker = ref(false)

// ── Gamme form ────────────────────────────────────────────────────────────
const gammeForm       = ref({ nom: '', description: '' })
const showGammeForm   = ref(false)
const editingGammeId  = ref(null)
const savingGamme     = ref(false)

// ── Consommable form ──────────────────────────────────────────────────────
const cForm       = ref({ type: 'consommable', nom: '', unite: '', quantite_defaut: 1, prix_unitaire: '', stock: 0 })
const showCForm   = ref(false)
const editingCId  = ref(null)
const savingC     = ref(false)
const cFormType   = ref('consommable')  // used to open form pre-typed

// ── Product assignment ────────────────────────────────────────────────────
const showProduitPicker = ref(false)

// ── Load ──────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  try {
    const [g, c, pg, ga, arts, p] = await Promise.all([
      getGammes(),
      getConsommables(),
      getProduitGammes(),
      getAllGammeArticlesMateriel(),
      getArticles({ filter: { type: { _eq: 'secondaire' } } }),
      getProduits(),
    ])
    gammes.value              = g ?? []
    consommables.value        = c ?? []
    produitGammes.value       = pg ?? []
    gammeArts.value           = ga ?? []
    articlesSecondaires.value = arts ?? []
    produits.value            = p ?? []
  } finally {
    loading.value = false
  }
}
onMounted(load)

// ── Derived ───────────────────────────────────────────────────────────────
const selected = computed(() => gammes.value.find(g => g.id === selectedId.value) ?? null)

const selectedConsommables = computed(() =>
  consommables.value.filter(c => c.gamme_id === selectedId.value)
)

const selectedGammeArts = computed(() =>
  gammeArts.value.filter(ga => ga.gamme_id === selectedId.value)
)

const selectedMaterielArticles = computed(() => {
  const ids = selectedGammeArts.value.map(ga => ga.article_id)
  return articlesSecondaires.value
    .filter(a => ids.includes(a.id))
    .map(a => ({ ...a, junctionId: selectedGammeArts.value.find(ga => ga.article_id === a.id)?.id }))
})

const unlinkedSecondaryArticles = computed(() => {
  const linkedIds = new Set(selectedGammeArts.value.map(ga => ga.article_id))
  return articlesSecondaires.value.filter(a => !linkedIds.has(a.id))
})

const selectedProduitIds = computed(() =>
  produitGammes.value.filter(pg => pg.gamme_id === selectedId.value).map(pg => pg.produit_id)
)

const selectedProduits = computed(() =>
  produits.value.filter(p => selectedProduitIds.value.includes(p.id))
)

const unassignedProduits = computed(() =>
  produits.value.filter(p => !selectedProduitIds.value.includes(p.id))
)

// ── Gamme CRUD ─────────────────────────────────────────────────────────────
function openNewGamme() {
  editingGammeId.value = null
  gammeForm.value = { nom: '', description: '' }
  showGammeForm.value = true
}

function openEditGamme(g) {
  editingGammeId.value = g.id
  gammeForm.value = { nom: g.nom, description: g.description ?? '' }
  showGammeForm.value = true
}

async function saveGamme() {
  if (!gammeForm.value.nom.trim()) return
  savingGamme.value = true
  try {
    const data = { nom: gammeForm.value.nom.trim(), description: gammeForm.value.description || null }
    if (editingGammeId.value) {
      const updated = await patchGamme(editingGammeId.value, data)
      const idx = gammes.value.findIndex(g => g.id === editingGammeId.value)
      if (idx >= 0) gammes.value[idx] = { ...gammes.value[idx], ...data }
    } else {
      const created = await createGamme(data)
      gammes.value.push(created)
      selectedId.value = created.id
    }
    showGammeForm.value = false
    showToast('Gamme sauvegardée', 'success')
  } catch (e) {
    showToast(e.message ?? 'Erreur', 'error')
  } finally {
    savingGamme.value = false
  }
}

async function removeGamme(g) {
  if (!confirm(`Supprimer la gamme "${g.nom}" et tous ses consommables ?`)) return
  try {
    await deleteGamme(g.id)
    gammes.value       = gammes.value.filter(x => x.id !== g.id)
    consommables.value = consommables.value.filter(c => c.gamme_id !== g.id)
    produitGammes.value= produitGammes.value.filter(pg => pg.gamme_id !== g.id)
    if (selectedId.value === g.id) selectedId.value = null
    showToast('Gamme supprimée', 'success')
  } catch (e) { showToast(e.message ?? 'Erreur', 'error') }
}

// ── Consommable CRUD ───────────────────────────────────────────────────────
function openNewConsommable(type = 'consommable') {
  editingCId.value = null
  cForm.value = { type, nom: '', unite: '', quantite_defaut: 1, prix_unitaire: '', stock: 0 }
  showCForm.value = true
}

function openEditConsommable(c) {
  editingCId.value = c.id
  cForm.value = {
    type: c.type ?? 'consommable',
    nom: c.nom, unite: c.unite ?? '',
    quantite_defaut: c.quantite_defaut ?? 1,
    prix_unitaire: c.prix_unitaire ?? '',
    stock: c.stock ?? 0,
  }
  showCForm.value = true
}

async function saveConsommable() {
  if (!cForm.value.nom.trim()) return
  savingC.value = true
  try {
    const data = {
      gamme_id: selectedId.value,
      type: cForm.value.type ?? 'consommable',
      nom: cForm.value.nom.trim(),
      unite: cForm.value.unite || null,
      quantite_defaut: cForm.value.quantite_defaut ? Number(cForm.value.quantite_defaut) : null,
      prix_unitaire: cForm.value.prix_unitaire !== '' ? Number(cForm.value.prix_unitaire) : null,
      stock: cForm.value.stock !== '' ? Number(cForm.value.stock) : 0,
    }
    if (editingCId.value) {
      await patchConsommable(editingCId.value, data)
      const idx = consommables.value.findIndex(c => c.id === editingCId.value)
      if (idx >= 0) consommables.value[idx] = { ...consommables.value[idx], ...data }
    } else {
      const created = await createConsommable(data)
      consommables.value.push(created)
    }
    showCForm.value = false
    showToast('Consommable sauvegardé', 'success')
  } catch (e) {
    showToast(e.message ?? 'Erreur', 'error')
  } finally {
    savingC.value = false
  }
}

async function removeConsommable(c) {
  if (!confirm(`Supprimer "${c.nom}" ?`)) return
  try {
    await deleteConsommable(c.id)
    consommables.value = consommables.value.filter(x => x.id !== c.id)
    showToast('Consommable supprimé', 'success')
  } catch (e) { showToast(e.message ?? 'Erreur', 'error') }
}

// ── Stock inline edit ──────────────────────────────────────────────────────
async function updateStock(c, delta) {
  const newStock = Math.max(0, (c.stock ?? 0) + delta)
  try {
    await patchConsommable(c.id, { stock: newStock })
    const idx = consommables.value.findIndex(x => x.id === c.id)
    if (idx >= 0) consommables.value[idx] = { ...consommables.value[idx], stock: newStock }
  } catch (e) { showToast(e.message ?? 'Erreur', 'error') }
}

// ── Matériel d'exploitation (articles secondaires) ────────────────────────
async function addMaterielArticle(article) {
  try {
    const created = await createGammeArticleMateriel({ gamme_id: selectedId.value, article_id: article.id })
    gammeArts.value.push(created)
    // Pas de fermeture — le picker reste ouvert pour ajouter plusieurs articles
    showToast(`${article.reference} ajouté`, 'success')
  } catch (e) { showToast(e.message ?? 'Erreur', 'error') }
}

async function removeMaterielArticle(junctionId) {
  try {
    await deleteGammeArticleMateriel(junctionId)
    gammeArts.value = gammeArts.value.filter(ga => ga.id !== junctionId)
  } catch (e) { showToast(e.message ?? 'Erreur', 'error') }
}

// ── Product assignment ─────────────────────────────────────────────────────
async function assignProduit(produit) {
  try {
    const created = await createProduitGamme({ produit_id: produit.id, gamme_id: selectedId.value })
    produitGammes.value.push(created)
    showProduitPicker.value = false
  } catch (e) { showToast(e.message ?? 'Erreur', 'error') }
}

async function unassignProduit(produitId) {
  const row = produitGammes.value.find(pg => pg.gamme_id === selectedId.value && pg.produit_id === produitId)
  if (!row) return
  try {
    await deleteProduitGamme(row.id)
    produitGammes.value = produitGammes.value.filter(pg => pg.id !== row.id)
  } catch (e) { showToast(e.message ?? 'Erreur', 'error') }
}

// ── Utils ──────────────────────────────────────────────────────────────────
function showToast(msg, type) {
  toast.value = { msg, type }
  setTimeout(() => { toast.value = null }, 3000)
}

function fmtPrix(v) {
  if (v == null || v === '') return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path d="M5.127 3.502 5.25 3.5h9.5c.041 0 .082 0 .123.002A2.251 2.251 0 0 0 12.75 2h-5.5a2.25 2.25 0 0 0-2.123 1.502ZM1 10.25A2.25 2.25 0 0 1 3.25 8h13.5A2.25 2.25 0 0 1 19 10.25v5.5A2.25 2.25 0 0 1 16.75 18H3.25A2.25 2.25 0 0 1 1 15.75v-5.5ZM3.25 6.5c-.04 0-.082 0-.123.002A2.25 2.25 0 0 1 5.25 5h9.5c.98 0 1.814.627 2.123 1.502a3.819 3.819 0 0 0-.123-.002H3.25Z"/>
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Gammes</h1>
      <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{{ gammes.length }}</span>
      <div class="ml-auto">
        <button class="btn btn-sm btn-primary gap-1" @click="openNewGamme">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
          </svg>
          Nouvelle gamme
        </button>
      </div>
    </div>

    <!-- ── Master-detail ──────────────────────────────────────────────────── -->
    <div class="flex flex-1 overflow-hidden">

      <!-- ── Left: liste gammes ──────────────────────────────────────────── -->
      <div class="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
        <div v-if="loading" class="flex justify-center py-8">
          <span class="loading loading-spinner loading-sm"></span>
        </div>
        <div v-else-if="!gammes.length" class="text-sm text-gray-400 text-center py-10 px-4">
          Aucune gamme.<br>Créez-en une pour commencer.
        </div>
        <div v-else class="p-2 space-y-1">
          <button
            v-for="g in gammes" :key="g.id"
            class="w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-2.5 group"
            :class="selectedId === g.id ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-gray-50 text-gray-700'"
            @click="selectedId = g.id; showCForm = false; showProduitPicker = false"
          >
            <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                 :class="selectedId === g.id ? 'bg-emerald-100' : 'bg-gray-100'">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5"
                   :class="selectedId === g.id ? 'text-emerald-600' : 'text-gray-400'">
                <path d="M5.127 3.502 5.25 3.5h9.5c.041 0 .082 0 .123.002A2.251 2.251 0 0 0 12.75 2h-5.5a2.25 2.25 0 0 0-2.123 1.502ZM1 10.25A2.25 2.25 0 0 1 3.25 8h13.5A2.25 2.25 0 0 1 19 10.25v5.5A2.25 2.25 0 0 1 16.75 18H3.25A2.25 2.25 0 0 1 1 15.75v-5.5ZM3.25 6.5c-.04 0-.082 0-.123.002A2.25 2.25 0 0 1 5.25 5h9.5c.98 0 1.814.627 2.123 1.502a3.819 3.819 0 0 0-.123-.002H3.25Z"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-sm truncate">{{ g.nom }}</p>
              <p class="text-xs text-gray-400 mt-0.5">
                {{ consommables.filter(c => c.gamme_id === g.id).length }} conso
                · {{ gammeArts.filter(ga => ga.gamme_id === g.id).length }} matériel
              </p>
            </div>
          </button>
        </div>
      </div>

      <!-- ── Right: détail gamme ─────────────────────────────────────────── -->
      <div class="flex-1 overflow-y-auto bg-gray-50">
        <div v-if="!selected" class="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-10 h-10 opacity-30">
            <path d="M5.127 3.502 5.25 3.5h9.5c.041 0 .082 0 .123.002A2.251 2.251 0 0 0 12.75 2h-5.5a2.25 2.25 0 0 0-2.123 1.502ZM1 10.25A2.25 2.25 0 0 1 3.25 8h13.5A2.25 2.25 0 0 1 19 10.25v5.5A2.25 2.25 0 0 1 16.75 18H3.25A2.25 2.25 0 0 1 1 15.75v-5.5ZM3.25 6.5c-.04 0-.082 0-.123.002A2.25 2.25 0 0 1 5.25 5h9.5c.98 0 1.814.627 2.123 1.502a3.819 3.819 0 0 0-.123-.002H3.25Z"/>
          </svg>
          <p class="text-sm">Sélectionnez une gamme</p>
        </div>

        <div v-else class="max-w-3xl mx-auto p-6 space-y-6">

          <!-- ── Titre gamme ── -->
          <div class="bg-white rounded-xl border border-gray-200 p-5">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <h2 class="text-xl font-bold text-gray-900">{{ selected.nom }}</h2>
                <p v-if="selected.description" class="text-sm text-gray-500 mt-1">{{ selected.description }}</p>
                <p v-else class="text-sm text-gray-400 italic mt-1">Pas de description</p>
              </div>
              <div class="flex gap-2 shrink-0">
                <button class="btn btn-sm btn-ghost gap-1" @click="openEditGamme(selected)">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474ZM4.75 3.5A2.25 2.25 0 0 0 2.5 5.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 14.5 13.25V10a.75.75 0 0 0-1.5 0v3.25c0 .414-.336.75-.75.75h-7.5a.75.75 0 0 1-.75-.75v-7.5c0-.414.336-.75.75-.75H7A.75.75 0 0 0 7 4H4.75Z"/></svg>
                  Modifier
                </button>
                <button class="btn btn-sm btn-error btn-outline gap-1" @click="removeGamme(selected)">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clip-rule="evenodd"/></svg>
                  Supprimer
                </button>
              </div>
            </div>
          </div>

          <!-- ── Composant réutilisable liste items ── -->
          <!-- Section Consommables -->
          <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div class="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <h3 class="font-semibold text-gray-800">Consommables</h3>
                <p class="text-xs text-gray-400 mt-0.5">Stock décrément définitif à la résa</p>
              </div>
              <button class="btn btn-xs btn-primary gap-1" @click="openNewConsommable('consommable')">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/></svg>
                Ajouter
              </button>
            </div>
            <div v-if="!selectedConsommables.length" class="text-sm text-gray-400 text-center py-6 italic">
              Aucun consommable dans cette gamme
            </div>
            <div v-else class="divide-y divide-gray-100">
              <div v-for="c in selectedConsommables" :key="c.id"
                class="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 group">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium text-sm text-gray-800">{{ c.nom }}</span>
                    <span v-if="c.unite" class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{{ c.unite }}</span>
                    <span v-if="c.prix_unitaire != null" class="text-xs text-emerald-600 font-medium">{{ fmtPrix(c.prix_unitaire) }}/unité</span>
                  </div>
                  <p class="text-xs text-gray-400 mt-0.5">Qté par défaut : <strong class="text-gray-600">{{ c.quantite_defaut ?? '—' }}</strong></p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <button class="btn btn-xs btn-ghost btn-circle" @click="updateStock(c, -1)" :disabled="(c.stock ?? 0) <= 0">−</button>
                  <span class="text-sm font-semibold w-8 text-center"
                    :class="(c.stock ?? 0) <= 0 ? 'text-error' : (c.stock ?? 0) <= 3 ? 'text-warning' : 'text-success'">{{ c.stock ?? 0 }}</span>
                  <button class="btn btn-xs btn-ghost btn-circle" @click="updateStock(c, +1)">+</button>
                  <span class="text-xs text-gray-400 ml-1">en stock</span>
                </div>
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button class="btn btn-xs btn-ghost" @click="openEditConsommable(c)">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/></svg>
                  </button>
                  <button class="btn btn-xs btn-ghost text-error" @click="removeConsommable(c)">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Section Matériel d'exploitation (articles secondaires) -->
          <div class="bg-white rounded-xl border border-amber-200 overflow-hidden">
            <div class="flex items-center justify-between px-5 py-3 border-b border-amber-100 bg-amber-50/40">
              <div>
                <h3 class="font-semibold text-gray-800">Matériel d'exploitation</h3>
                <p class="text-xs text-amber-700/70 mt-0.5">Articles secondaires — disponibilité via calendrier</p>
              </div>
              <button class="btn btn-xs gap-1"
                :class="showMaterielPicker ? 'btn-neutral' : 'btn-outline border-amber-300 text-amber-700 hover:bg-amber-50'"
                @click="showMaterielPicker = !showMaterielPicker; showCForm = false">
                <svg v-if="!showMaterielPicker" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/></svg>
                {{ showMaterielPicker ? 'Valider' : 'Ajouter du matériel' }}
              </button>
            </div>

            <div v-if="!selectedMaterielArticles.length && !showMaterielPicker"
              class="text-sm text-gray-400 text-center py-6 italic">
              Aucun article secondaire dans cette gamme
            </div>
            <div v-else-if="selectedMaterielArticles.length" class="divide-y divide-amber-50">
              <div v-for="art in selectedMaterielArticles" :key="art.id"
                class="flex items-center gap-3 px-5 py-3 hover:bg-amber-50/30 group">
                <div class="w-8 h-8 rounded-md bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0 text-amber-400 text-xs font-bold">
                  {{ art.reference?.slice(0, 2)?.toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-sm text-gray-800">{{ art.reference }}</span>
                    <span class="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">Secondaire</span>
                    <span class="text-xs px-1.5 py-0.5 rounded font-medium"
                      :class="art.etat === 'disponible' ? 'bg-emerald-100 text-emerald-700'
                        : art.etat === 'loue' ? 'bg-blue-100 text-blue-700'
                        : 'bg-red-100 text-red-700'">
                      {{ art.etat === 'disponible' ? 'Disponible' : art.etat === 'loue' ? 'Loué' : art.etat }}
                    </span>
                  </div>
                  <p class="text-xs text-gray-400 mt-0.5">{{ art.produit_id?.name ?? '—' }} · {{ art.entrepot_id?.nom ?? '—' }}</p>
                </div>
                <button class="btn btn-xs btn-ghost text-error opacity-0 group-hover:opacity-100 transition-opacity"
                  @click="removeMaterielArticle(art.junctionId)">Retirer</button>
              </div>
            </div>

            <!-- Picker articles secondaires (mode édition persistant) -->
            <div v-if="showMaterielPicker" class="border-t border-amber-100 bg-amber-50/20">
              <div class="px-3 pt-3 pb-1 flex items-center justify-between">
                <p class="text-xs text-gray-500 font-medium">Cliquez pour associer — le panneau reste ouvert</p>
              </div>
              <div v-if="!unlinkedSecondaryArticles.length" class="text-xs text-gray-400 italic text-center py-4 px-3">
                Tous les articles secondaires sont déjà associés à cette gamme.<br>
                <span class="text-amber-600">Créez des articles avec le type "Secondaire" dans la vue Articles.</span>
              </div>
              <div v-else class="space-y-0.5 max-h-56 overflow-y-auto px-2 pb-2">
                <button v-for="art in unlinkedSecondaryArticles" :key="art.id"
                  class="w-full text-left px-3 py-2.5 rounded-lg hover:bg-amber-100 active:bg-amber-200 text-sm flex items-center gap-3 transition-colors"
                  @click="addMaterielArticle(art)">
                  <div class="w-6 h-6 rounded bg-amber-200 flex items-center justify-center shrink-0 text-amber-700 text-[10px] font-bold">
                    {{ art.reference?.slice(0, 2)?.toUpperCase() }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <span class="font-medium">{{ art.reference }}</span>
                    <span class="text-gray-400 ml-2 text-xs">{{ art.produit_id?.name }}</span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="text-xs text-gray-400">{{ art.entrepot_id?.nom }}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-amber-500">
                      <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                    </svg>
                  </div>
                </button>
              </div>
              <div class="px-3 py-2 border-t border-amber-100 flex justify-end">
                <button class="btn btn-xs btn-neutral" @click="showMaterielPicker = false">Valider</button>
              </div>
            </div>
          </div>

          <!-- Formulaire consommable / matériel (partagé) -->
          <div v-if="showCForm" class="bg-white rounded-xl border-2 border-emerald-200 p-5 space-y-4">
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-emerald-700">
                {{ editingCId ? 'Modifier' : 'Ajouter' }} —
                <span v-if="cForm.type === 'materiel'">Matériel d'exploitation</span>
                <span v-else>Consommable</span>
              </p>
              <button class="btn btn-xs btn-ghost btn-circle" @click="showCForm = false">✕</button>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <label class="text-xs text-gray-600 mb-1 block">Nom <span class="text-red-500">*</span></label>
                <input v-model="cForm.nom" type="text"
                  :placeholder="cForm.type === 'materiel' ? 'Ex: Rallonge 25m, Multiprise, Générateur…' : 'Ex: Feuilles d\'impression, Gel…'"
                  class="input input-bordered input-sm w-full" />
              </div>
              <div>
                <label class="text-xs text-gray-600 mb-1 block">Unité</label>
                <input v-model="cForm.unite" type="text" placeholder="Ex: m, unités, rouleaux" class="input input-bordered input-sm w-full" />
              </div>
              <div>
                <label class="text-xs text-gray-600 mb-1 block">Quantité par défaut</label>
                <input v-model="cForm.quantite_defaut" type="number" min="0" class="input input-bordered input-sm w-full" />
              </div>
              <div>
                <label class="text-xs text-gray-600 mb-1 block">Prix unitaire (€)</label>
                <input v-model="cForm.prix_unitaire" type="number" min="0" step="0.01" placeholder="0.00" class="input input-bordered input-sm w-full" />
              </div>
              <div>
                <label class="text-xs text-gray-600 mb-1 block">
                  {{ cForm.type === 'materiel' ? 'Quantité disponible' : 'Stock initial' }}
                </label>
                <input v-model="cForm.stock" type="number" min="0" class="input input-bordered input-sm w-full" />
              </div>
            </div>
            <div class="flex gap-2 justify-end">
              <button class="btn btn-sm btn-ghost" @click="showCForm = false">Annuler</button>
              <button class="btn btn-sm btn-primary" :disabled="savingC || !cForm.nom.trim()" @click="saveConsommable">
                <span v-if="!savingC">Enregistrer</span>
                <span v-else class="loading loading-spinner loading-xs"></span>
              </button>
            </div>
          </div>

          <!-- ── Produits associés ── -->
          <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div class="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 class="font-semibold text-gray-800">Produits associés</h3>
              <button class="btn btn-xs btn-outline gap-1" @click="showProduitPicker = !showProduitPicker">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5"><path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/></svg>
                Associer un produit
              </button>
            </div>

            <div v-if="!selectedProduits.length && !showProduitPicker" class="text-sm text-gray-400 text-center py-6 italic">
              Aucun produit associé
            </div>
            <div v-else-if="selectedProduits.length" class="divide-y divide-gray-100">
              <div v-for="p in selectedProduits" :key="p.id"
                class="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 group">
                <div class="w-8 h-8 rounded-md bg-orange-50 flex items-center justify-center shrink-0">
                  <img v-if="p.images_urls?.[0]" :src="p.images_urls[0]" class="w-8 h-8 rounded-md object-cover" alt="" />
                  <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-orange-300">
                    <path d="M2 3a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2Z"/><path fill-rule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 0 1-1.99 1.79H4.802a2 2 0 0 1-1.99-1.79L2 7.5Z" clip-rule="evenodd"/>
                  </svg>
                </div>
                <span class="flex-1 text-sm font-medium text-gray-700 truncate">{{ p.name }}</span>
                <button class="btn btn-xs btn-ghost text-error opacity-0 group-hover:opacity-100 transition-opacity"
                  @click="unassignProduit(p.id)">Retirer</button>
              </div>
            </div>

            <!-- Picker produits -->
            <div v-if="showProduitPicker" class="border-t border-gray-100 p-3">
              <p class="text-xs text-gray-500 mb-2">Cliquez sur un produit pour l'associer :</p>
              <div v-if="!unassignedProduits.length" class="text-xs text-gray-400 italic">
                Tous les produits sont déjà associés à cette gamme.
              </div>
              <div v-else class="space-y-1 max-h-48 overflow-y-auto">
                <button v-for="p in unassignedProduits" :key="p.id"
                  class="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-sm flex items-center gap-2 transition-colors"
                  @click="assignProduit(p)">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-emerald-400 shrink-0">
                    <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                  </svg>
                  {{ p.name }}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- ── Modal gamme ─────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showGammeForm" class="modal modal-open">
        <div class="modal-box max-w-md">
          <h3 class="font-bold text-lg mb-4">{{ editingGammeId ? 'Modifier la gamme' : 'Nouvelle gamme' }}</h3>
          <div class="space-y-3">
            <div>
              <label class="text-sm font-medium mb-1 block">Nom <span class="text-red-500">*</span></label>
              <input v-model="gammeForm.nom" type="text" placeholder="Ex: Gamme Château, Gamme Photobooth…" class="input input-bordered w-full" />
            </div>
            <div>
              <label class="text-sm font-medium mb-1 block">Description</label>
              <textarea v-model="gammeForm.description" placeholder="Description optionnelle…" class="textarea textarea-bordered w-full resize-none" rows="3"></textarea>
            </div>
          </div>
          <div class="flex gap-2 justify-end mt-5">
            <button class="btn btn-ghost" @click="showGammeForm = false">Annuler</button>
            <button class="btn btn-primary" :disabled="savingGamme || !gammeForm.nom.trim()" @click="saveGamme">
              <span v-if="!savingGamme">Enregistrer</span>
              <span v-else class="loading loading-spinner loading-xs"></span>
            </button>
          </div>
        </div>
        <div class="modal-backdrop" @click="showGammeForm = false"></div>
      </div>
    </Teleport>

    <!-- ── Toast ──────────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="toast" class="toast toast-end z-[200]">
        <div class="alert text-sm" :class="toast.type === 'success' ? 'alert-success' : 'alert-error'">
          {{ toast.msg }}
        </div>
      </div>
    </Teleport>

  </div>
</template>
