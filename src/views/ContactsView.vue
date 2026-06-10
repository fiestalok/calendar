<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useContactsStore } from '../stores/contacts'
import { useClientsStore } from '../stores/clients'
import { useCommentsStore } from '../stores/comments'
import { useAuthStore } from '../stores/auth'
import CommentSection from '../components/CommentSection.vue'

const store         = useContactsStore()
const clientsStore  = useClientsStore()
const commentsStore = useCommentsStore()
const auth          = useAuthStore()
const { contacts, loading, error } = storeToRefs(store)
const { clients } = storeToRefs(clientsStore)
const route  = useRoute()
const router = useRouter()

onMounted(() => { store.fetch(); clientsStore.fetch() })

const fromClientId   = computed(() => route.query.fromClient ?? null)
const fromClientName = computed(() => route.query.fromName   ?? 'Client')
function goBack() { router.push({ path: '/clients', query: { id: fromClientId.value } }) }

const search     = ref('')
const selectedId = ref(null)
const activeTab  = ref('infos')

watch(contacts, (list) => {
  if (route.query.id && list.length && !selectedId.value) {
    const id = Number(route.query.id)
    if (list.find(c => c.id === id)) { selectedId.value = id; activeTab.value = 'infos' }
  }
}, { immediate: true })

const ROLES = [
  { key: 'principal',   label: 'Principal',   cls: 'bg-blue-100 text-blue-700' },
  { key: 'secondaire',  label: 'Secondaire',  cls: 'bg-slate-100 text-slate-600' },
  { key: 'facturation', label: 'Facturation', cls: 'bg-amber-100 text-amber-700' },
  { key: 'technique',   label: 'Technique',   cls: 'bg-blue-100 text-blue-700' },
  { key: 'autre',       label: 'Autre',       cls: 'bg-gray-100 text-gray-500' },
]
const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.key, r]))

// Clients entreprise pour la relation
const entrepriseClients = computed(() =>
  clients.value
    .filter(c => c.type === 'entreprise')
    .sort((a, b) => (a.raison_sociale ?? '').localeCompare(b.raison_sociale ?? '', 'fr'))
)

// ── Inline edit ───────────────────────────────────────────────────────────────
const inlineEditing = ref(false)
const inlineSaving  = ref(false)
const inlineDraft   = ref({})

function startInlineEdit() {
  const c = selected.value
  inlineDraft.value = {
    prenom:    c.prenom     ?? '',
    nom:       c.nom        ?? '',
    email:     c.email      ?? '',
    telephone: c.telephone  ?? '',
    poste:     c.poste      ?? '',
    entreprise: c.entreprise ?? '',
    ville:     c.ville      ?? '',
    role:      c.role       ?? '',
  }
  activeTab.value = 'infos'
  inlineEditing.value = true
}

function cancelInlineEdit() { inlineEditing.value = false }

async function saveInlineEdit() {
  inlineSaving.value = true
  try {
    await store.patch(selected.value.id, inlineDraft.value)
    inlineEditing.value = false
  } finally {
    inlineSaving.value = false
  }
}

// ── Drawer (create only) ──────────────────────────────────────────────────────
const drawerOpen   = ref(false)
const drawerSaving = ref(false)
const draft        = ref({})

function emptyDraft() {
  return { prenom: '', nom: '', email: '', telephone: '', poste: '',
           entreprise: '', ville: '', role: '', notes: '' }
}

function openCreate(prefill = {}) {
  draft.value = { ...emptyDraft(), ...prefill }
  drawerOpen.value = true
}

function closeDrawer() { drawerOpen.value = false }

async function submitDrawer() {
  drawerSaving.value = true
  try {
    const raw = await store.create(draft.value)
    if (raw) { selectedId.value = raw.id; activeTab.value = 'infos' }
    closeDrawer()
  } finally {
    drawerSaving.value = false
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
const confirmDelete = ref(false)
const deleteSaving  = ref(false)

async function doDelete() {
  deleteSaving.value = true
  try {
    await store.delete(selected.value.id)
    selectedId.value = null
    confirmDelete.value = false
  } finally {
    deleteSaving.value = false
  }
}

// ── List ──────────────────────────────────────────────────────────────────────
const filtered = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return contacts.value
  return contacts.value.filter(c =>
    `${c.prenom} ${c.nom}`.toLowerCase().includes(q) ||
    (c.email ?? '').toLowerCase().includes(q) ||
    (c.entreprise ?? '').toLowerCase().includes(q) ||
    (c.ville ?? '').toLowerCase().includes(q)
  )
})

const selected = computed(() => contacts.value.find(c => c.id === selectedId.value) ?? null)

function selectItem(c) { selectedId.value = c.id; activeTab.value = 'infos'; inlineEditing.value = false }

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(d) {
  return new Date(d).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function initials(c) { return `${(c.prenom?.[0] ?? '')}${(c.nom?.[0] ?? '')}`.toUpperCase() || '?' }
function initialsStr(str) {
  if (!str) return '?'
  return str.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const AVATAR_COLORS = ['#06b6d4','#3b82f6','#3b82f6','#3b82f6','#f59e0b','#f97316','#ec4899']
function avatarColor(c) { return AVATAR_COLORS[c.id % AVATAR_COLORS.length] }

const TABS = [{ key: 'infos', label: 'Informations' }, { key: 'notes', label: 'Notes' }]

// ── Notes ─────────────────────────────────────────────────────────────────────
const notesSubTab  = ref('note')
const notesEditing = ref(false)
const notesSaving  = ref(false)
const notesText    = ref('')

watch(selected, (c) => {
  notesText.value    = c?.notes ?? ''
  notesEditing.value = false
  notesSubTab.value  = 'note'
}, { immediate: true })

watch(() => selected.value?.id, (id) => {
  if (id) commentsStore.fetch('contact_notes', id)
}, { immediate: true })

const notesHistory = computed(() => {
  if (!selected.value) return []
  return commentsStore.cache[`contact_notes_${selected.value.id}`] ?? []
})

function cancelNotes() {
  notesEditing.value = false
  notesText.value    = selected.value?.notes ?? ''
}

async function saveNotes() {
  notesSaving.value = true
  try {
    await store.patch(selected.value.id, { notes: notesText.value })
    try {
      await commentsStore.create('contact_notes', selected.value.id, auth.user.name,
        notesText.value.trim() || '(Note effacée)')
    } catch { /* historique non critique */ }
    notesEditing.value = false
  } finally {
    notesSaving.value = false
  }
}

const inputCls = 'w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white'

defineExpose({ openCreate })
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Page header ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <button v-if="fromClientId" @click="goBack"
        class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors mr-1">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
          <path fill-rule="evenodd" d="M14 8a.75.75 0 0 1-.75.75H4.56l3.22 3.22a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 1.06L4.56 7.25H13.25A.75.75 0 0 1 14 8Z" clip-rule="evenodd"/>
        </svg>
        {{ fromClientName }}
      </button>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-5.5-2.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10 12a5.99 5.99 0 0 0-4.793 2.39A6.483 6.483 0 0 0 10 16.5a6.483 6.483 0 0 0 4.793-2.11A5.99 5.99 0 0 0 10 12Z" clip-rule="evenodd"/>
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Contacts</h1>
      <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{{ contacts.length }}</span>
      <button @click="openCreate()"
        class="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-lg transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
        </svg>
        Nouveau contact
      </button>
    </div>

    <!-- ── Master-detail ── -->
    <div class="flex flex-1 overflow-hidden">

      <!-- ── Left panel ── -->
      <div class="w-[280px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div class="p-3 border-b border-gray-100">
          <div class="relative">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
                 class="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/>
            </svg>
            <input v-model="search" type="text" placeholder="Rechercher…"
              class="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-gray-50"/>
          </div>
        </div>
        <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">Chargement…</div>
        <div v-else-if="error" class="flex-1 flex items-center justify-center px-4"><p class="text-sm text-red-500">{{ error }}</p></div>
        <div v-else class="flex-1 overflow-y-auto">
          <div v-for="c in filtered" :key="c.id"
            class="flex items-center gap-3 px-3 py-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors border-l-[3px]"
            :class="selectedId === c.id ? 'bg-cyan-50 border-l-cyan-500' : 'border-l-transparent'"
            @click="selectItem(c)">
            <div class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                 :style="{ background: avatarColor(c) }">{{ initials(c) }}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-sm font-medium text-gray-900 truncate">{{ c.prenom }} {{ c.nom }}</span>
                <span v-if="c.role" class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                  :class="ROLE_MAP[c.role]?.cls ?? 'bg-gray-100 text-gray-500'">
                  {{ ROLE_MAP[c.role]?.label ?? c.role }}
                </span>
              </div>
              <div class="text-[11px] text-gray-400 truncate mt-0.5">{{ [c.poste, c.entreprise].filter(Boolean).join(' · ') }}</div>
            </div>
          </div>
          <div v-if="filtered.length === 0" class="p-6 text-center text-sm text-gray-400">Aucun contact trouvé</div>
        </div>
      </div>

      <!-- ── Right panel ── -->
      <div class="flex-1 overflow-hidden flex flex-col bg-gray-100">
        <div v-if="!selected" class="flex-1 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-14 h-14 mx-auto mb-3 opacity-30">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>
            </svg>
            <p class="text-sm">Sélectionnez un contact</p>
          </div>
        </div>

        <template v-else>

          <!-- Header -->
          <div class="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
            <div class="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
              <span>Contacts</span><span>›</span>
              <span class="text-gray-700 font-medium">{{ selected.prenom }} {{ selected.nom }}</span>
            </div>
            <div class="flex items-center gap-4">
              <div class="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white flex-shrink-0 shadow-sm"
                   :style="{ background: avatarColor(selected) }">{{ initials(selected) }}</div>
              <div class="flex-1 min-w-0">
                <h2 class="text-xl font-bold text-gray-900">{{ selected.prenom }} {{ selected.nom }}</h2>
                <div class="text-sm text-gray-500 mt-0.5">{{ [selected.poste, selected.entreprise].filter(Boolean).join(' · ') }}</div>
                <div class="flex flex-wrap gap-1.5 mt-2">
                  <span v-if="selected.role" class="text-[11px] px-2 py-0.5 rounded-full font-semibold border"
                    :class="ROLE_MAP[selected.role]?.cls ?? 'bg-gray-100 text-gray-500'">
                    {{ ROLE_MAP[selected.role]?.label ?? selected.role }}
                  </span>
                  <span v-if="selected.ville" class="text-[11px] text-gray-400">{{ selected.ville }}</span>
                </div>
              </div>
              <div class="flex flex-col gap-1.5 flex-shrink-0">
                <button @click="confirmDelete = true"
                  class="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                    <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clip-rule="evenodd"/>
                  </svg>
                  Supprimer
                </button>
              </div>
            </div>
          </div>

          <!-- Tabs -->
          <div class="bg-white border-b border-gray-200 px-6 flex-shrink-0">
            <div class="flex">
              <button v-for="t in TABS" :key="t.key"
                class="px-5 py-3 text-[13px] font-semibold border-b-2 transition-colors -mb-px uppercase tracking-wide"
                :class="activeTab === t.key ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-gray-400 hover:text-gray-600'"
                @click="activeTab = t.key">{{ t.label }}</button>
            </div>
          </div>

          <!-- Tab content -->
          <div class="flex-1 overflow-y-auto p-6">

            <!-- ── Informations ── -->
            <template v-if="activeTab === 'infos'">
              <div class="bg-white rounded-xl shadow-sm overflow-hidden" :class="inlineEditing ? 'ring-2 ring-cyan-400' : ''">
                <div class="px-5 py-3 border-b flex items-center gap-2"
                  :class="inlineEditing ? 'border-cyan-100 bg-cyan-50' : 'border-gray-100'">
                  <span class="text-[#e65100]">▲</span>
                  <span class="text-sm font-semibold flex-1" :class="inlineEditing ? 'text-cyan-700' : 'text-gray-700'">Coordonnées</span>
                  <button v-if="!inlineEditing" @click="startInlineEdit"
                    class="inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
                      <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/>
                    </svg>
                    Modifier
                  </button>
                  <span v-else class="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-cyan-50 text-cyan-600 font-semibold rounded-lg border border-cyan-200">
                    ✎ En cours
                  </span>
                </div>

                <!-- Display mode -->
                <div v-if="!inlineEditing" class="p-6 grid grid-cols-2 gap-x-10 gap-y-5">
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Prénom</div>
                    <div class="text-gray-900">{{ selected.prenom || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Nom</div>
                    <div class="text-gray-900 font-medium">{{ selected.nom || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Email</div>
                    <a v-if="selected.email" :href="`mailto:${selected.email}`" class="text-cyan-600 hover:underline text-sm">{{ selected.email }}</a>
                    <span v-else class="text-gray-400">—</span>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Téléphone</div>
                    <a v-if="selected.telephone" :href="`tel:${selected.telephone}`" class="text-gray-900 text-sm">{{ selected.telephone }}</a>
                    <span v-else class="text-gray-400">—</span>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Poste</div>
                    <div class="text-gray-900">{{ selected.poste || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Rôle</div>
                    <span v-if="selected.role" class="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                      :class="ROLE_MAP[selected.role]?.cls ?? 'bg-gray-100 text-gray-500'">
                      {{ ROLE_MAP[selected.role]?.label ?? selected.role }}
                    </span>
                    <span v-else class="text-gray-400">—</span>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Entreprise</div>
                    <div class="text-gray-900">{{ selected.entreprise || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Ville</div>
                    <div class="text-gray-900">{{ selected.ville || '—' }}</div>
                  </div>
                  <div>
                    <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Ajouté le</div>
                    <div class="text-gray-500 text-sm">{{ formatDate(selected.created_at) }}</div>
                  </div>
                </div>

                <!-- Edit mode (inline) -->
                <div v-else class="p-6 space-y-4">
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Prénom</label>
                      <input v-model="inlineDraft.prenom" type="text" :class="inputCls" autofocus/>
                    </div>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Nom</label>
                      <input v-model="inlineDraft.nom" type="text" :class="inputCls"/>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                      <input v-model="inlineDraft.email" type="email" :class="inputCls"/>
                    </div>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Téléphone</label>
                      <input v-model="inlineDraft.telephone" type="text" :class="inputCls"/>
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Poste</label>
                      <input v-model="inlineDraft.poste" type="text" placeholder="ex: Directeur commercial" :class="inputCls"/>
                    </div>
                    <div>
                      <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Ville</label>
                      <input v-model="inlineDraft.ville" type="text" :class="inputCls"/>
                    </div>
                  </div>
                  <div>
                    <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Entreprise</label>
                    <select v-model="inlineDraft.entreprise" :class="inputCls">
                      <option value="">— Aucune —</option>
                      <option v-for="c in entrepriseClients" :key="c.id" :value="c.raison_sociale">
                        {{ c.raison_sociale }}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Rôle</label>
                    <div class="flex flex-wrap gap-2">
                      <button v-for="r in ROLES" :key="r.key"
                        @click="inlineDraft.role = inlineDraft.role === r.key ? '' : r.key"
                        class="text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors"
                        :class="inlineDraft.role === r.key ? `${r.cls} border-transparent` : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'">
                        {{ r.label }}
                      </button>
                    </div>
                  </div>
                  <div class="flex gap-2 pt-2 justify-end border-t border-gray-100">
                    <button @click="cancelInlineEdit"
                      class="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      Annuler
                    </button>
                    <button @click="saveInlineEdit" :disabled="inlineSaving"
                      class="px-4 py-2 text-sm font-semibold bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors">
                      {{ inlineSaving ? 'Enregistrement…' : 'Sauvegarder' }}
                    </button>
                  </div>
                </div>
              </div>
              <CommentSection record-type="contacts" :record-id="selected.id" />
            </template>

            <!-- ── Notes ── -->
            <template v-if="activeTab === 'notes'">
              <!-- Sub-tabs -->
              <div class="flex gap-1 bg-white rounded-xl shadow-sm p-1.5 mb-4">
                <button @click="notesSubTab = 'note'"
                  class="flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors"
                  :class="notesSubTab === 'note' ? 'bg-gray-100 text-gray-800' : 'text-gray-400 hover:text-gray-600'">
                  Note
                </button>
                <button @click="notesSubTab = 'historique'"
                  class="flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors"
                  :class="notesSubTab === 'historique' ? 'bg-gray-100 text-gray-800' : 'text-gray-400 hover:text-gray-600'">
                  Historique
                  <span v-if="notesHistory.length" class="ml-1 text-[10px] text-gray-400">({{ notesHistory.length }})</span>
                </button>
              </div>

              <!-- Note -->
              <div v-if="notesSubTab === 'note'" class="bg-white rounded-xl shadow-sm overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <span class="text-[#e65100]">▲</span>
                  <span class="text-sm font-semibold text-gray-700">Notes</span>
                  <button v-if="!notesEditing" @click="notesEditing = true"
                    class="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
                      <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/>
                    </svg>
                    Modifier
                  </button>
                </div>
                <div class="p-6">
                  <template v-if="!notesEditing">
                    <p v-if="notesText" class="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{{ notesText }}</p>
                    <p v-else class="text-sm text-gray-400 italic">Aucune note pour ce contact.</p>
                  </template>
                  <template v-else>
                    <textarea v-model="notesText" rows="10" placeholder="Saisissez vos notes…"
                      class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 resize-none"/>
                    <div class="flex gap-2 mt-3 justify-end">
                      <button @click="cancelNotes"
                        class="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                        Annuler
                      </button>
                      <button @click="saveNotes" :disabled="notesSaving"
                        class="px-4 py-2 text-sm font-semibold bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors">
                        {{ notesSaving ? 'Enregistrement…' : 'Sauvegarder' }}
                      </button>
                    </div>
                  </template>
                </div>
              </div>

              <!-- Historique -->
              <div v-if="notesSubTab === 'historique'" class="bg-white rounded-xl shadow-sm overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <span class="text-[#e65100]">▲</span>
                  <span class="text-sm font-semibold text-gray-700">Historique des modifications</span>
                </div>
                <div class="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                  <div v-if="notesHistory.length === 0" class="px-5 py-8 text-center text-sm text-gray-400">
                    Aucune modification enregistrée. Les sauvegardes de notes apparaîtront ici.
                  </div>
                  <div v-for="h in [...notesHistory].reverse()" :key="h.id" class="px-5 py-4">
                    <div class="flex items-center gap-2 mb-2">
                      <div class="w-6 h-6 rounded-full bg-cyan-100 flex items-center justify-center text-[9px] font-bold text-cyan-600 flex-shrink-0">
                        {{ initialsStr(h.author) }}
                      </div>
                      <span class="text-xs font-semibold text-gray-700">{{ h.author }}</span>
                      <span class="text-[11px] text-gray-400 ml-auto">{{ formatTime(h.date_created) }}</span>
                    </div>
                    <p class="text-sm text-gray-600 leading-relaxed whitespace-pre-line line-clamp-5 bg-gray-50 rounded-lg p-3 border border-gray-100">{{ h.text }}</p>
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
          <div class="relative w-[440px] bg-white h-full shadow-2xl flex flex-col">
            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-cyan-600">
              <h2 class="text-base font-semibold text-white">Nouveau contact</h2>
              <button @click="closeDrawer" class="text-cyan-100 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
                </svg>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-6 space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Prénom</label>
                  <input v-model="draft.prenom" type="text" :class="inputCls"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Nom</label>
                  <input v-model="draft.nom" type="text" :class="inputCls"/>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                  <input v-model="draft.email" type="email" :class="inputCls"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Téléphone</label>
                  <input v-model="draft.telephone" type="text" :class="inputCls"/>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Poste</label>
                  <input v-model="draft.poste" type="text" placeholder="ex: Directeur commercial" :class="inputCls"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Ville</label>
                  <input v-model="draft.ville" type="text" :class="inputCls"/>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Entreprise</label>
                <select v-model="draft.entreprise" :class="inputCls">
                  <option value="">— Aucune —</option>
                  <option v-for="c in entrepriseClients" :key="c.id" :value="c.raison_sociale">
                    {{ c.raison_sociale }}
                  </option>
                </select>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Rôle</label>
                <div class="flex flex-wrap gap-2">
                  <button v-for="r in ROLES" :key="r.key"
                    @click="draft.role = draft.role === r.key ? '' : r.key"
                    class="text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors"
                    :class="draft.role === r.key ? `${r.cls} border-transparent` : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'">
                    {{ r.label }}
                  </button>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Notes</label>
                <textarea v-model="draft.notes" rows="3" :class="inputCls" class="resize-none"/>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-gray-100 flex gap-2">
              <button @click="submitDrawer" :disabled="drawerSaving"
                class="flex-1 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                {{ drawerSaving ? 'Enregistrement…' : 'Créer' }}
              </button>
              <button @click="closeDrawer"
                class="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                Annuler
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Confirm delete ── -->
    <Teleport to="body">
      <div v-if="confirmDelete" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" @click="confirmDelete = false"/>
        <div class="relative bg-white rounded-2xl shadow-xl p-6 w-80">
          <h3 class="font-bold text-gray-900 mb-1">Supprimer ce contact ?</h3>
          <p class="text-sm text-gray-500 mb-5">Cette action est irréversible.</p>
          <div class="flex gap-2">
            <button @click="doDelete" :disabled="deleteSaving"
              class="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              {{ deleteSaving ? 'Suppression…' : 'Supprimer' }}
            </button>
            <button @click="confirmDelete = false"
              class="flex-1 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg transition-colors">
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
