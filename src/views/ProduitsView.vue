<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useProduitsStore } from '../stores/produits'
import { useArticlesStore } from '../stores/articles'
import { useEntrepotsStore } from '../stores/entrepots'
import { getProductImages, addProductImage, removeProductImage, uploadFile, assetUrl, getReservationsByProduit } from '../api/directus'

const router         = useRouter()
const produitsStore  = useProduitsStore()
const articlesStore  = useArticlesStore()
const entrepotsStore = useEntrepotsStore()
const { produits, loading, error } = storeToRefs(produitsStore)
const { articles } = storeToRefs(articlesStore)
const { entrepots } = storeToRefs(entrepotsStore)
onMounted(() => { produitsStore.fetch(); articlesStore.fetch(); entrepotsStore.fetch() })

const search     = ref('')
const catFilter  = ref('all')
const selectedId = ref(null)
const activeTab  = ref('infos')

const ETAT = {
  disponible:     { label: 'Disponible',   cls: 'bg-blue-100 text-blue-700' },
  en_location:    { label: 'En location',  cls: 'bg-blue-100 text-blue-700' },
  en_maintenance: { label: 'Maintenance',  cls: 'bg-amber-100 text-amber-700' },
  hors_service:   { label: 'Hors service', cls: 'bg-red-100 text-red-700' },
}

const CAT_COLORS = {
  Structures: '#f97316', Mobilier: '#3b82f6', 'Audio/Vidéo': '#3b82f6',
  Éclairage: '#f59e0b', Vaisselle: '#3b82f6',
}

const categories = computed(() => [...new Set(produits.value.map(p => p.categorie).filter(Boolean))])

const filtered = computed(() => {
  let list = produits.value
  if (catFilter.value !== 'all') list = list.filter(p => p.categorie === catFilter.value)
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(p => p.nom.toLowerCase().includes(q) || p.categorie?.toLowerCase().includes(q))
  }
  return list
})

const selected = computed(() => produits.value.find(p => p.id === selectedId.value) ?? null)

const selectedArticles = computed(() =>
  articles.value.filter(a => a.produit_id === selectedId.value)
)

const dispoCount = computed(() =>
  selectedArticles.value.filter(a => a.etat === 'disponible').length
)

function selectItem(p) {
  selectedId.value = p.id
  activeTab.value = 'infos'
  showAddForm.value = false
  productImages.value = []
}

// ── Photos ────────────────────────────────────────────────────────────────────
const productImages  = ref([])
const photosLoading  = ref(false)
const photoUploading = ref(false)
const photoInput     = ref(null)
const photoToast     = ref(null)

watch(activeTab, (tab) => {
  if (tab === 'infos' && selectedId.value) { loadPhotos(); loadCalResas() }
})

async function loadPhotos() {
  photosLoading.value = true
  try { productImages.value = await getProductImages(selectedId.value) }
  catch { productImages.value = [] }
  finally { photosLoading.value = false }
}

async function onPhotoFiles(e) {
  const files = [...(e.target?.files ?? e.dataTransfer?.files ?? [])]
  if (!files.length) return
  photoUploading.value = true
  try {
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      const uploaded = await uploadFile(fd)
      const row = await addProductImage(selectedId.value, uploaded.id)
      productImages.value.push({ ...row, directus_files_id: uploaded.id })
    }
  } catch (err) {
    showPhotoToast(err.message ?? 'Erreur upload', 'error')
  } finally {
    photoUploading.value = false
    if (photoInput.value) photoInput.value.value = ''
  }
}

async function deletePhoto(row) {
  await removeProductImage(row.id).catch(() => {})
  productImages.value = productImages.value.filter(p => p.id !== row.id)
}

function showPhotoToast(msg, type = 'success') {
  photoToast.value = { msg, type }
  setTimeout(() => { photoToast.value = null }, 3000)
}

function onDropZone(e) {
  e.preventDefault()
  onPhotoFiles(e)
}

// ── Calendrier disponibilité ──────────────────────────────────────────────────
const calResas     = ref([])
const calLoading   = ref(false)
const calYear      = ref(new Date().getFullYear())
const calMonth     = ref(new Date().getMonth()) // 0-indexed

const ACTIVE_STATUSES = ['en_attente', 'devis_realise', 'devis_confirme']

watch(selectedId, (id) => {
  calResas.value = []
  productImages.value = []
  if (id && activeTab.value === 'infos') { loadPhotos(); loadCalResas() }
})

async function loadCalResas() {
  calLoading.value = true
  try {
    const rows = await getReservationsByProduit(selectedId.value)
    calResas.value = (rows ?? [])
      .map(r => r.reservations_id)
      .filter(r => r && ACTIVE_STATUSES.includes(r.status))
  } catch { calResas.value = [] }
  finally { calLoading.value = false }
}

function calPrev() {
  if (calMonth.value === 0) { calMonth.value = 11; calYear.value-- }
  else calMonth.value--
}
function calNext() {
  if (calMonth.value === 11) { calMonth.value = 0; calYear.value++ }
  else calMonth.value++
}

const calDays = computed(() => {
  const year = calYear.value
  const month = calMonth.value
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Adjust so week starts Monday
  const startOffset = (firstDay + 6) % 7
  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  return cells
})

const totalArticleCount = computed(() =>
  selectedArticles.value.filter(a => a.etat !== 'hors_service' && a.etat !== 'en_maintenance').length
)

function reservationsOnDay(day) {
  if (!day) return 0
  const d = new Date(calYear.value, calMonth.value, day)
  d.setHours(12)
  return calResas.value.filter(r => {
    const s = new Date(r.date_start); s.setHours(0)
    const e = new Date(r.date_end);   e.setHours(23, 59)
    return d >= s && d <= e
  }).length
}

function dayInfo(day) {
  if (!day) return null
  const total = totalArticleCount.value
  if (total === 0) return { cls: '', dot: null, avail: 0 }
  const booked = reservationsOnDay(day)
  const avail = total - booked
  if (avail <= 0) return { cls: 'bg-red-50',    dot: 'bg-red-400',    avail: 0,     label: 'text-red-500' }
  if (avail <= 1) return { cls: 'bg-orange-50', dot: 'bg-orange-400', avail,        label: 'text-orange-500' }
  return              { cls: 'bg-green-50',  dot: 'bg-green-400',  avail,        label: 'text-green-600' }
}

function formatCurrency(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n ?? 0)
}
function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function artCountFor(id) {
  return articles.value.filter(a => a.produit_id === id && a.etat === 'disponible').length
}

// ── Config logistique ─────────────────────────────────────────────────────────
const configDraft  = ref({ jours_avant: 0, jours_apres: 0 })
const configDirty  = ref(false)
const configSaving = ref(false)

watch(selected, (p) => {
  if (p) { configDraft.value = { jours_avant: p.jours_avant ?? 0, jours_apres: p.jours_apres ?? 0 }; configDirty.value = false }
}, { immediate: true })

function onConfigChange() {
  configDirty.value =
    configDraft.value.jours_avant !== (selected.value?.jours_avant ?? 0) ||
    configDraft.value.jours_apres !== (selected.value?.jours_apres ?? 0)
}

async function saveConfig() {
  configSaving.value = true
  try {
    await produitsStore.patch(selected.value.id, {
      jours_avant: Number(configDraft.value.jours_avant),
      jours_apres: Number(configDraft.value.jours_apres),
    })
    configDirty.value = false
  } finally {
    configSaving.value = false
  }
}

// ── Drawer produit create/edit ────────────────────────────────────────────────
const drawerOpen   = ref(false)
const drawerMode   = ref('create')
const drawerSaving = ref(false)
const pForm = ref({})

function emptyPForm() {
  return { nom: '', categorie: '', prix_location: '', badge: '', description: '', jours_avant: 0, jours_apres: 0 }
}

function openPCreate() {
  pForm.value = emptyPForm()
  drawerMode.value = 'create'
  drawerOpen.value = true
}

function openPEdit() {
  const p = selected.value
  pForm.value = {
    nom:          p.nom ?? '',
    categorie:    p.categorie ?? '',
    prix_location: p.prix_location ?? '',
    badge:        p.badge ?? '',
    description:  p.description ?? '',
    jours_avant:  p.jours_avant ?? 0,
    jours_apres:  p.jours_apres ?? 0,
  }
  drawerMode.value = 'edit'
  drawerOpen.value = true
}

function closeDrawer() { drawerOpen.value = false }

async function submitPDrawer() {
  if (!pForm.value.nom?.trim()) return
  drawerSaving.value = true
  try {
    const payload = {
      name:              pForm.value.nom.trim(),
      price:             pForm.value.prix_location !== '' ? Number(pForm.value.prix_location) : 0,
      badge:             pForm.value.badge || null,
      short_description: pForm.value.description || null,
      jours_avant:       Number(pForm.value.jours_avant ?? 0),
      jours_apres:       Number(pForm.value.jours_apres ?? 0),
    }
    if (drawerMode.value === 'create') {
      const created = await produitsStore.create(payload)
      if (created) selectedId.value = created.id
    } else {
      await produitsStore.patch(selected.value.id, payload)
    }
    drawerOpen.value = false
  } finally {
    drawerSaving.value = false
  }
}

// ── Delete produit confirm ────────────────────────────────────────────────────
const confirmDeleteProduit = ref(false)
const deleteProduitRunning = ref(false)

async function doDeleteProduit() {
  deleteProduitRunning.value = true
  try {
    await produitsStore.delete(selected.value.id)
    selectedId.value = null
    confirmDeleteProduit.value = false
  } finally {
    deleteProduitRunning.value = false
  }
}

// ── Ajout d'article ───────────────────────────────────────────────────────────
const showAddForm = ref(false)
const addSaving   = ref(false)
const newArticle  = ref({})

function openAddForm() {
  const count = selectedArticles.value.length + 1
  const slug  = selected.value?.slug || 'art'
  newArticle.value = {
    produit_id: selectedId.value, reference: `${slug}-${String(count).padStart(3, '0')}`,
    etat: 'disponible', entrepot_id: null, emplacement: '', date_achat: '', valeur_achat: '', notes: '',
  }
  showAddForm.value = true
}

async function submitAdd() {
  if (!newArticle.value.reference?.trim()) return
  addSaving.value = true
  try {
    const entrepot = entrepots.value.find(e => e.id === newArticle.value.entrepot_id)
    await articlesStore.create(
      {
        produit_id:   newArticle.value.produit_id,
        reference:    newArticle.value.reference.trim(),
        etat:         newArticle.value.etat,
        entrepot_id:  newArticle.value.entrepot_id || null,
        emplacement:  newArticle.value.emplacement || null,
        date_achat:   newArticle.value.date_achat || null,
        valeur_achat: newArticle.value.valeur_achat ? Number(newArticle.value.valeur_achat) : null,
        notes:        newArticle.value.notes || null,
      },
      selected.value?.nom,
      entrepot?.nom,
    )
    showAddForm.value = false
  } finally {
    addSaving.value = false
  }
}

// ── Edit article drawer ────────────────────────────────────────────────────────
const artDrawerOpen   = ref(false)
const artDrawerSaving = ref(false)
const artForm = ref({})
const editingArticleId = ref(null)

function openArtEdit(a) {
  editingArticleId.value = a.id
  artForm.value = {
    reference:    a.reference ?? '',
    etat:         a.etat ?? 'disponible',
    entrepot_id:  a.entrepot_id ?? null,
    emplacement:  a.emplacement ?? '',
    date_achat:   a.date_achat ?? '',
    valeur_achat: a.valeur_achat ?? '',
    notes:        a.notes ?? '',
  }
  artDrawerOpen.value = true
}

async function submitArtEdit() {
  if (!artForm.value.reference?.trim()) return
  artDrawerSaving.value = true
  try {
    const entrepot = entrepots.value.find(e => e.id === artForm.value.entrepot_id)
    await articlesStore.patch(
      editingArticleId.value,
      {
        reference:    artForm.value.reference.trim(),
        etat:         artForm.value.etat,
        entrepot_id:  artForm.value.entrepot_id || null,
        emplacement:  artForm.value.emplacement || null,
        date_achat:   artForm.value.date_achat || null,
        valeur_achat: artForm.value.valeur_achat !== '' ? Number(artForm.value.valeur_achat) : null,
        notes:        artForm.value.notes || null,
      },
      selected.value?.nom,
      entrepot?.nom,
    )
    artDrawerOpen.value = false
  } finally {
    artDrawerSaving.value = false
  }
}

// ── Delete article confirm ────────────────────────────────────────────────────
const confirmDeleteArticle = ref(null)
const deleteArticleRunning = ref(false)

async function doDeleteArticle() {
  deleteArticleRunning.value = true
  try {
    await articlesStore.delete(confirmDeleteArticle.value)
    confirmDeleteArticle.value = null
  } finally {
    deleteArticleRunning.value = false
  }
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Header ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path d="M2 3a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2Z"/>
        <path fill-rule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 0 1-1.99 1.79H4.802a2 2 0 0 1-1.99-1.79L2 7.5ZM7 11a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z" clip-rule="evenodd"/>
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Produits</h1>
      <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{{ produits.length }}</span>
      <button @click="openPCreate"
        class="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
        </svg>
        Nouveau produit
      </button>
    </div>

    <!-- ── Master-detail ── -->
    <div class="flex flex-1 overflow-hidden">

      <!-- ── Left panel ── -->
      <div class="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div class="p-3 border-b border-gray-100">
          <div class="relative mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
                 class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>
            </svg>
            <input v-model="search" type="text" placeholder="Rechercher…"
              class="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-gray-50"/>
          </div>
          <div class="flex flex-wrap gap-1">
            <button class="text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors"
              :class="catFilter === 'all' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="catFilter = 'all'">Tous</button>
            <button v-for="cat in categories" :key="cat"
              class="text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors"
              :class="catFilter === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="catFilter = cat">{{ cat }}</button>
          </div>
        </div>

        <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">Chargement…</div>
        <div v-else-if="error" class="flex-1 flex items-center justify-center px-4"><p class="text-sm text-red-500">{{ error }}</p></div>
        <div v-else class="flex-1 overflow-y-auto">
          <div v-for="p in filtered" :key="p.id"
            class="flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors border-l-[3px]"
            :class="selectedId === p.id ? 'bg-orange-50 border-l-orange-500' : 'border-l-transparent'"
            @click="selectItem(p)">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 text-white"
                 :style="{ background: CAT_COLORS[p.categorie] ?? '#6b7280' }">
              {{ p.nom[0] }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">{{ p.nom }}</div>
              <div class="text-[11px] text-gray-400 mt-0.5">{{ p.categorie }}</div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-sm font-bold text-blue-600">{{ artCountFor(p.id) }}</div>
              <div class="text-[10px] text-gray-400">dispo</div>
            </div>
          </div>
          <div v-if="filtered.length === 0" class="p-6 text-center text-sm text-gray-400">Aucun produit trouvé</div>
        </div>
      </div>

      <!-- ── Right panel ── -->
      <div class="flex-1 overflow-hidden flex flex-col bg-gray-100">

        <div v-if="!selected" class="flex-1 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-14 h-14 mx-auto mb-3 opacity-30">
              <path stroke-linecap="round" stroke-linejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"/>
            </svg>
            <p class="text-sm">Sélectionnez un produit</p>
          </div>
        </div>

        <template v-else>

          <!-- Header -->
          <div class="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
            <div class="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
              <span>Produits</span><span>›</span>
              <span class="text-gray-700 font-medium">{{ selected.nom }}</span>
            </div>
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0 shadow-sm"
                   :style="{ background: CAT_COLORS[selected.categorie] ?? '#6b7280' }">
                {{ selected.nom[0] }}
              </div>
              <div class="flex-1 min-w-0">
                <h2 class="text-xl font-bold text-gray-900 leading-tight">{{ selected.nom }}</h2>
                <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-orange-50 text-orange-700 border border-orange-100">{{ selected.categorie }}</span>
                  <span v-if="selected.badge" class="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 border border-blue-100">{{ selected.badge }}</span>
                </div>
              </div>
              <div class="flex gap-3 flex-shrink-0">
                <div class="text-center px-4 py-2 rounded-xl" style="background:#1565c0;">
                  <div class="text-xl font-bold text-white leading-none">{{ dispoCount }}<span class="text-sm font-normal text-blue-200">/{{ selectedArticles.length }}</span></div>
                  <div class="text-[10px] text-blue-200 mt-1 font-medium uppercase tracking-wide">Disponibles</div>
                </div>
                <div class="text-center px-4 py-2 rounded-xl" style="background:#1b5e20;">
                  <div class="text-xl font-bold text-white leading-none">{{ formatCurrency(selected.prix_location) }}</div>
                  <div class="text-[10px] text-green-200 mt-1 font-medium uppercase tracking-wide">Prix / unité</div>
                </div>
              </div>
              <!-- Actions produit -->
              <div class="flex gap-2 flex-shrink-0">
                <button @click="openPEdit"
                  class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                    <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
                    <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/>
                  </svg>
                  Modifier
                </button>
                <button @click="confirmDeleteProduit = true"
                  class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-semibold rounded-lg transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                    <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clip-rule="evenodd"/>
                  </svg>
                  Supprimer
                </button>
              </div>
            </div>
          </div>

          <!-- Tabs -->
          <div class="bg-white border-b border-gray-200 px-6 flex-shrink-0">
            <div class="flex">
              <button v-for="t in [
                  { key: 'infos',    label: 'Informations' },
                  { key: 'articles', label: `Articles (${selectedArticles.length})` },
                ]"
                :key="t.key"
                class="px-5 py-3 text-[13px] font-semibold border-b-2 transition-colors -mb-px uppercase tracking-wide"
                :class="activeTab === t.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'"
                @click="activeTab = t.key">{{ t.label }}</button>
            </div>
          </div>

          <!-- Tab content -->
          <div class="flex-1 overflow-y-auto p-6">

            <!-- Informations -->
            <template v-if="activeTab === 'infos'">
              <div class="bg-white rounded-xl shadow-sm overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <span class="text-[#e65100]">▲</span>
                  <span class="text-sm font-semibold text-gray-700">Informations</span>
                </div>
                <div class="p-6 grid grid-cols-2 gap-x-10 gap-y-5">
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Catégorie</div>
                    <div class="text-gray-900">{{ selected.categorie || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Prix de location</div>
                    <div class="text-gray-900 font-semibold">{{ formatCurrency(selected.prix_location) }} / unité</div>
                  </div>
                  <div class="col-span-2" v-if="selected.description">
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Description</div>
                    <div class="text-gray-700 text-sm leading-relaxed">{{ selected.description }}</div>
                  </div>
                  <div class="col-span-2" v-if="selected.specs">
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Spécifications</div>
                    <div class="grid grid-cols-2 gap-3">
                      <div v-for="(val, key) in selected.specs" :key="key" class="bg-gray-50 rounded-lg px-3 py-2">
                        <div class="text-[10px] text-gray-400 uppercase tracking-wide">{{ key }}</div>
                        <div class="text-sm font-medium text-gray-800 mt-0.5">{{ val }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Config logistique -->
              <div class="bg-white rounded-xl shadow-sm overflow-hidden mt-4">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-[#e65100]">▲</span>
                    <span class="text-sm font-semibold text-gray-700">Configuration logistique</span>
                  </div>
                  <button v-if="configDirty" @click="saveConfig" :disabled="configSaving"
                    class="text-xs px-3 py-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors">
                    {{ configSaving ? 'Sauvegarde…' : 'Sauvegarder' }}
                  </button>
                </div>
                <div class="p-5 grid grid-cols-2 gap-6">
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Jours de blocage avant</div>
                    <div class="flex items-center gap-2">
                      <input v-model.number="configDraft.jours_avant" type="number" min="0" max="30" @input="onConfigChange"
                        class="w-20 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-center font-semibold"/>
                      <span class="text-sm text-gray-500">jour(s) de préparation</span>
                    </div>
                    <p class="text-[11px] text-gray-400 mt-1.5">L'article est bloqué X jours avant le début de la réservation.</p>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Jours de blocage après</div>
                    <div class="flex items-center gap-2">
                      <input v-model.number="configDraft.jours_apres" type="number" min="0" max="30" @input="onConfigChange"
                        class="w-20 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 text-center font-semibold"/>
                      <span class="text-sm text-gray-500">jour(s) de retour</span>
                    </div>
                    <p class="text-[11px] text-gray-400 mt-1.5">L'article reste bloqué X jours après la fin de la réservation.</p>
                  </div>
                </div>
              </div>

              <!-- Photos -->
              <div class="bg-white rounded-xl shadow-sm overflow-hidden mt-4">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-[#e65100]">▲</span>
                    <span class="text-sm font-semibold text-gray-700">Photos</span>
                    <span v-if="productImages.length" class="text-xs text-gray-400">{{ productImages.length }} photo{{ productImages.length > 1 ? 's' : '' }}</span>
                  </div>
                  <label class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors cursor-pointer">
                    <svg v-if="!photoUploading" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                      <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                    </svg>
                    <span v-if="photoUploading" class="loading loading-spinner loading-xs"></span>
                    {{ photoUploading ? 'Upload…' : 'Ajouter des photos' }}
                    <input ref="photoInput" type="file" accept="image/*" multiple class="hidden" @change="onPhotoFiles" :disabled="photoUploading" />
                  </label>
                </div>
                <div class="p-5" @dragover.prevent @drop="onDropZone">
                  <div v-if="photosLoading" class="flex items-center justify-center h-20 text-sm text-gray-400">Chargement…</div>
                  <div v-else-if="!productImages.length"
                    class="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
                    @click="photoInput?.click()">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-10 h-10 mx-auto text-gray-300 mb-2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/>
                    </svg>
                    <p class="text-sm text-gray-400 font-medium">Glissez des images ici ou cliquez</p>
                  </div>
                  <div v-else class="grid grid-cols-4 gap-3">
                    <div v-for="img in productImages" :key="img.id"
                      class="relative group rounded-xl overflow-hidden aspect-square bg-gray-100 shadow-sm">
                      <img :src="assetUrl(img.directus_files_id)" class="w-full h-full object-cover" :alt="selected.nom" />
                      <div class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <button @click="deletePhoto(img)"
                          class="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                            <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <label class="rounded-xl border-2 border-dashed border-gray-200 aspect-square flex flex-col items-center justify-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-colors">
                      <svg v-if="!photoUploading" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-5 h-5 text-gray-300">
                        <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                      </svg>
                      <span v-if="photoUploading" class="loading loading-spinner loading-sm text-orange-400"></span>
                      <span class="text-[10px] text-gray-300 mt-1">Ajouter</span>
                      <input type="file" accept="image/*" multiple class="hidden" @change="onPhotoFiles" :disabled="photoUploading" />
                    </label>
                  </div>
                </div>
              </div>

              <!-- Toast photos -->
              <div v-if="photoToast" class="fixed bottom-6 right-6 z-50">
                <div :class="['px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-white',
                  photoToast.type === 'error' ? 'bg-error' : 'bg-success']">
                  {{ photoToast.msg }}
                </div>
              </div>

              <!-- Calendrier disponibilité -->
              <div class="bg-white rounded-xl shadow-sm overflow-hidden mt-4">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-[#e65100]">▲</span>
                    <span class="text-sm font-semibold text-gray-700">Disponibilité</span>
                    <span class="text-xs text-gray-400">{{ totalArticleCount }} exemplaire{{ totalArticleCount > 1 ? 's' : '' }}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <div class="flex items-center gap-3 text-xs text-gray-500">
                      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-green-400 inline-block"></span>Dispo</span>
                      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>1 restant</span>
                      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-400 inline-block"></span>Complet</span>
                    </div>
                    <div class="flex items-center gap-1">
                      <button @click="calPrev" class="btn btn-xs btn-ghost btn-circle">‹</button>
                      <span class="text-sm font-semibold text-gray-700 w-36 text-center capitalize">
                        {{ new Date(calYear, calMonth).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) }}
                      </span>
                      <button @click="calNext" class="btn btn-xs btn-ghost btn-circle">›</button>
                    </div>
                  </div>
                </div>
                <div v-if="calLoading" class="flex items-center justify-center h-24 text-sm text-gray-400">Chargement…</div>
                <div v-else class="p-4">
                  <div class="grid grid-cols-7 mb-1">
                    <div v-for="j in ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']" :key="j"
                      class="text-center text-[11px] font-semibold text-gray-400 uppercase py-1">{{ j }}</div>
                  </div>
                  <div class="grid grid-cols-7 gap-0.5">
                    <div v-for="(day, i) in calDays" :key="i"
                      :class="['rounded-lg p-1 min-h-[44px] transition-colors', day ? (dayInfo(day)?.cls || 'hover:bg-gray-50') : '']">
                      <template v-if="day">
                        <span class="text-xs font-semibold text-gray-600 block text-center leading-none mb-1">{{ day }}</span>
                        <template v-if="dayInfo(day)?.dot">
                          <div class="flex justify-center mb-0.5">
                            <span :class="['w-1.5 h-1.5 rounded-full', dayInfo(day).dot]"></span>
                          </div>
                          <div class="text-center">
                            <span :class="['text-[9px] font-bold', dayInfo(day).label]">
                              {{ dayInfo(day).avail }}/{{ totalArticleCount }}
                            </span>
                          </div>
                        </template>
                      </template>
                    </div>
                  </div>
                  <div v-if="totalArticleCount === 0" class="text-center text-xs text-gray-400 mt-3 italic">
                    Aucun exemplaire enregistré.
                  </div>
                </div>
              </div>
            </template>

            <!-- Articles physiques -->
            <template v-if="activeTab === 'articles'">
              <div class="bg-white rounded-xl shadow-sm overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-[#e65100]">▲</span>
                    <span class="text-sm font-semibold text-gray-700">Exemplaires physiques</span>
                    <span class="text-xs text-gray-400">{{ selectedArticles.length }}</span>
                  </div>
                  <button @click="openAddForm"
                    class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                      <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                    </svg>
                    Ajouter un article
                  </button>
                </div>

                <!-- Formulaire ajout inline -->
                <div v-if="showAddForm" class="border-b border-orange-100 bg-orange-50 p-5">
                  <div class="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-3">Nouvel exemplaire — {{ selected.nom }}</div>
                  <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Référence *</label>
                      <input v-model="newArticle.reference" type="text" placeholder="ex: table-ronde-001"
                        class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white font-mono"/>
                    </div>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">État</label>
                      <select v-model="newArticle.etat"
                        class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                        <option v-for="(info, key) in ETAT" :key="key" :value="key">{{ info.label }}</option>
                      </select>
                    </div>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Entrepôt</label>
                      <select v-model="newArticle.entrepot_id"
                        class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                        <option :value="null">— Non assigné</option>
                        <option v-for="e in entrepots" :key="e.id" :value="e.id">{{ e.nom }}</option>
                      </select>
                    </div>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Emplacement</label>
                      <input v-model="newArticle.emplacement" type="text" placeholder="ex: Allée A, Rangée 3"
                        class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"/>
                    </div>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Date d'achat</label>
                      <input v-model="newArticle.date_achat" type="date"
                        class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"/>
                    </div>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Valeur d'achat (€)</label>
                      <input v-model="newArticle.valeur_achat" type="number" min="0" step="0.01" placeholder="0"
                        class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"/>
                    </div>
                    <div class="col-span-2">
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Notes</label>
                      <input v-model="newArticle.notes" type="text" placeholder="Observations, numéro de série…"
                        class="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"/>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <button @click="submitAdd" :disabled="addSaving || !newArticle.reference?.trim()"
                      class="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                      {{ addSaving ? 'Enregistrement…' : 'Ajouter' }}
                    </button>
                    <button @click="showAddForm = false"
                      class="px-4 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-semibold rounded-lg transition-colors">
                      Annuler
                    </button>
                  </div>
                </div>

                <div v-if="selectedArticles.length === 0 && !showAddForm" class="px-5 py-8 text-center text-sm text-gray-400">
                  Aucun exemplaire enregistré pour ce produit.
                </div>
                <table v-if="selectedArticles.length > 0" class="w-full text-sm">
                  <thead class="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Désignation</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">État</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Entrepôt</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Emplacement</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Achat</th>
                      <th class="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-50">
                    <tr v-for="a in selectedArticles" :key="a.id" class="hover:bg-gray-50 group">
                      <td class="px-4 py-3 font-mono text-xs text-gray-700 font-semibold">{{ a.reference }}</td>
                      <td class="px-4 py-3">
                        <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold" :class="ETAT[a.etat]?.cls">
                          {{ ETAT[a.etat]?.label ?? a.etat }}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-gray-600">{{ a.entrepot_nom || '—' }}</td>
                      <td class="px-4 py-3 text-gray-500 text-xs">{{ a.emplacement || '—' }}</td>
                      <td class="px-4 py-3 text-gray-400 text-xs">{{ formatDate(a.date_achat) }}</td>
                      <td class="px-4 py-3 text-right">
                        <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button @click="router.push({ path: '/articles', query: { search: a.reference } })"
                            title="Voir dans Articles"
                            class="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                              <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z"/>
                              <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z"/>
                            </svg>
                          </button>
                          <button @click="openArtEdit(a)"
                            class="p-1.5 rounded-lg hover:bg-orange-50 text-gray-400 hover:text-orange-600 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                              <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
                              <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/>
                            </svg>
                          </button>
                          <button @click="confirmDeleteArticle = a.id"
                            class="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                              <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clip-rule="evenodd"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>


          </div>
        </template>
      </div>
    </div>

    <!-- ── Drawer produit create/edit ── -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="drawerOpen" class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-black/30" @click="closeDrawer"/>
          <div class="relative w-[420px] bg-white h-full flex flex-col shadow-2xl">

            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-orange-500">
              <h2 class="text-base font-semibold text-white">
                {{ drawerMode === 'create' ? 'Nouveau produit' : 'Modifier le produit' }}
              </h2>
              <button @click="closeDrawer" class="text-orange-100 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
                </svg>
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Nom *</label>
                <input v-model="pForm.nom" type="text" placeholder="Table ronde"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"/>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Catégorie</label>
                  <input v-model="pForm.categorie" type="text" placeholder="Mobilier"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Prix / unité (€)</label>
                  <input v-model="pForm.prix_location" type="number" min="0" step="0.01" placeholder="0"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Badge</label>
                <input v-model="pForm.badge" type="text" placeholder="Nouveau, Bestseller…"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"/>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Description</label>
                <textarea v-model="pForm.description" rows="3" placeholder="Description courte…"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"/>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Jours avant</label>
                  <input v-model.number="pForm.jours_avant" type="number" min="0" max="30"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Jours après</label>
                  <input v-model.number="pForm.jours_apres" type="number" min="0" max="30"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                </div>
              </div>
            </div>

            <div class="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button @click="submitPDrawer" :disabled="drawerSaving || !pForm.nom?.trim()"
                class="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                {{ drawerSaving ? 'Enregistrement…' : (drawerMode === 'create' ? 'Créer' : 'Sauvegarder') }}
              </button>
              <button @click="closeDrawer"
                class="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-semibold rounded-lg transition-colors">
                Annuler
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Drawer article edit ── -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="artDrawerOpen" class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-black/30" @click="artDrawerOpen = false"/>
          <div class="relative w-[420px] bg-white h-full flex flex-col shadow-2xl">

            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-orange-500">
              <h2 class="text-base font-semibold text-white">Modifier l'exemplaire</h2>
              <button @click="artDrawerOpen = false" class="text-orange-100 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
                </svg>
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Référence *</label>
                <input v-model="artForm.reference" type="text"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"/>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">État</label>
                <select v-model="artForm.etat"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                  <option v-for="(info, key) in ETAT" :key="key" :value="key">{{ info.label }}</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Entrepôt</label>
                  <select v-model="artForm.entrepot_id"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white">
                    <option :value="null">— Non assigné</option>
                    <option v-for="e in entrepots" :key="e.id" :value="e.id">{{ e.nom }}</option>
                  </select>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Emplacement</label>
                  <input v-model="artForm.emplacement" type="text"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Date d'achat</label>
                  <input v-model="artForm.date_achat" type="date"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Valeur d'achat (€)</label>
                  <input v-model="artForm.valeur_achat" type="number" min="0" step="0.01"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"/>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Notes</label>
                <input v-model="artForm.notes" type="text"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"/>
              </div>
            </div>

            <div class="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button @click="submitArtEdit" :disabled="artDrawerSaving || !artForm.reference?.trim()"
                class="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                {{ artDrawerSaving ? 'Enregistrement…' : 'Sauvegarder' }}
              </button>
              <button @click="artDrawerOpen = false"
                class="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-semibold rounded-lg transition-colors">
                Annuler
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Delete produit confirm ── -->
    <Teleport to="body">
      <div v-if="confirmDeleteProduit" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" @click="confirmDeleteProduit = false"/>
        <div class="relative bg-white rounded-2xl shadow-xl p-6 w-80">
          <h3 class="text-base font-semibold text-gray-900 mb-2">Supprimer ce produit ?</h3>
          <p class="text-sm text-gray-500 mb-5">Cette action est irréversible. Les exemplaires liés ne seront pas supprimés.</p>
          <div class="flex gap-3">
            <button @click="doDeleteProduit" :disabled="deleteProduitRunning"
              class="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              {{ deleteProduitRunning ? 'Suppression…' : 'Supprimer' }}
            </button>
            <button @click="confirmDeleteProduit = false"
              class="flex-1 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg transition-colors">
              Annuler
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Delete article confirm ── -->
    <Teleport to="body">
      <div v-if="confirmDeleteArticle !== null" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" @click="confirmDeleteArticle = null"/>
        <div class="relative bg-white rounded-2xl shadow-xl p-6 w-80">
          <h3 class="text-base font-semibold text-gray-900 mb-2">Supprimer cet exemplaire ?</h3>
          <p class="text-sm text-gray-500 mb-5">Cette action est irréversible.</p>
          <div class="flex gap-3">
            <button @click="doDeleteArticle" :disabled="deleteArticleRunning"
              class="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              {{ deleteArticleRunning ? 'Suppression…' : 'Supprimer' }}
            </button>
            <button @click="confirmDeleteArticle = null"
              class="flex-1 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg transition-colors">
              Annuler
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
.drawer-enter-active, .drawer-leave-active { transition: opacity 0.2s, transform 0.25s; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .relative, .drawer-leave-to .relative { transform: translateX(100%); }
</style>
