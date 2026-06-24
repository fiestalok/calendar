<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useClientsStore } from '../stores/clients'
import { useContactsStore } from '../stores/contacts'
import { useCommentsStore } from '../stores/comments'
import { useAuthStore } from '../stores/auth'
import { uploadFile, getFactures, getFileUrl, getReservationsByClient } from '../api/directus'
import CommentSection from '../components/CommentSection.vue'

const store         = useClientsStore()
const contactsStore = useContactsStore()
const commentsStore = useCommentsStore()
const auth          = useAuthStore()
const { clients, loading, error } = storeToRefs(store)
const { contacts } = storeToRefs(contactsStore)
const route  = useRoute()
const router = useRouter()

onMounted(() => { store.fetch(); contactsStore.fetch() })

const search     = ref('')
const typeFilter = ref('all')
const selectedId = ref(null)
const activeTab  = ref('infos')

watch(clients, (list) => {
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
const ROLE_MAP   = Object.fromEntries(ROLES.map(r => [r.key, r]))
const ROLE_ORDER = Object.fromEntries(ROLES.map((r, i) => [r.key, i]))

// ── Contacts liés ─────────────────────────────────────────────────────────────
const clientContacts = computed(() => {
  if (!selected.value || selected.value.type !== 'entreprise') return []
  const name = selected.value.raison_sociale?.toLowerCase()
  if (!name) return []
  return contacts.value
    .filter(c => c.entreprise?.toLowerCase() === name)
    .sort((a, b) => {
      const ra = ROLE_ORDER[a.role] ?? 99
      const rb = ROLE_ORDER[b.role] ?? 99
      if (ra !== rb) return ra - rb
      return `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr')
    })
})

function goToContact(contact) {
  router.push({
    path: '/contacts',
    query: {
      id:         contact.id,
      fromClient: selected.value.id,
      fromName:   selected.value.raison_sociale ?? displayName(selected.value),
    },
  })
}

// ── Modal ajout contact ───────────────────────────────────────────────────────
const addContactOpen   = ref(false)
const addContactSaving = ref(false)
const addContactDraft  = ref({})

function openAddContact() {
  addContactDraft.value = {
    prenom: '', nom: '', email: '', telephone: '', poste: '',
    entreprise: selected.value.raison_sociale ?? '',
    role: 'principal', ville: '', notes: '',
  }
  addContactOpen.value = true
}

async function submitAddContact() {
  addContactSaving.value = true
  try {
    await contactsStore.create(addContactDraft.value)
    addContactOpen.value = false
  } finally {
    addContactSaving.value = false
  }
}

// ── Inline edit ───────────────────────────────────────────────────────────────
const inlineEditing = ref(false)
const inlineSaving  = ref(false)
const inlineDraft   = ref({})

function startInlineEdit() {
  const c = selected.value
  inlineDraft.value = {
    typeClient:   c.type,
    first_name:   c.prenom         ?? '',
    last_name:    c.nom            ?? '',
    company_name: c.raison_sociale ?? '',
    email:        c.email          ?? '',
    phone:        c.telephone      ?? '',
    address:      c.adresse        ?? '',
    city:         c.ville          ?? '',
    zip_code:     c.code_postal    ?? '',
    siret:        c.siret          ?? '',
    secteur:      c.secteur        ?? '',
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

// ── Modal create ──────────────────────────────────────────────────────────────
const modalOpen   = ref(false)
const modalSaving = ref(false)
const draft = ref({})

function emptyDraft() {
  return {
    typeClient: 'particulier', first_name: '', last_name: '', company_name: '',
    email: '', phone: '', address: '', city: '', zip_code: '', siret: '', secteur: '', notes: '',
  }
}

function openCreate() { draft.value = emptyDraft(); modalOpen.value = true }
function closeModal() { modalOpen.value = false }

async function submitModal() {
  modalSaving.value = true
  try {
    const created = await store.create(draft.value)
    if (created) { selectedId.value = created.id; activeTab.value = 'infos' }
    closeModal()
  } finally {
    modalSaving.value = false
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

// ── List / filter ─────────────────────────────────────────────────────────────
const filteredClients = computed(() => {
  let list = clients.value
  if (typeFilter.value !== 'all') list = list.filter(c => c.type === typeFilter.value)
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(c =>
      displayName(c).toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.ville ?? '').toLowerCase().includes(q)
    )
  }
  return list
})

const selected = computed(() => clients.value.find(c => c.id === selectedId.value) ?? null)

const TABS = [
  { key: 'infos', label: 'Informations' },
  { key: 'notes', label: 'Notes' },
  { key: 'devis', label: 'Devis' },
]

function selectClient(client) {
  selectedId.value = client.id
  activeTab.value = 'infos'
  inlineEditing.value = false
}

function displayName(c) {
  if (c.type === 'entreprise') return c.raison_sociale || [c.prenom, c.nom].filter(Boolean).join(' ') || '—'
  return [c.prenom, c.nom].filter(Boolean).join(' ') || c.raison_sociale || '—'
}

function initials(c) {
  const name = displayName(c)
  if (name === '—') return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function initialsStr(str) {
  if (!str) return '?'
  return str.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function formatCurrency(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n ?? 0)
}

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
  if (id) commentsStore.fetch('client_notes', id)
}, { immediate: true })

const notesHistory = computed(() => {
  if (!selected.value) return []
  return commentsStore.cache[`client_notes_${selected.value.id}`] ?? []
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
      await commentsStore.create('client_notes', selected.value.id, auth.user.name,
        notesText.value.trim() || '(Note effacée)')
    } catch { /* historique non critique */ }
    notesEditing.value = false
  } finally {
    notesSaving.value = false
  }
}

// ── DEVIS_STATUS ──────────────────────────────────────────────────────────────
const DEVIS_STATUS = {
  realise:  { label: 'Devis réalisé',  cls: 'bg-slate-100 text-slate-600' },
  confirme: { label: 'Devis confirmé', cls: 'bg-blue-100 text-blue-700' },
  facture:  { label: 'Facturé',        cls: 'bg-blue-100 text-blue-700' },
}

// ── Devis ─────────────────────────────────────────────────────────────────────
const devisModalOpen = ref(false)
const devisSaving    = ref(false)
const devisDraft     = ref({})
const devisFileRef   = ref(null)
const devisFileName  = ref('')
const factures       = ref([])
const factureMode    = ref('manual') // 'select' | 'manual'
const devisMode      = ref('create') // 'create' | 'edit'
const devisEditId    = ref(null)

function openDevisCreate() {
  devisMode.value      = 'create'
  devisEditId.value    = null
  devisDraft.value     = { numero: '', description: '', montant: '', valid_until: '', statut: 'realise', facture_ref: '', facture_id: '', current_fichier_id: null }
  devisFileName.value  = ''
  factureMode.value    = 'manual'
  devisModalOpen.value = true
  getFactures().then(list => { factures.value = list ?? [] })
}

function openDevisEdit(d) {
  devisMode.value   = 'edit'
  devisEditId.value = d.id
  devisDraft.value  = {
    numero:             d.numero        ?? '',
    description:        d.description   ?? '',
    montant:            d.montant       ?? '',
    valid_until:        d.date_validite ? d.date_validite.split('T')[0] : '',
    statut:             d.statut        ?? 'realise',
    facture_ref:        d.facture_ref   ?? '',
    facture_id:         d.facture_id    ?? '',
    current_fichier_id: d.fichier_id    ?? null,
  }
  devisFileName.value  = ''
  factureMode.value    = d.facture_id ? 'select' : 'manual'
  devisModalOpen.value = true
  getFactures().then(list => { factures.value = list ?? [] })
}

function clearDevisFile() {
  if (devisFileRef.value) devisFileRef.value.value = ''
  devisFileName.value = ''
}

async function submitDevisModal() {
  devisSaving.value = true
  try {
    let fileId = null
    if (devisFileRef.value?.files?.[0]) {
      const fd = new FormData()
      fd.append('file', devisFileRef.value.files[0])
      const uploaded = await uploadFile(fd)
      fileId = uploaded?.id ?? null
    }
    const d = devisDraft.value
    const payload = { statut: d.statut || 'realise' }
    if (d.numero)      payload.numero      = d.numero
    if (d.description) payload.description = d.description
    if (d.montant !== '') payload.montant  = Number(d.montant)
    if (d.valid_until) payload.valid_until = d.valid_until
    if (d.facture_ref) payload.facture_ref = d.facture_ref
    if (d.facture_id)  payload.facture     = d.facture_id
    if (fileId)        payload.fichier     = fileId

    if (devisMode.value === 'create') {
      payload.client = selected.value.id
      await store.addDevis(selected.value.id, payload)
    } else {
      await store.patchDevis(selected.value.id, devisEditId.value, payload)
    }
    devisModalOpen.value = false
  } finally {
    devisSaving.value = false
  }
}

// ── Contact unlink ────────────────────────────────────────────────────────────
const unlinkTarget  = ref(null)
const unlinkModal   = ref(false)
const unlinkRunning = ref(false)

function openUnlink(contact, event) {
  event.stopPropagation()
  unlinkTarget.value = contact
  unlinkModal.value  = true
}

async function doUnlink(alsoDelete) {
  unlinkRunning.value = true
  try {
    if (alsoDelete) {
      await contactsStore.delete(unlinkTarget.value.id)
    } else {
      await contactsStore.patch(unlinkTarget.value.id, { entreprise: null })
    }
    unlinkModal.value  = false
    unlinkTarget.value = null
  } finally {
    unlinkRunning.value = false
  }
}

// ── Réservations du client (tab Devis) ────────────────────────────────────────
const clientReservations  = ref([])
const reservationsLoading = ref(false)
const selectedReservation = ref(null)

const RESERVATION_STATUS = {
  en_attente:     { label: 'En attente',    cls: 'bg-amber-100 text-amber-700' },
  devis_realise:  { label: 'Devis réalisé', cls: 'bg-blue-100 text-blue-700' },
  devis_confirme: { label: 'Confirmée',     cls: 'bg-blue-100 text-blue-700' },
  terminee:       { label: 'Terminée',      cls: 'bg-gray-100 text-gray-600' },
  annulee:        { label: 'Annulée',       cls: 'bg-red-100 text-red-600' },
}

watch([selectedId, activeTab], async ([id, tab]) => {
  if (!id || tab !== 'devis') return
  reservationsLoading.value = true
  clientReservations.value  = await getReservationsByClient(id)
  reservationsLoading.value = false
})

const linkedDevis = computed(() => {
  if (!selectedReservation.value || !selected.value) return null
  return selected.value.devis?.find(d => d.reservation_id === selectedReservation.value.id) ?? null
})

function openReservationDetail(r) { selectedReservation.value = r }

const allDevisRows = computed(() => {
  const manual = (selected.value?.devis ?? []).map(d => ({
    _type: 'manuel',
    id: `m-${d.id}`,
    date: d.date,
    description: d.description,
    montant: d.montant,
    statut: d.statut,
    statusCls: DEVIS_STATUS[d.statut]?.cls ?? 'bg-gray-100 text-gray-500',
    statusLabel: DEVIS_STATUS[d.statut]?.label ?? d.statut ?? '—',
    fichier_devis: d.fichier_id,
    fichier_devis_signe: null,
    fichier_facture: null,
    facture_ref: d.facture_ref,
    facture_id: d.facture_id,
    facture_numero: d.facture_numero,
    numero: d.numero,
    _raw: d,
  }))

  const generated = clientReservations.value
    .filter(r => r.fichier_devis)
    .map(r => ({
      _type: 'genere',
      id: `r-${r.id}`,
      date: r.date_start,
      description: r.notes,
      montant: r.total_price,
      statut: r.status,
      statusCls: RESERVATION_STATUS[r.status]?.cls ?? 'bg-gray-100 text-gray-500',
      statusLabel: RESERVATION_STATUS[r.status]?.label ?? r.status ?? '—',
      fichier_devis: r.fichier_devis,
      fichier_devis_signe: r.fichier_devis_signe,
      fichier_facture: r.fichier_facture,
      facture_ref: null,
      facture_id: null,
      facture_numero: null,
      numero: null,
      _raw: r,
    }))

  return [...manual, ...generated].sort((a, b) => new Date(b.date) - new Date(a.date))
})

// ── Input helper class ────────────────────────────────────────────────────────
const inputCls = 'w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white'
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Page header ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z"/>
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Clients</h1>
      <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{{ clients.length }}</span>
      <button @click="openCreate"
        class="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
        </svg>
        Nouveau client
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
              class="w-full text-sm pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"/>
          </div>
          <div class="flex gap-1">
            <button v-for="f in [{ value: 'all', label: 'Tous' }, { value: 'particulier', label: 'Particulier' }, { value: 'entreprise', label: 'Entreprise' }]"
              :key="f.value"
              class="flex-1 text-[11px] py-1 px-1.5 rounded-md font-semibold transition-colors"
              :class="typeFilter === f.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'"
              @click="typeFilter = f.value">{{ f.label }}</button>
          </div>
        </div>
        <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">Chargement…</div>
        <div v-else-if="error" class="flex-1 flex items-center justify-center px-4 text-center">
          <p class="text-sm text-red-500">{{ error }}</p>
        </div>
        <div v-else class="flex-1 overflow-y-auto">
          <div v-for="client in filteredClients" :key="client.id"
            class="flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition-colors border-l-[3px]"
            :class="selectedId === client.id ? 'bg-blue-50 border-l-blue-600' : 'border-l-transparent'"
            @click="selectClient(client)">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              :class="client.type === 'entreprise' ? 'bg-blue-100 text-blue-700' : 'bg-blue-100 text-blue-700'">
              {{ initials(client) }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 truncate">{{ displayName(client) }}</div>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  :class="client.type === 'entreprise' ? 'bg-blue-100 text-blue-600' : 'bg-blue-100 text-blue-600'">
                  {{ client.type === 'entreprise' ? 'Entreprise' : 'Particulier' }}
                </span>
                <span class="text-[11px] text-gray-400 truncate">{{ client.ville }}</span>
              </div>
            </div>
          </div>
          <div v-if="filteredClients.length === 0" class="p-6 text-center text-sm text-gray-400">Aucun résultat</div>
        </div>
      </div>

      <!-- ── Right panel ── -->
      <div class="flex-1 overflow-hidden flex flex-col bg-gray-100">

        <div v-if="!selected" class="flex-1 flex items-center justify-center">
          <div class="text-center text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" class="w-14 h-14 mx-auto mb-3 opacity-30">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/>
            </svg>
            <p class="text-sm">Sélectionnez un client</p>
          </div>
        </div>

        <template v-else>

          <!-- ── Detail header ── -->
          <div class="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
            <div class="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
              <span>Clients</span><span>›</span>
              <span class="text-gray-700 font-medium">{{ displayName(selected) }}</span>
              <template v-if="route.query.fromReservation">
                <span>›</span>
                <button class="flex items-center gap-1 text-blue-500 hover:text-blue-700 font-semibold transition-colors"
                  @click="router.back()">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                    <path fill-rule="evenodd" d="M14 8a.75.75 0 0 1-.75.75H4.56l3.22 3.22a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 1.06L4.56 7.25h8.69A.75.75 0 0 1 14 8Z" clip-rule="evenodd"/>
                  </svg>
                  Retour à la réservation n°{{ route.query.fromReservation }}
                </button>
              </template>
            </div>
            <div class="flex items-center gap-4">
              <div class="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
                :class="selected.type === 'entreprise' ? 'bg-blue-100 text-blue-700' : 'bg-blue-100 text-blue-700'">
                {{ initials(selected) }}
              </div>
              <div class="flex-1 min-w-0">
                <h2 class="text-xl font-bold text-gray-900 leading-tight">{{ displayName(selected) }}</h2>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold border"
                    :class="selected.type === 'entreprise' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-50 text-blue-700 border-blue-200'">
                    {{ selected.type === 'entreprise' ? 'Entreprise' : 'Particulier' }}
                  </span>
                  <span v-if="selected.secteur" class="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">{{ selected.secteur }}</span>
                  <span v-if="selected.ville" class="text-[11px] text-gray-400">{{ selected.ville }}</span>
                </div>
              </div>
              <div class="flex gap-2 flex-shrink-0">
                <button @click="confirmDelete = true"
                  class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-semibold rounded-lg transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                    <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clip-rule="evenodd"/>
                  </svg>
                  Supprimer
                </button>
              </div>
            </div>
            <div class="flex items-center gap-2 mt-3 ml-[60px]">
              <a v-if="selected.telephone" :href="'tel:' + selected.telephone"
                class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-blue-500">
                  <path fill-rule="evenodd" d="M3.5 2A1.5 1.5 0 0 0 2 3.5V5c0 5.523 4.477 10 10 10h1.5a1.5 1.5 0 0 0 1.5-1.5v-1.232a1.5 1.5 0 0 0-1.077-1.443l-2.317-.664a1.5 1.5 0 0 0-1.661.627l-.267.4a1.5 1.5 0 0 1-1.899.518 8.5 8.5 0 0 1-3.925-3.925 1.5 1.5 0 0 1 .518-1.9l.4-.266a1.5 1.5 0 0 0 .627-1.661L5.73 3.077A1.5 1.5 0 0 0 4.298 2H3.5Z" clip-rule="evenodd"/>
                </svg>
                {{ selected.telephone }}
              </a>
              <a v-if="selected.email" :href="'mailto:' + selected.email"
                class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-blue-500">
                  <path d="M2.5 3A1.5 1.5 0 0 0 1 4.5v.793c.026.009.051.02.076.032L7.674 8.51c.206.1.446.1.652 0l6.598-3.185A.755.755 0 0 1 15 5.293V4.5A1.5 1.5 0 0 0 13.5 3h-11Z"/>
                  <path d="M15 6.954 8.978 9.86a2.25 2.25 0 0 1-1.956 0L1 6.954V11.5A1.5 1.5 0 0 0 2.5 13h11a1.5 1.5 0 0 0 1.5-1.5V6.954Z"/>
                </svg>
                {{ selected.email }}
              </a>
            </div>
          </div>

          <!-- ── Tabs ── -->
          <div class="bg-white border-b border-gray-200 px-6 flex-shrink-0">
            <div class="flex">
              <button v-for="t in TABS" :key="t.key"
                class="px-5 py-3 text-[13px] font-semibold border-b-2 transition-colors -mb-px uppercase tracking-wide"
                :class="activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'"
                @click="activeTab = t.key">{{ t.label }}</button>
            </div>
          </div>

          <!-- ── Tab content ── -->
          <div class="flex-1 overflow-y-auto p-6">

            <!-- ── Informations ── -->
            <template v-if="activeTab === 'infos'">

              <!-- Entreprise : 2 colonnes -->
              <div v-if="selected.type === 'entreprise'" class="grid grid-cols-[1fr_320px] gap-5">

                <!-- Colonne gauche : infos + commentaires -->
                <div class="space-y-4">
                  <div class="bg-white rounded-xl shadow-sm overflow-hidden" :class="inlineEditing ? 'ring-2 ring-blue-400' : ''">
                    <div class="px-5 py-3 border-b flex items-center gap-2"
                      :class="inlineEditing ? 'border-blue-100 bg-blue-50' : 'border-gray-100'">
                      <span class="text-[#e65100]">▲</span>
                      <span class="text-sm font-semibold" :class="inlineEditing ? 'text-blue-700' : 'text-gray-700'">
                        Informations générales
                      </span>
                      <button v-if="!inlineEditing" @click="startInlineEdit"
                        class="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                          <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
                          <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/>
                        </svg>
                        Modifier
                      </button>
                      <span v-else class="ml-auto text-xs text-blue-600 font-semibold">✎ En cours…</span>
                    </div>

                    <!-- Display mode -->
                    <div v-if="!inlineEditing" class="p-5 grid grid-cols-2 gap-x-8 gap-y-4">
                      <div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Raison sociale</div>
                        <div class="text-gray-900 font-medium">{{ selected.raison_sociale || '—' }}</div>
                      </div>
                      <div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">SIRET</div>
                        <div class="text-gray-900 font-mono text-sm">{{ selected.siret || '—' }}</div>
                      </div>
                      <div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Secteur</div>
                        <div class="text-gray-900">{{ selected.secteur || '—' }}</div>
                      </div>
                      <div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Ville</div>
                        <div class="text-gray-900">{{ [selected.code_postal, selected.ville].filter(Boolean).join(' ') || '—' }}</div>
                      </div>
                      <div class="col-span-2">
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Adresse</div>
                        <div class="text-gray-900">{{ selected.adresse || '—' }}</div>
                      </div>
                      <div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Email</div>
                        <a v-if="selected.email" :href="'mailto:' + selected.email" class="text-blue-600 hover:underline text-sm">{{ selected.email }}</a>
                        <span v-else class="text-gray-400">—</span>
                      </div>
                      <div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Téléphone</div>
                        <a v-if="selected.telephone" :href="'tel:' + selected.telephone" class="text-gray-900 text-sm">{{ selected.telephone }}</a>
                        <span v-else class="text-gray-400">—</span>
                      </div>
                      <div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Client depuis</div>
                        <div class="text-gray-500 text-sm">{{ formatDate(selected.created_at) }}</div>
                      </div>
                    </div>

                    <!-- Edit mode -->
                    <div v-else class="p-5 space-y-3">
                      <div>
                        <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Raison sociale</label>
                        <input v-model="inlineDraft.company_name" type="text" :class="inputCls"/>
                      </div>
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">SIRET</label>
                          <input v-model="inlineDraft.siret" type="text" :class="inputCls" class="font-mono"/>
                        </div>
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Secteur</label>
                          <input v-model="inlineDraft.secteur" type="text" :class="inputCls"/>
                        </div>
                      </div>
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                          <input v-model="inlineDraft.email" type="email" :class="inputCls"/>
                        </div>
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Téléphone</label>
                          <input v-model="inlineDraft.phone" type="text" :class="inputCls"/>
                        </div>
                      </div>
                      <div>
                        <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Adresse</label>
                        <input v-model="inlineDraft.address" type="text" :class="inputCls"/>
                      </div>
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Ville</label>
                          <input v-model="inlineDraft.city" type="text" :class="inputCls"/>
                        </div>
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Code postal</label>
                          <input v-model="inlineDraft.zip_code" type="text" :class="inputCls"/>
                        </div>
                      </div>
                      <div class="flex gap-2 pt-2 justify-end border-t border-gray-100">
                        <button @click="cancelInlineEdit"
                          class="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                          Annuler
                        </button>
                        <button @click="saveInlineEdit" :disabled="inlineSaving"
                          class="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {{ inlineSaving ? 'Enregistrement…' : 'Sauvegarder' }}
                        </button>
                      </div>
                    </div>
                  </div>
                  <CommentSection record-type="clients" :record-id="selected.id" />
                </div>

                <!-- Colonne droite : KPIs + contacts -->
                <div class="space-y-4">
                  <div class="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                      <span class="text-[#e65100]">▲</span>
                      <span class="text-sm font-semibold text-gray-700">Aperçu commercial</span>
                    </div>
                    <div class="p-4 flex gap-3">
                      <div class="flex-1 text-center px-3 py-3 rounded-xl" style="background:#1565c0;">
                        <div class="text-xl font-bold text-white leading-none">{{ selected.reservations_count }}</div>
                        <div class="text-[10px] text-blue-200 mt-1 font-medium uppercase tracking-wide">Réservations</div>
                      </div>
                      <div class="flex-1 text-center px-3 py-3 rounded-xl" style="background:#1b5e20;">
                        <div class="text-base font-bold text-white leading-none">{{ formatCurrency(selected.total_depense) }}</div>
                        <div class="text-[10px] text-green-200 mt-1 font-medium uppercase tracking-wide">Total dépensé</div>
                      </div>
                    </div>
                  </div>
                  <div class="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                      <span class="text-[#e65100]">▲</span>
                      <span class="text-sm font-semibold text-gray-700">Contacts</span>
                      <span v-if="clientContacts.length" class="text-xs text-gray-400">{{ clientContacts.length }}</span>
                      <button @click="openAddContact"
                        class="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-md transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                        </svg>
                        Ajouter
                      </button>
                    </div>
                    <div v-if="clientContacts.length === 0" class="px-5 py-6 text-center text-sm text-gray-400">
                      Aucun contact lié à cette entreprise.
                    </div>
                    <div v-else class="divide-y divide-gray-50">
                      <div v-for="(contact, idx) in clientContacts" :key="contact.id"
                        class="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors group"
                        @click="goToContact(contact)">
                        <div class="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-400 flex-shrink-0 mt-1.5">{{ idx + 1 }}</div>
                        <div class="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center text-xs font-bold text-cyan-700 flex-shrink-0">
                          {{ initialsStr(`${contact.prenom} ${contact.nom}`) }}
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-1.5">
                            <span class="text-sm font-semibold text-gray-900">{{ contact.prenom }} {{ contact.nom }}</span>
                            <span v-if="contact.role" class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                              :class="ROLE_MAP[contact.role]?.cls ?? 'bg-gray-100 text-gray-500'">
                              {{ ROLE_MAP[contact.role]?.label ?? contact.role }}
                            </span>
                          </div>
                          <div v-if="contact.poste" class="text-[11px] text-gray-500 mt-0.5">{{ contact.poste }}</div>
                          <div class="flex flex-col gap-0.5 mt-1">
                            <span v-if="contact.email" class="text-[11px] text-blue-600 truncate">{{ contact.email }}</span>
                            <span v-if="contact.telephone" class="text-[11px] text-gray-500">{{ contact.telephone }}</span>
                          </div>
                        </div>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                          class="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 mt-2 transition-colors">
                          <path fill-rule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
                        </svg>
                        <button @click="openUnlink(contact, $event)"
                          class="opacity-0 group-hover:opacity-100 flex-shrink-0 mt-1.5 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all"
                          title="Délier ce contact">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                            <path d="M6.75 3.5a.75.75 0 0 0 0 1.5H9v5.5H6.75a.75.75 0 0 0 0 1.5H9A1.5 1.5 0 0 0 10.5 10.5v-5A1.5 1.5 0 0 0 9 4H6.75ZM9.25 5a.75.75 0 0 1 0-1.5H11A1.5 1.5 0 0 1 12.5 5v6A1.5 1.5 0 0 1 11 12.5H9.25a.75.75 0 0 1 0-1.5H11V5H9.25ZM2 7.25a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5H2Z"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Particulier : 2 colonnes -->
              <div v-else class="grid grid-cols-[1fr_280px] gap-5">
                <div class="space-y-4">
                  <div class="bg-white rounded-xl shadow-sm overflow-hidden" :class="inlineEditing ? 'ring-2 ring-blue-400' : ''">
                    <div class="px-5 py-3 border-b flex items-center gap-2"
                      :class="inlineEditing ? 'border-blue-100 bg-blue-50' : 'border-gray-100'">
                      <span class="text-[#e65100]">▲</span>
                      <span class="text-sm font-semibold" :class="inlineEditing ? 'text-blue-700' : 'text-gray-700'">
                        Informations personnelles
                      </span>
                      <button v-if="!inlineEditing" @click="startInlineEdit"
                        class="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                          <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
                          <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/>
                        </svg>
                        Modifier
                      </button>
                      <span v-else class="ml-auto text-xs text-blue-600 font-semibold">✎ En cours…</span>
                    </div>

                    <!-- Display mode -->
                    <div v-if="!inlineEditing" class="p-5 grid grid-cols-2 gap-x-8 gap-y-4">
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
                        <a v-if="selected.email" :href="'mailto:' + selected.email" class="text-blue-600 hover:underline text-sm">{{ selected.email }}</a>
                        <span v-else class="text-gray-400">—</span>
                      </div>
                      <div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Téléphone</div>
                        <a v-if="selected.telephone" :href="'tel:' + selected.telephone" class="text-gray-900 text-sm">{{ selected.telephone }}</a>
                        <span v-else class="text-gray-400">—</span>
                      </div>
                      <div class="col-span-2">
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Adresse</div>
                        <div class="text-gray-900">{{ [selected.adresse, selected.code_postal, selected.ville].filter(Boolean).join(', ') || '—' }}</div>
                      </div>
                      <div>
                        <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Client depuis</div>
                        <div class="text-gray-500 text-sm">{{ formatDate(selected.created_at) }}</div>
                      </div>
                    </div>

                    <!-- Edit mode -->
                    <div v-else class="p-5 space-y-3">
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Prénom</label>
                          <input v-model="inlineDraft.first_name" type="text" :class="inputCls"/>
                        </div>
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Nom</label>
                          <input v-model="inlineDraft.last_name" type="text" :class="inputCls"/>
                        </div>
                      </div>
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                          <input v-model="inlineDraft.email" type="email" :class="inputCls"/>
                        </div>
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Téléphone</label>
                          <input v-model="inlineDraft.phone" type="text" :class="inputCls"/>
                        </div>
                      </div>
                      <div>
                        <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Adresse</label>
                        <input v-model="inlineDraft.address" type="text" :class="inputCls"/>
                      </div>
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Ville</label>
                          <input v-model="inlineDraft.city" type="text" :class="inputCls"/>
                        </div>
                        <div>
                          <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Code postal</label>
                          <input v-model="inlineDraft.zip_code" type="text" :class="inputCls"/>
                        </div>
                      </div>
                      <div class="flex gap-2 pt-2 justify-end border-t border-gray-100">
                        <button @click="cancelInlineEdit"
                          class="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                          Annuler
                        </button>
                        <button @click="saveInlineEdit" :disabled="inlineSaving"
                          class="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {{ inlineSaving ? 'Enregistrement…' : 'Sauvegarder' }}
                        </button>
                      </div>
                    </div>
                  </div>
                  <CommentSection record-type="clients" :record-id="selected.id" />
                </div>
                <div>
                  <div class="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                      <span class="text-[#e65100]">▲</span>
                      <span class="text-sm font-semibold text-gray-700">Aperçu commercial</span>
                    </div>
                    <div class="p-4 flex gap-3">
                      <div class="flex-1 text-center px-3 py-3 rounded-xl" style="background:#1565c0;">
                        <div class="text-xl font-bold text-white leading-none">{{ selected.reservations_count }}</div>
                        <div class="text-[10px] text-blue-200 mt-1 font-medium uppercase tracking-wide">Réservations</div>
                      </div>
                      <div class="flex-1 text-center px-3 py-3 rounded-xl" style="background:#1b5e20;">
                        <div class="text-base font-bold text-white leading-none">{{ formatCurrency(selected.total_depense) }}</div>
                        <div class="text-[10px] text-green-200 mt-1 font-medium uppercase tracking-wide">Total dépensé</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

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
                    <p v-else class="text-sm text-gray-400 italic">Aucune note pour ce client.</p>
                  </template>
                  <template v-else>
                    <textarea v-model="notesText" rows="10" placeholder="Saisissez vos notes…"
                      class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"/>
                    <div class="flex gap-2 mt-3 justify-end">
                      <button @click="cancelNotes"
                        class="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                        Annuler
                      </button>
                      <button @click="saveNotes" :disabled="notesSaving"
                        class="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
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
                      <div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[9px] font-bold text-blue-600 flex-shrink-0">
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

            <!-- ── Devis ── -->
            <template v-if="activeTab === 'devis'">
              <div class="bg-white rounded-xl shadow-sm overflow-hidden">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <span class="text-[#e65100]">▲</span>
                  <span class="text-sm font-semibold text-gray-700">Historique des devis</span>
                  <span class="text-xs text-gray-400">{{ allDevisRows.length }}</span>
                  <button @click="openDevisCreate"
                    class="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                      <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                    </svg>
                    Nouveau
                  </button>
                </div>
                <div v-if="reservationsLoading" class="px-5 py-6 flex items-center gap-2 text-sm text-gray-400">
                  <svg class="animate-spin w-4 h-4 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z"/>
                  </svg>
                  Chargement…
                </div>
                <div v-else-if="!allDevisRows.length" class="px-5 py-8 text-center text-sm text-gray-400">
                  Aucun devis pour ce client.
                </div>
                <table v-else class="w-full text-sm">
                  <thead class="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">N° / Date</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Documents</th>
                      <th class="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Montant</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-50">
                    <tr v-for="row in allDevisRows" :key="row.id"
                      class="hover:bg-gray-50 cursor-pointer transition-colors"
                      @click="row._type === 'manuel' ? openDevisEdit(row._raw) : openReservationDetail(row._raw)">
                      <td class="px-4 py-3">
                        <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
                          :class="row._type === 'genere' ? 'bg-orange-100 text-orange-600' : 'bg-purple-100 text-purple-600'">
                          {{ row._type === 'genere' ? 'Généré' : 'Manuel' }}
                        </span>
                      </td>
                      <td class="px-4 py-3 whitespace-nowrap">
                        <div class="font-mono text-xs text-gray-600 font-semibold">{{ row.numero || '—' }}</div>
                        <div class="text-[11px] text-gray-400 mt-0.5">{{ formatDate(row.date) }}</div>
                      </td>
                      <td class="px-4 py-3 text-gray-700 max-w-[180px] truncate text-xs">{{ row.description || '—' }}</td>
                      <td class="px-4 py-3">
                        <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold" :class="row.statusCls">
                          {{ row.statusLabel }}
                        </span>
                      </td>
                      <td class="px-4 py-3" @click.stop>
                        <div class="flex items-center gap-1">
                          <a v-if="row.fichier_devis" :href="getFileUrl(row.fichier_devis)" target="_blank"
                            class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" class="w-2.5 h-2.5"><path fill-rule="evenodd" d="M3 1.5A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h6A1.5 1.5 0 0 0 10.5 9V5.621a1.5 1.5 0 0 0-.44-1.06L7.94 2.439A1.5 1.5 0 0 0 6.878 2H3Zm2.25 6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Zm0-2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clip-rule="evenodd"/></svg>
                            Devis
                          </a>
                          <a v-if="row.fichier_devis_signe" :href="getFileUrl(row.fichier_devis_signe)" target="_blank"
                            class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" class="w-2.5 h-2.5"><path fill-rule="evenodd" d="M3 1.5A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h6A1.5 1.5 0 0 0 10.5 9V5.621a1.5 1.5 0 0 0-.44-1.06L7.94 2.439A1.5 1.5 0 0 0 6.878 2H3Zm2.25 6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Zm0-2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clip-rule="evenodd"/></svg>
                            Signé
                          </a>
                          <a v-if="row.fichier_facture" :href="getFileUrl(row.fichier_facture)" target="_blank"
                            class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" class="w-2.5 h-2.5"><path fill-rule="evenodd" d="M3 1.5A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h6A1.5 1.5 0 0 0 10.5 9V5.621a1.5 1.5 0 0 0-.44-1.06L7.94 2.439A1.5 1.5 0 0 0 6.878 2H3Zm2.25 6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Zm0-2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clip-rule="evenodd"/></svg>
                            Facture
                          </a>
                          <span v-if="!row.fichier_devis && !row.fichier_devis_signe && !row.fichier_facture && (row.facture_id || row.facture_ref)"
                            class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">
                            {{ row.facture_numero ?? row.facture_ref ?? 'Facturée' }}
                          </span>
                          <span v-if="!row.fichier_devis && !row.fichier_devis_signe && !row.fichier_facture && !row.facture_id && !row.facture_ref"
                            class="text-[11px] text-gray-300">—</span>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-right font-semibold text-gray-800">{{ row.montant != null ? formatCurrency(row.montant) : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Réservations du client -->
              <div class="bg-white rounded-xl shadow-sm overflow-hidden mt-4">
                <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-orange-500">
                    <path fill-rule="evenodd" d="M4 1.75a.75.75 0 0 1 1.5 0V3h5V1.75a.75.75 0 0 1 1.5 0V3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2V1.75ZM4.5 6a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1h-7Z" clip-rule="evenodd"/>
                  </svg>
                  <span class="text-sm font-semibold text-gray-700">Réservations</span>
                  <span class="text-xs text-gray-400">{{ clientReservations.length }}</span>
                  <a href="/planning" class="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition-colors">
                    Voir le planning
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" class="w-2.5 h-2.5">
                      <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l3.22-3.22v1.19a.75.75 0 0 0 1.5 0V4a.75.75 0 0 0-.75-.75H7.5a.75.75 0 0 0 0 1.5h1.19L6.22 8.72Z"/>
                      <path d="M3.5 6.75c0-.414.336-.75.75-.75H6A.75.75 0 0 0 6 4.5H4.25A2.25 2.25 0 0 0 2 6.75v3A2.25 2.25 0 0 0 4.25 12h3A2.25 2.25 0 0 0 9.5 9.75V8a.75.75 0 0 0-1.5 0v1.75c0 .414-.336.75-.75.75h-3a.75.75 0 0 1-.75-.75v-3Z"/>
                    </svg>
                  </a>
                </div>

                <!-- Loading -->
                <div v-if="reservationsLoading" class="px-5 py-6 flex items-center gap-2 text-sm text-gray-400">
                  <svg class="animate-spin w-4 h-4 text-gray-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z"/>
                  </svg>
                  Chargement…
                </div>

                <!-- Empty -->
                <div v-else-if="!clientReservations.length" class="px-5 py-8 text-center text-sm text-gray-400">
                  Aucune réservation pour ce client.
                </div>

                <!-- Table -->
                <table v-else class="w-full text-sm">
                  <thead class="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Dates</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Statut</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Notes</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Livraison</th>
                      <th class="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Documents</th>
                      <th class="px-4 py-2.5 text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Montant</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-50">
                    <tr v-for="r in clientReservations" :key="r.id" class="hover:bg-orange-50 transition-colors cursor-pointer" @click="openReservationDetail(r)">
                      <td class="px-4 py-3 whitespace-nowrap">
                        <div class="text-xs font-semibold text-gray-800">{{ formatDate(r.date_start) }}</div>
                        <div class="text-[11px] text-gray-400 mt-0.5">→ {{ formatDate(r.date_end) }}</div>
                      </td>
                      <td class="px-4 py-3">
                        <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                          :class="RESERVATION_STATUS[r.status]?.cls ?? 'bg-gray-100 text-gray-500'">
                          {{ RESERVATION_STATUS[r.status]?.label ?? r.status ?? '—' }}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-gray-500 text-xs max-w-[180px] truncate">{{ r.notes || '—' }}</td>
                      <td class="px-4 py-3">
                        <span v-if="r.delivery" class="inline-flex items-center gap-1 text-[11px] text-blue-600">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                            <path d="M8 1a1 1 0 0 1 1 1v.25a.75.75 0 0 0 1.5 0V2a2.5 2.5 0 0 0-5 0v.25a.75.75 0 0 0 1.5 0V2a1 1 0 0 1 1-1ZM4.422 4.015a.75.75 0 1 0-.844-1.244A5.484 5.484 0 0 0 2.5 7.5a5.5 5.5 0 0 0 11 0 5.484 5.484 0 0 0-1.078-3.23.75.75 0 1 0-1.228.86A3.985 3.985 0 0 1 12 7.5a4 4 0 1 1-8 0 3.985 3.985 0 0 1 .422-1.785V4.015Z"/>
                          </svg>
                          {{ r.delivery_address || 'Livraison' }}
                        </span>
                        <span v-else class="text-[11px] text-gray-300">Retrait</span>
                      </td>
                      <td class="px-4 py-3" @click.stop>
                        <div class="flex items-center gap-1.5">
                          <a v-if="r.fichier_devis" :href="getFileUrl(r.fichier_devis)" target="_blank"
                            class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            title="Devis généré">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" class="w-2.5 h-2.5"><path fill-rule="evenodd" d="M3 1.5A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h6A1.5 1.5 0 0 0 10.5 9V5.621a1.5 1.5 0 0 0-.44-1.06L7.94 2.439A1.5 1.5 0 0 0 6.878 2H3Zm2.25 6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Zm0-2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clip-rule="evenodd"/></svg>
                            Devis
                          </a>
                          <a v-if="r.fichier_devis_signe" :href="getFileUrl(r.fichier_devis_signe)" target="_blank"
                            class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                            title="Devis signé">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" class="w-2.5 h-2.5"><path fill-rule="evenodd" d="M3 1.5A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h6A1.5 1.5 0 0 0 10.5 9V5.621a1.5 1.5 0 0 0-.44-1.06L7.94 2.439A1.5 1.5 0 0 0 6.878 2H3Zm2.25 6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Zm0-2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clip-rule="evenodd"/></svg>
                            Signé
                          </a>
                          <a v-if="r.fichier_facture" :href="getFileUrl(r.fichier_facture)" target="_blank"
                            class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
                            title="Facture">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" class="w-2.5 h-2.5"><path fill-rule="evenodd" d="M3 1.5A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h6A1.5 1.5 0 0 0 10.5 9V5.621a1.5 1.5 0 0 0-.44-1.06L7.94 2.439A1.5 1.5 0 0 0 6.878 2H3Zm2.25 6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Zm0-2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clip-rule="evenodd"/></svg>
                            Facture
                          </a>
                          <span v-if="!r.fichier_devis && !r.fichier_devis_signe && !r.fichier_facture" class="text-[11px] text-gray-300">—</span>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-right font-semibold text-gray-800">
                        {{ r.total_price != null ? formatCurrency(r.total_price) : '—' }}
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

    <!-- ── Modal create client ── -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="modalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/40" @click="closeModal"/>
          <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 class="font-bold text-gray-900 text-lg">Nouveau client</h2>
              <button @click="closeModal" class="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
                </svg>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Type *</label>
                <div class="flex gap-2">
                  <button v-for="t in ['particulier','entreprise']" :key="t"
                    class="flex-1 py-2 text-sm font-semibold rounded-lg border transition-colors"
                    :class="draft.typeClient === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
                    @click="draft.typeClient = t">{{ t === 'particulier' ? 'Particulier' : 'Entreprise' }}</button>
                </div>
              </div>
              <template v-if="draft.typeClient === 'particulier'">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Prénom</label>
                    <input v-model="draft.first_name" type="text" :class="inputCls"/>
                  </div>
                  <div>
                    <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Nom</label>
                    <input v-model="draft.last_name" type="text" :class="inputCls"/>
                  </div>
                </div>
              </template>
              <template v-else>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Raison sociale</label>
                  <input v-model="draft.company_name" type="text" :class="inputCls"/>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">SIRET</label>
                    <input v-model="draft.siret" type="text" :class="inputCls" class="font-mono"/>
                  </div>
                  <div>
                    <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Secteur</label>
                    <input v-model="draft.secteur" type="text" :class="inputCls"/>
                  </div>
                </div>
              </template>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                  <input v-model="draft.email" type="email" :class="inputCls"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Téléphone</label>
                  <input v-model="draft.phone" type="text" :class="inputCls"/>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Adresse</label>
                <input v-model="draft.address" type="text" :class="inputCls"/>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Ville</label>
                  <input v-model="draft.city" type="text" :class="inputCls"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Code postal</label>
                  <input v-model="draft.zip_code" type="text" :class="inputCls"/>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Notes</label>
                <textarea v-model="draft.notes" rows="3" :class="inputCls" class="resize-none"/>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end flex-shrink-0">
              <button @click="closeModal" class="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors">Annuler</button>
              <button @click="submitModal" :disabled="modalSaving"
                class="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {{ modalSaving ? 'Enregistrement…' : 'Créer' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Modal ajout contact ── -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="addContactOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/40" @click="addContactOpen = false"/>
          <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 class="font-bold text-gray-900 text-base">Nouveau contact — {{ selected?.raison_sociale }}</h2>
              <button @click="addContactOpen = false" class="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
                </svg>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-6 space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Prénom</label>
                  <input v-model="addContactDraft.prenom" type="text" :class="inputCls" autofocus/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Nom</label>
                  <input v-model="addContactDraft.nom" type="text" :class="inputCls"/>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Email</label>
                  <input v-model="addContactDraft.email" type="email" :class="inputCls"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Téléphone</label>
                  <input v-model="addContactDraft.telephone" type="text" :class="inputCls"/>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Poste</label>
                <input v-model="addContactDraft.poste" type="text" placeholder="ex: Directeur général" :class="inputCls"/>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Rôle</label>
                <div class="flex flex-wrap gap-2">
                  <button v-for="r in ROLES" :key="r.key"
                    @click="addContactDraft.role = addContactDraft.role === r.key ? '' : r.key"
                    class="text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors"
                    :class="addContactDraft.role === r.key ? `${r.cls} border-transparent` : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'">
                    {{ r.label }}
                  </button>
                </div>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end flex-shrink-0">
              <button @click="addContactOpen = false" class="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors">Annuler</button>
              <button @click="submitAddContact" :disabled="addContactSaving"
                class="px-4 py-2 bg-cyan-600 text-white text-sm font-semibold rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors">
                {{ addContactSaving ? 'Enregistrement…' : 'Créer le contact' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Devis create modal ── -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="devisModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/40" @click="devisModalOpen = false"/>
          <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 class="font-bold text-gray-900 text-base">{{ devisMode === 'create' ? 'Nouveau devis' : 'Modifier le devis' }}</h2>
                <p v-if="devisMode === 'edit' && devisDraft.numero" class="text-xs text-gray-400 font-mono mt-0.5">{{ devisDraft.numero }}</p>
              </div>
              <button @click="devisModalOpen = false" class="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
                </svg>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-6 space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">N° Devis</label>
                  <input v-model="devisDraft.numero" type="text" placeholder="DEV-2024-001" :class="inputCls" class="font-mono" autofocus/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Montant (€)</label>
                  <input v-model="devisDraft.montant" type="number" min="0" step="0.01" placeholder="0.00" :class="inputCls"/>
                </div>
              </div>
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Description</label>
                <textarea v-model="devisDraft.description" rows="3" placeholder="Objet du devis…" :class="inputCls" class="resize-none"/>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Valide jusqu'au</label>
                  <input v-model="devisDraft.valid_until" type="date" :class="inputCls"/>
                </div>
                <div>
                  <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Statut</label>
                  <select v-model="devisDraft.statut" :class="inputCls">
                    <option v-for="(s, key) in DEVIS_STATUS" :key="key" :value="key">{{ s.label }}</option>
                  </select>
                </div>
              </div>
              <!-- Facture si statut = facture -->
              <div v-if="devisDraft.statut === 'facture'" class="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Facture associée</label>
                  <div class="flex gap-1">
                    <button @click="factureMode = 'select'; devisDraft.facture_ref = ''"
                      class="text-[11px] px-2.5 py-1 rounded-md font-semibold transition-colors"
                      :class="factureMode === 'select' ? 'bg-blue-600 text-white' : 'text-blue-500 hover:bg-blue-100'">
                      Sélectionner
                    </button>
                    <button @click="factureMode = 'manual'; devisDraft.facture_id = ''"
                      class="text-[11px] px-2.5 py-1 rounded-md font-semibold transition-colors"
                      :class="factureMode === 'manual' ? 'bg-blue-600 text-white' : 'text-blue-500 hover:bg-blue-100'">
                      Référence manuelle
                    </button>
                  </div>
                </div>
                <div v-if="factureMode === 'select'">
                  <select v-model="devisDraft.facture_id"
                    class="w-full text-sm px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                    <option value="">— Sélectionner une facture —</option>
                    <option v-for="f in factures" :key="f.id" :value="f.id">
                      {{ f.numero }}{{ f.montant != null ? ` — ${formatCurrency(f.montant)}` : '' }}
                    </option>
                  </select>
                  <p v-if="!factures.length" class="text-[11px] text-blue-400 mt-1">Aucune facture disponible.</p>
                </div>
                <div v-else>
                  <input v-model="devisDraft.facture_ref" type="text" placeholder="FAC-2024-001"
                    class="w-full text-sm px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white font-mono"/>
                  <p class="text-[11px] text-blue-500 mt-1">Référence de la facture émise pour ce devis</p>
                </div>
              </div>
              <!-- PDF -->
              <div>
                <label class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Fichier PDF</label>
                <!-- Fichier existant (mode édition) -->
                <div v-if="devisMode === 'edit' && devisDraft.current_fichier_id && !devisFileName" class="mb-2">
                  <a :href="getFileUrl(devisDraft.current_fichier_id)" target="_blank" rel="noopener"
                    class="inline-flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-3 py-1.5 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                      <path fill-rule="evenodd" d="M3 1.5A1.5 1.5 0 0 0 1.5 3v10A1.5 1.5 0 0 0 3 14.5h10a1.5 1.5 0 0 0 1.5-1.5V5.621a1.5 1.5 0 0 0-.44-1.06L11.94 2.439A1.5 1.5 0 0 0 10.878 2H3Zm2.25 6a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm0 2.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Z" clip-rule="evenodd"/>
                    </svg>
                    Voir le PDF actuel ↗
                  </a>
                  <span class="text-[11px] text-gray-400 ml-2">Choisir un fichier ci-dessous pour le remplacer</span>
                </div>
                <div class="flex items-center gap-2">
                  <label class="flex-1 flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors text-gray-500">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-red-500 flex-shrink-0">
                      <path fill-rule="evenodd" d="M3 1.5A1.5 1.5 0 0 0 1.5 3v10A1.5 1.5 0 0 0 3 14.5h10a1.5 1.5 0 0 0 1.5-1.5V5.621a1.5 1.5 0 0 0-.44-1.06L11.94 2.439A1.5 1.5 0 0 0 10.878 2H3Zm2.25 6a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm0 2.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm2.5-6.25V4.5h2.629L7.75 2.129V3.25Z" clip-rule="evenodd"/>
                    </svg>
                    <span class="truncate">{{ devisFileName || (devisMode === 'edit' && devisDraft.current_fichier_id ? 'Remplacer le PDF…' : 'Choisir un fichier PDF…') }}</span>
                    <input ref="devisFileRef" type="file" accept=".pdf,application/pdf" class="hidden"
                      @change="devisFileName = $event.target.files[0]?.name ?? ''"/>
                  </label>
                  <button v-if="devisFileName" @click="clearDevisFile"
                    class="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                      <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end flex-shrink-0">
              <button @click="devisModalOpen = false" class="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors">Annuler</button>
              <button @click="submitDevisModal" :disabled="devisSaving"
                class="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {{ devisSaving ? 'Enregistrement…' : devisMode === 'create' ? 'Créer le devis' : 'Sauvegarder' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Réservation detail modal ── -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="selectedReservation" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/40" @click="selectedReservation = null"/>
          <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">

            <!-- Header -->
            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                    :class="RESERVATION_STATUS[selectedReservation.status]?.cls ?? 'bg-gray-100 text-gray-500'">
                    {{ RESERVATION_STATUS[selectedReservation.status]?.label ?? selectedReservation.status }}
                  </span>
                  <span class="text-xs text-gray-400">Réservation #{{ selectedReservation.id }}</span>
                </div>
                <h2 class="font-bold text-gray-900 text-base mt-1">
                  {{ formatDate(selectedReservation.date_start) }} → {{ formatDate(selectedReservation.date_end) }}
                </h2>
              </div>
              <button @click="selectedReservation = null" class="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
                </svg>
              </button>
            </div>

            <div class="flex-1 overflow-y-auto p-6 space-y-5">

              <!-- Infos réservation -->
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Montant total</div>
                  <div class="text-xl font-bold text-gray-900">{{ selectedReservation.total_price != null ? formatCurrency(selectedReservation.total_price) : '—' }}</div>
                </div>
                <div>
                  <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Livraison</div>
                  <div class="text-sm text-gray-700">{{ selectedReservation.delivery ? (selectedReservation.delivery_address || 'Oui') : 'Retrait sur place' }}</div>
                </div>
              </div>
              <div v-if="selectedReservation.notes">
                <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</div>
                <div class="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2.5 leading-relaxed">{{ selectedReservation.notes }}</div>
              </div>

              <!-- Devis lié -->
              <div>
                <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Devis associé</div>
                <div v-if="linkedDevis" class="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <div class="font-mono text-sm font-bold text-gray-900">{{ linkedDevis.numero || 'Sans numéro' }}</div>
                      <div class="text-xs text-gray-500 mt-0.5">{{ formatDate(linkedDevis.date) }}</div>
                    </div>
                    <div class="text-right">
                      <div class="font-bold text-gray-900">{{ linkedDevis.montant != null ? formatCurrency(linkedDevis.montant) : '—' }}</div>
                      <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                        :class="DEVIS_STATUS[linkedDevis.statut]?.cls ?? 'bg-gray-100 text-gray-500'">
                        {{ DEVIS_STATUS[linkedDevis.statut]?.label ?? linkedDevis.statut }}
                      </span>
                    </div>
                  </div>
                  <div v-if="linkedDevis.description" class="text-sm text-gray-600 bg-white rounded-lg px-3 py-2 border border-blue-100">
                    {{ linkedDevis.description }}
                  </div>
                  <!-- Facture -->
                  <div v-if="linkedDevis.facture_id || linkedDevis.facture_ref" class="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-blue-500 flex-shrink-0">
                      <path fill-rule="evenodd" d="M3 1.5A1.5 1.5 0 0 0 1.5 3v10A1.5 1.5 0 0 0 3 14.5h10a1.5 1.5 0 0 0 1.5-1.5V5.621a1.5 1.5 0 0 0-.44-1.06L11.94 2.439A1.5 1.5 0 0 0 10.878 2H3Zm2.25 6a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm0 2.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Z" clip-rule="evenodd"/>
                    </svg>
                    <span class="text-sm font-semibold text-blue-700">
                      Facture {{ linkedDevis.facture_numero ?? linkedDevis.facture_ref }}
                    </span>
                  </div>
                  <!-- PDF devis -->
                  <a v-if="linkedDevis.fichier_id" :href="getFileUrl(linkedDevis.fichier_id)" target="_blank" rel="noopener"
                    class="inline-flex items-center gap-2 text-xs font-semibold text-red-600 bg-white hover:bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                      <path fill-rule="evenodd" d="M3 1.5A1.5 1.5 0 0 0 1.5 3v10A1.5 1.5 0 0 0 3 14.5h10a1.5 1.5 0 0 0 1.5-1.5V5.621a1.5 1.5 0 0 0-.44-1.06L11.94 2.439A1.5 1.5 0 0 0 10.878 2H3Zm2.25 6a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm0 2.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Z" clip-rule="evenodd"/>
                    </svg>
                    Ouvrir le PDF du devis ↗
                  </a>
                  <!-- Modifier le devis -->
                  <button @click="selectedReservation = null; openDevisEdit(linkedDevis)"
                    class="inline-flex items-center gap-1 text-xs px-2.5 py-1 border border-blue-300 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors font-semibold">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                      <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.263a1.75 1.75 0 0 0 0-2.474Z"/>
                      <path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V9a.75.75 0 0 1 1.5 0v2.25A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 11.25v-6.5A2.75 2.75 0 0 1 4.75 2H7a.75.75 0 0 1 0 1.5H4.75Z"/>
                    </svg>
                    Modifier le devis
                  </button>
                </div>
                <div v-else class="text-sm text-gray-400 bg-gray-50 rounded-xl px-4 py-3 border border-dashed border-gray-200">
                  Aucun devis lié à cette réservation.
                  <button @click="selectedReservation = null; openDevisCreate()"
                    class="ml-2 text-blue-600 hover:underline font-semibold text-xs">Créer un devis →</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Contact unlink modal ── -->
    <Teleport to="body">
      <div v-if="unlinkModal && unlinkTarget" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="unlinkModal = false"/>
        <div class="relative bg-white rounded-2xl shadow-xl p-6 w-[360px]">
          <h3 class="font-bold text-gray-900 mb-1">Délier {{ unlinkTarget.prenom }} {{ unlinkTarget.nom }} ?</h3>
          <p class="text-sm text-gray-500 mb-1">Ce contact sera détaché de <strong>{{ selected?.raison_sociale }}</strong>.</p>
          <p class="text-sm font-semibold text-gray-700 mb-5">Tu veux supprimer le contact directement aussi ?</p>
          <div class="flex flex-col gap-2">
            <button @click="doUnlink(true)" :disabled="unlinkRunning"
              class="w-full py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
              {{ unlinkRunning ? 'En cours…' : 'Délier et supprimer le contact' }}
            </button>
            <button @click="doUnlink(false)" :disabled="unlinkRunning"
              class="w-full py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-700 text-sm font-semibold rounded-lg transition-colors">
              Délier uniquement
            </button>
            <button @click="unlinkModal = false"
              class="w-full py-2 border border-gray-200 hover:bg-gray-50 text-gray-500 text-sm font-semibold rounded-lg transition-colors">
              Annuler
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Confirm delete ── -->
    <Teleport to="body">
      <div v-if="confirmDelete" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="confirmDelete = false"/>
        <div class="relative bg-white rounded-2xl shadow-xl p-6 w-80">
          <h3 class="font-bold text-gray-900 mb-1">Supprimer ce client ?</h3>
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
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .relative, .modal-leave-to .relative { transform: scale(0.96); }
</style>
