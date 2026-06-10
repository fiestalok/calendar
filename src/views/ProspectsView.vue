<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useProspectsStore } from '../stores/prospects'
import { useClientsStore } from '../stores/clients'
import { useCommentsStore } from '../stores/comments'
import { useAuthStore } from '../stores/auth'

const store = useProspectsStore()
const clientsStore = useClientsStore()
const commentsStore = useCommentsStore()
const auth = useAuthStore()
const router = useRouter()

const { prospects, loading, error } = storeToRefs(store)
onMounted(() => store.fetch())

const search = ref('')
const statutFilter = ref('all')
const selectedId = ref(null)
const activeTab = ref('infos')

const inputCls = 'w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white'

const STATUTS = [
  { key: 'all',          label: 'Tous' },
  { key: 'nouveau',      label: 'Nouveau' },
  { key: 'contacte',     label: 'Contacté' },
  { key: 'devis_envoye', label: 'Devis envoyé' },
  { key: 'converti',     label: 'Converti' },
  { key: 'perdu',        label: 'Perdu' },
]

const STATUT_STYLE = {
  nouveau:       { cls: 'bg-blue-100 text-blue-700',       label: 'Nouveau' },
  contacte:      { cls: 'bg-cyan-100 text-cyan-700',       label: 'Contacté' },
  devis_envoye:  { cls: 'bg-amber-100 text-amber-700',     label: 'Devis envoyé' },
  converti:      { cls: 'bg-blue-100 text-blue-700', label: 'Converti' },
  perdu:         { cls: 'bg-red-100 text-red-700',         label: 'Perdu' },
}

const filtered = computed(() => {
  let list = prospects.value
  if (statutFilter.value !== 'all') list = list.filter(p => p.statut === statutFilter.value)
  const q = search.value.toLowerCase()
  if (q) list = list.filter(p =>
    (p.prenom ? `${p.prenom} ${p.nom}` : p.raison_sociale ?? '').toLowerCase().includes(q) ||
    p.email?.toLowerCase().includes(q) ||
    p.ville?.toLowerCase().includes(q) ||
    p.evenement?.toLowerCase().includes(q)
  )
  return list
})

const selected = computed(() => prospects.value.find(p => p.id === selectedId.value) ?? null)

function selectItem(p) { selectedId.value = p.id; activeTab.value = 'infos'; inlineEditing.value = false }
function displayName(p) { return p.type === 'entreprise' ? (p.raison_sociale ?? '') : `${p.prenom ?? ''} ${p.nom ?? ''}`.trim() }
function initials(p) {
  const n = displayName(p)
  const parts = n.split(' ').filter(Boolean)
  return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : (n[0] ?? '?')
}
function formatCurrency(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n ?? 0)
}
function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function formatDatetime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const AVATAR_COLORS = ['#3b82f6','#3b82f6','#3b82f6','#2563eb','#3b82f6','#06b6d4']
function avatarColor(p) { return AVATAR_COLORS[p.id % AVATAR_COLORS.length] }

// ── Inline edit ───────────────────────────────────────────────────────────────
const inlineEditing = ref(false)
const inlineSaving  = ref(false)
const inlineDraft   = ref({})

function startInlineEdit() {
  const p = selected.value
  inlineDraft.value = {
    type:           p.type ?? 'particulier',
    prenom:         p.prenom ?? '',
    nom:            p.nom ?? '',
    raison_sociale: p.raison_sociale ?? '',
    email:          p.email ?? '',
    telephone:      p.telephone ?? '',
    ville:          p.ville ?? '',
    statut:         p.statut ?? 'nouveau',
    budget_estime:  p.budget_estime ?? '',
    origine:        p.origine ?? '',
    evenement:      p.evenement ?? '',
  }
  activeTab.value = 'infos'
  inlineEditing.value = true
}
function cancelInlineEdit() { inlineEditing.value = false }
async function saveInlineEdit() {
  inlineSaving.value = true
  try {
    const d = inlineDraft.value
    await store.patch(selected.value.id, {
      type:           d.type,
      prenom:         d.type === 'particulier' ? (d.prenom || null) : null,
      nom:            d.type === 'particulier' ? (d.nom || null) : null,
      raison_sociale: d.type === 'entreprise'  ? (d.raison_sociale || null) : null,
      email:          d.email || null,
      telephone:      d.telephone || null,
      ville:          d.ville || null,
      statut:         d.statut,
      budget_estime:  d.budget_estime !== '' ? Number(d.budget_estime) : null,
      origine:        d.origine || null,
      evenement:      d.evenement || null,
    })
    inlineEditing.value = false
  } finally {
    inlineSaving.value = false
  }
}

// ── Notes ─────────────────────────────────────────────────────────────────────
const notesSubTab  = ref('note')
const notesEditing = ref(false)
const notesSaving  = ref(false)
const notesText    = ref('')

watch(selected, (p) => {
  notesText.value = p?.notes ?? ''
  notesEditing.value = false
  notesSubTab.value = 'note'
}, { immediate: true })

watch(() => selected.value?.id, (id) => {
  if (id) commentsStore.fetch('prospect_notes', id)
}, { immediate: true })

const notesHistory = computed(() => commentsStore.cache[`prospect_notes_${selected.value?.id}`] ?? [])

async function saveNotes() {
  notesSaving.value = true
  try {
    await store.patch(selected.value.id, { notes: notesText.value })
    try { await commentsStore.create('prospect_notes', selected.value.id, auth.user.name, notesText.value.trim() || '(Note effacée)') } catch {}
    notesEditing.value = false
  } finally {
    notesSaving.value = false
  }
}
function cancelNotes() { notesEditing.value = false; notesText.value = selected.value?.notes ?? '' }

// ── Convertir en client ───────────────────────────────────────────────────────
const convertModal   = ref(false)
const convertRunning = ref(false)

async function doConvert() {
  convertRunning.value = true
  try {
    const p = selected.value
    const newClient = await clientsStore.create({
      typeClient:   p.type === 'entreprise' ? 'Entreprise' : 'Particulier',
      first_name:   p.prenom || null,
      last_name:    p.nom || null,
      company_name: p.raison_sociale || null,
      email:        p.email || null,
      phone:        p.telephone || null,
      city:         p.ville || null,
      notes:        p.notes || null,
    })
    await store.patch(p.id, { statut: 'converti' })
    convertModal.value = false
    if (newClient) router.push('/clients')
  } finally {
    convertRunning.value = false
  }
}

// ── Drawer (create only) ──────────────────────────────────────────────────────
const drawerOpen   = ref(false)
const drawerSaving = ref(false)
const form = ref({})

function emptyForm() {
  return { type: 'particulier', prenom: '', nom: '', raison_sociale: '', email: '', telephone: '',
           ville: '', statut: 'nouveau', budget_estime: '', origine: '', evenement: '', notes: '' }
}
function openCreate() { form.value = emptyForm(); drawerOpen.value = true }
function closeDrawer() { drawerOpen.value = false }

async function submitDrawer() {
  drawerSaving.value = true
  try {
    const f = form.value
    const created = await store.create({
      type:           f.type,
      prenom:         f.type === 'particulier' ? (f.prenom || null) : null,
      nom:            f.type === 'particulier' ? (f.nom || null) : null,
      raison_sociale: f.type === 'entreprise'  ? (f.raison_sociale || null) : null,
      email:          f.email || null,
      telephone:      f.telephone || null,
      ville:          f.ville || null,
      statut:         f.statut,
      budget_estime:  f.budget_estime !== '' ? Number(f.budget_estime) : null,
      origine:        f.origine || null,
      evenement:      f.evenement || null,
      notes:          f.notes || null,
    })
    if (created) selectedId.value = created.id
    drawerOpen.value = false
  } finally {
    drawerSaving.value = false
  }
}

// ── Delete confirm ────────────────────────────────────────────────────────────
const confirmDelete = ref(false)
const deleteRunning = ref(false)

async function doDelete() {
  deleteRunning.value = true
  try {
    await store.delete(selected.value.id)
    selectedId.value = null
    confirmDelete.value = false
  } finally {
    deleteRunning.value = false
  }
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Page header ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd"/>
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Prospects</h1>
      <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{{ prospects.length }} prospects</span>
      <button @click="openCreate"
        class="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
        </svg>
        Nouveau prospect
      </button>
    </div>

    <!-- ── Master-detail ── -->
    <div class="flex flex-1 overflow-hidden">

      <!-- ── Left panel ── -->
      <div class="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div class="p-3 border-b border-gray-100 space-y-2">
          <div class="relative">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
                 class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>
            </svg>
            <input v-model="search" type="text" placeholder="Rechercher…"
              class="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent bg-gray-50"/>
          </div>
          <div class="flex flex-wrap gap-1">
            <button v-for="s in STATUTS" :key="s.key"
              class="text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors"
              :class="statutFilter === s.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="statutFilter = s.key">{{ s.label }}</button>
          </div>
        </div>

        <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">Chargement…</div>
        <div v-else-if="error" class="flex-1 flex items-center justify-center px-4"><p class="text-sm text-red-500">{{ error }}</p></div>
        <div v-else class="flex-1 overflow-y-auto">
          <div v-for="p in filtered" :key="p.id"
            class="flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors border-l-[3px]"
            :class="selectedId === p.id ? 'bg-blue-50 border-l-blue-500' : 'border-l-transparent'"
            @click="selectItem(p)">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                 :style="{ background: avatarColor(p) }">
              {{ initials(p) }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">{{ displayName(p) }}</div>
              <div class="text-[11px] text-gray-400 truncate mt-0.5">{{ p.evenement }}</div>
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
              :class="STATUT_STYLE[p.statut]?.cls">{{ STATUT_STYLE[p.statut]?.label }}</span>
          </div>
          <div v-if="filtered.length === 0" class="p-6 text-center text-sm text-gray-400">Aucun prospect trouvé</div>
        </div>
      </div>

      <!-- ── Right panel ── -->
      <div class="flex-1 overflow-hidden flex flex-col bg-gray-100">

        <div v-if="!selected" class="flex-1 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-14 h-14 mx-auto mb-3 opacity-30">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>
            </svg>
            <p class="text-sm">Sélectionnez un prospect</p>
          </div>
        </div>

        <template v-else>

          <!-- Detail header -->
          <div class="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
            <div class="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
              <span>Prospects</span><span>›</span>
              <span class="text-gray-700 font-medium">{{ displayName(selected) }}</span>
            </div>
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white flex-shrink-0 shadow-sm"
                   :style="{ background: avatarColor(selected) }">
                {{ initials(selected) }}
              </div>
              <div class="flex-1 min-w-0">
                <h2 class="text-xl font-bold text-gray-900">{{ displayName(selected) }}</h2>
                <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold border border-gray-200 bg-gray-50 text-gray-600 capitalize">{{ selected.type }}</span>
                  <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold" :class="STATUT_STYLE[selected.statut]?.cls">{{ STATUT_STYLE[selected.statut]?.label }}</span>
                </div>
              </div>
              <!-- Budget KPI -->
              <div class="text-center px-4 py-2 rounded-xl flex-shrink-0" style="background:#4a148c;">
                <div class="text-xl font-bold text-white leading-none">{{ formatCurrency(selected.budget_estime) }}</div>
                <div class="text-[10px] text-blue-200 mt-1 font-medium uppercase tracking-wide">Budget estimé</div>
              </div>
              <!-- Actions -->
              <div class="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                <button v-if="selected.statut !== 'converti'" @click="convertModal = true"
                  class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.78 5.78a.75.75 0 0 0-1.06-1.06L7 9.44 5.28 7.72a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25Z"/>
                  </svg>
                  Convertir en client
                </button>
                <button @click="confirmDelete = true"
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
              <button v-for="t in [{ key: 'infos', label: 'Informations' }, { key: 'notes', label: 'Notes' }]" :key="t.key"
                class="px-5 py-3 text-[13px] font-semibold border-b-2 transition-colors -mb-px uppercase tracking-wide"
                :class="activeTab === t.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'"
                @click="activeTab = t.key">{{ t.label }}</button>
            </div>
          </div>

          <!-- Tab content -->
          <div class="flex-1 overflow-y-auto p-6">

            <!-- ── Informations tab ── -->
            <template v-if="activeTab === 'infos'">
              <div class="bg-white rounded-xl shadow-sm overflow-hidden" :class="inlineEditing ? 'ring-2 ring-blue-400' : ''">
                <div class="px-5 py-3 border-b flex items-center gap-2"
                  :class="inlineEditing ? 'border-blue-100 bg-blue-50' : 'border-gray-100'">
                  <span class="text-[#e65100]">▲</span>
                  <span class="text-sm font-semibold flex-1" :class="inlineEditing ? 'text-blue-700' : 'text-gray-700'">Informations</span>
                  <button v-if="!inlineEditing" @click="startInlineEdit"
                    class="inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
                      <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/>
                    </svg>
                    Modifier
                  </button>
                  <span v-else class="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-50 text-blue-600 font-semibold rounded-lg border border-blue-200">
                    ✎ En cours
                  </span>
                </div>

                <!-- Display mode -->
                <div v-if="!inlineEditing" class="p-6 grid grid-cols-2 gap-x-10 gap-y-5">
                  <template v-if="selected.type === 'particulier'">
                    <div>
                      <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Prénom</div>
                      <div class="text-gray-900">{{ selected.prenom || '—' }}</div>
                    </div>
                    <div>
                      <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Nom</div>
                      <div class="text-gray-900 font-medium">{{ selected.nom || '—' }}</div>
                    </div>
                  </template>
                  <div v-if="selected.type === 'entreprise'" class="col-span-2">
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Raison sociale</div>
                    <div class="text-gray-900 font-medium">{{ selected.raison_sociale || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Email</div>
                    <a :href="`mailto:${selected.email}`" class="text-blue-600 hover:underline text-sm">{{ selected.email || '—' }}</a>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Téléphone</div>
                    <a :href="`tel:${selected.telephone}`" class="text-gray-900 text-sm">{{ selected.telephone || '—' }}</a>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Ville</div>
                    <div class="text-gray-900">{{ selected.ville || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Origine</div>
                    <div class="text-gray-900">{{ selected.origine || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Budget estimé</div>
                    <div class="text-gray-900 font-semibold">{{ formatCurrency(selected.budget_estime) }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Statut</div>
                    <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold" :class="STATUT_STYLE[selected.statut]?.cls">{{ STATUT_STYLE[selected.statut]?.label }}</span>
                  </div>
                  <div class="col-span-2">
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Événement</div>
                    <div class="text-gray-900 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm">{{ selected.evenement || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Créé le</div>
                    <div class="text-gray-500 text-sm">{{ formatDate(selected.created_at) }}</div>
                  </div>
                </div>

                <!-- Edit mode -->
                <div v-else class="p-6 space-y-4">
                  <div>
                    <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Type</label>
                    <div class="flex gap-2">
                      <button v-for="t in ['particulier','entreprise']" :key="t"
                        @click="inlineDraft.type = t"
                        class="flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors"
                        :class="inlineDraft.type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'">
                        {{ t.charAt(0).toUpperCase() + t.slice(1) }}
                      </button>
                    </div>
                  </div>

                  <template v-if="inlineDraft.type === 'particulier'">
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Prénom</label>
                        <input v-model="inlineDraft.prenom" type="text" :class="inputCls"/>
                      </div>
                      <div>
                        <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Nom</label>
                        <input v-model="inlineDraft.nom" type="text" :class="inputCls"/>
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Raison sociale</label>
                      <input v-model="inlineDraft.raison_sociale" type="text" :class="inputCls"/>
                    </div>
                  </template>

                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                      <input v-model="inlineDraft.email" type="email" :class="inputCls"/>
                    </div>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Téléphone</label>
                      <input v-model="inlineDraft.telephone" type="tel" :class="inputCls"/>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Ville</label>
                      <input v-model="inlineDraft.ville" type="text" :class="inputCls"/>
                    </div>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Origine</label>
                      <input v-model="inlineDraft.origine" type="text" :class="inputCls"/>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Statut</label>
                      <select v-model="inlineDraft.statut" :class="inputCls">
                        <option v-for="s in STATUTS.slice(1)" :key="s.key" :value="s.key">{{ s.label }}</option>
                      </select>
                    </div>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Budget estimé (€)</label>
                      <input v-model="inlineDraft.budget_estime" type="number" min="0" :class="inputCls"/>
                    </div>
                  </div>

                  <div>
                    <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Événement</label>
                    <input v-model="inlineDraft.evenement" type="text" :class="inputCls"/>
                  </div>

                  <div class="flex gap-3 pt-2">
                    <button @click="saveInlineEdit" :disabled="inlineSaving"
                      class="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                      {{ inlineSaving ? 'Enregistrement…' : 'Sauvegarder' }}
                    </button>
                    <button @click="cancelInlineEdit"
                      class="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-semibold rounded-lg transition-colors">
                      Annuler
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <!-- ── Notes tab ── -->
            <template v-if="activeTab === 'notes'">
              <div class="bg-white rounded-xl shadow-sm overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <span class="text-[#e65100]">▲</span>
                  <span class="text-sm font-semibold text-gray-700">Notes</span>
                  <div class="ml-auto flex gap-1">
                    <button v-for="sub in [{ key: 'note', label: 'Note' }, { key: 'historique', label: 'Historique' }]" :key="sub.key"
                      class="text-[11px] px-2.5 py-1 rounded-md font-semibold transition-colors"
                      :class="notesSubTab === sub.key ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'"
                      @click="notesSubTab = sub.key">{{ sub.label }}</button>
                  </div>
                </div>

                <!-- Note sub-tab -->
                <div v-if="notesSubTab === 'note'" class="p-6">
                  <div v-if="!notesEditing">
                    <p v-if="selected.notes" class="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{{ selected.notes }}</p>
                    <p v-else class="text-sm text-gray-400 italic">Aucune note pour ce prospect.</p>
                    <button @click="notesEditing = true"
                      class="mt-4 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                        <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
                        <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/>
                      </svg>
                      Modifier
                    </button>
                  </div>
                  <div v-else class="space-y-3">
                    <textarea v-model="notesText" rows="6" placeholder="Saisir une note…"
                      class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"/>
                    <div class="flex gap-3">
                      <button @click="saveNotes" :disabled="notesSaving"
                        class="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                        {{ notesSaving ? 'Enregistrement…' : 'Sauvegarder' }}
                      </button>
                      <button @click="cancelNotes"
                        class="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-semibold rounded-lg transition-colors">
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Historique sub-tab -->
                <div v-else class="p-6">
                  <div v-if="notesHistory.length === 0" class="text-sm text-gray-400 italic text-center py-4">Aucun historique pour ce prospect.</div>
                  <div v-else class="space-y-3">
                    <div v-for="entry in [...notesHistory].reverse()" :key="entry.id"
                      class="flex gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div class="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold flex-shrink-0 uppercase">
                        {{ entry.author?.[0] ?? '?' }}
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="flex items-baseline gap-2 mb-1">
                          <span class="text-xs font-semibold text-gray-700">{{ entry.author }}</span>
                          <span class="text-[11px] text-gray-400">{{ formatDatetime(entry.date_created) }}</span>
                        </div>
                        <p class="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{{ entry.text }}</p>
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

    <!-- ── Drawer (create only) ── -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="drawerOpen" class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-black/30" @click="closeDrawer"/>
          <div class="relative w-[420px] bg-white h-full flex flex-col shadow-2xl">

            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-blue-600">
              <h2 class="text-base font-semibold text-white">Nouveau prospect</h2>
              <button @click="closeDrawer" class="text-blue-200 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
                </svg>
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-6 space-y-4">

              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Type</label>
                <div class="flex gap-2">
                  <button v-for="t in ['particulier','entreprise']" :key="t"
                    @click="form.type = t"
                    class="flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors"
                    :class="form.type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'">
                    {{ t.charAt(0).toUpperCase() + t.slice(1) }}
                  </button>
                </div>
              </div>

              <template v-if="form.type === 'particulier'">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Prénom</label>
                    <input v-model="form.prenom" type="text" placeholder="Jean"
                      class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                  <div>
                    <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Nom</label>
                    <input v-model="form.nom" type="text" placeholder="Dupont"
                      class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                  </div>
                </div>
              </template>
              <template v-else>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Raison sociale</label>
                  <input v-model="form.raison_sociale" type="text" placeholder="Acme SAS"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
              </template>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                  <input v-model="form.email" type="email" placeholder="jean@example.com"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Téléphone</label>
                  <input v-model="form.telephone" type="tel" placeholder="06 00 00 00 00"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
              </div>

              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Ville</label>
                <input v-model="form.ville" type="text" placeholder="Paris"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"/>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Statut</label>
                  <select v-model="form.statut"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                    <option v-for="s in STATUTS.slice(1)" :key="s.key" :value="s.key">{{ s.label }}</option>
                  </select>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Budget estimé (€)</label>
                  <input v-model="form.budget_estime" type="number" min="0" placeholder="5000"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Origine</label>
                  <input v-model="form.origine" type="text" placeholder="Recommandation, web…"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Événement</label>
                  <input v-model="form.evenement" type="text" placeholder="Mariage, anniversaire…"
                    class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"/>
                </div>
              </div>

              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Notes</label>
                <textarea v-model="form.notes" rows="4" placeholder="Informations complémentaires…"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"/>
              </div>

            </div>

            <div class="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button @click="submitDrawer" :disabled="drawerSaving"
                class="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                {{ drawerSaving ? 'Enregistrement…' : 'Créer' }}
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

    <!-- ── Convertir en client modal ── -->
    <Teleport to="body">
      <div v-if="convertModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" @click="convertModal = false"/>
        <div class="relative bg-white rounded-2xl shadow-xl p-6 w-96">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-blue-600">
                <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div>
              <h3 class="text-base font-semibold text-gray-900">Convertir en client</h3>
              <p class="text-xs text-gray-500 mt-0.5">{{ displayName(selected) }}</p>
            </div>
          </div>
          <p class="text-sm text-gray-600 mb-5 leading-relaxed">
            Un nouveau client sera créé avec les informations de ce prospect. Le statut du prospect passera à <strong>Converti</strong>.
          </p>
          <div class="flex gap-3">
            <button @click="doConvert" :disabled="convertRunning"
              class="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              {{ convertRunning ? 'Conversion…' : 'Confirmer' }}
            </button>
            <button @click="convertModal = false"
              class="flex-1 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg transition-colors">
              Annuler
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Delete confirm modal ── -->
    <Teleport to="body">
      <div v-if="confirmDelete" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" @click="confirmDelete = false"/>
        <div class="relative bg-white rounded-2xl shadow-xl p-6 w-80">
          <h3 class="text-base font-semibold text-gray-900 mb-2">Supprimer ce prospect ?</h3>
          <p class="text-sm text-gray-500 mb-5">Cette action est irréversible.</p>
          <div class="flex gap-3">
            <button @click="doDelete" :disabled="deleteRunning"
              class="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              {{ deleteRunning ? 'Suppression…' : 'Supprimer' }}
            </button>
            <button @click="confirmDelete = false"
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
