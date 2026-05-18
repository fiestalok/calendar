<script setup>
import { ref, computed, onMounted } from 'vue'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useReservationsStore } from '../stores/reservations'
import { useAuthStore } from '../stores/auth'
import {
  getArticles, getClients,
  createReservation, createReservationProduit, createReservationArticle,
} from '../api/directus'
import ReservationModal from '../components/ReservationModal.vue'
import StatusBadge from '../components/StatusBadge.vue'

const store = useReservationsStore()
const auth  = useAuthStore()

onMounted(() => store.fetchReservations())

// ── Modal de détail ──────────────────────────────────────────────────────────
const selectedId = ref(null)
const selectedReservation = computed(() =>
  store.reservations.find(r => r.id === selectedId.value) ?? null
)

// ── Filtre statut ────────────────────────────────────────────────────────────
const STATUS_TABS = [
  { key: 'all',            label: 'Tout' },
  { key: 'en_attente',     label: 'En attente' },
  { key: 'devis_realise',  label: 'Devis réalisé' },
  { key: 'devis_confirme', label: 'Confirmé' },
  { key: 'terminee',       label: 'Terminée' },
  { key: 'annulee',        label: 'Annulée' },
]
const filterStatus = ref('all')
const filteredList = computed(() => {
  const list = store.reservations
  if (filterStatus.value === 'all') return list
  return list.filter(r => r.status === filterStatus.value)
})

const fmtDate = (d) => d ? format(parseISO(d), 'd MMM yyyy', { locale: fr }) : '—'

// ── Création réservation ─────────────────────────────────────────────────────
const showCreate = ref(false)
const saving     = ref(false)
const createError = ref('')

const allArticles = ref([])
const allClients  = ref([])
const loadingCreate = ref(false)

async function openCreate() {
  showCreate.value = true
  createError.value = ''
  resetForm()
  loadingCreate.value = true
  try {
    const [arts, clients] = await Promise.all([getArticles(), getClients()])
    allArticles.value = arts ?? []
    allClients.value  = clients ?? []
  } finally {
    loadingCreate.value = false
  }
}

const form = ref({
  article_id: '',
  date_start: '',
  date_end:   '',
  client_id:  '',
  notes:      '',
  delivery_address: '',
})

function resetForm() {
  form.value = { article_id: '', date_start: '', date_end: '', client_id: '', notes: '', delivery_address: '' }
}

const selectedArticle = computed(() =>
  allArticles.value.find(a => String(a.id) === String(form.value.article_id)) ?? null
)

const clientSearch = ref('')
const filteredClients = computed(() => {
  const q = clientSearch.value.toLowerCase()
  return allClients.value.filter(c => {
    const name = `${c.first_name ?? ''} ${c.last_name ?? ''} ${c.company_name ?? ''}`.toLowerCase()
    return !q || name.includes(q)
  })
})

const formValid = computed(() =>
  form.value.article_id && form.value.date_start && form.value.date_end && form.value.client_id
)

async function submitCreate() {
  if (!formValid.value) return
  saving.value = true
  createError.value = ''
  try {
    const art = selectedArticle.value
    const produitId = art?.produit_id?.id ?? null

    const newResa = await createReservation({
      status:           'en_attente',
      date_start:       form.value.date_start,
      date_end:         form.value.date_end,
      client:           Number(form.value.client_id),
      notes:            form.value.notes || null,
      delivery_address: form.value.delivery_address || null,
      devis_realise_par: null,
    })

    if (produitId) {
      await createReservationProduit({
        reservations_id: newResa.id,
        produits_id:     produitId,
        quantity:        1,
      })
    }

    if (form.value.article_id) {
      await createReservationArticle({
        reservations_id: newResa.id,
        articles_id:     Number(form.value.article_id),
      })
    }

    await store.fetchReservations()
    showCreate.value = false
    selectedId.value = newResa.id
  } catch (err) {
    createError.value = err?.response?.data?.errors?.[0]?.message ?? err.message ?? 'Erreur lors de la création'
  } finally {
    saving.value = false
  }
}

const ETAT_LABEL = {
  disponible: 'Disponible', loue: 'Loué',
  en_maintenance: 'En maintenance', hors_service: 'Hors service',
}
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto">
    <!-- ── En-tête ─────────────────────────────────────────────────── -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Réservations</h1>
        <p class="text-sm text-base-content/50 mt-0.5">{{ store.reservations.length }} réservation{{ store.reservations.length > 1 ? 's' : '' }}</p>
      </div>
      <button class="btn btn-primary btn-sm" @click="openCreate">
        + Nouvelle réservation
      </button>
    </div>

    <!-- ── Filtre statuts ──────────────────────────────────────────── -->
    <div class="flex flex-wrap gap-1 mb-4">
      <button
        v-for="tab in STATUS_TABS"
        :key="tab.key"
        class="btn btn-xs"
        :class="filterStatus === tab.key ? 'btn-primary' : 'btn-ghost'"
        @click="filterStatus = tab.key"
      >{{ tab.label }}</button>
    </div>

    <!-- ── Liste ─────────────────────────────────────────────────────── -->
    <div v-if="store.loading" class="flex justify-center py-16">
      <span class="loading loading-spinner loading-lg"></span>
    </div>

    <div v-else-if="!filteredList.length" class="text-center py-16 text-base-content/40">
      Aucune réservation{{ filterStatus !== 'all' ? ' pour ce statut' : '' }}
    </div>

    <div v-else class="rounded-box border border-base-200 overflow-hidden">
      <table class="table table-sm w-full">
        <thead class="bg-base-200 text-xs uppercase text-base-content/50">
          <tr>
            <th>Client</th>
            <th>Période</th>
            <th>Produits</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in filteredList"
            :key="r.id"
            class="hover cursor-pointer border-b border-base-200 last:border-0"
            @click="selectedId = r.id"
          >
            <td>
              <div class="font-medium text-sm">{{ r.client?.first_name }} {{ r.client?.last_name }}</div>
              <div v-if="r.client?.city" class="text-xs text-base-content/50">{{ r.client.city }}</div>
            </td>
            <td class="text-sm text-base-content/70">
              {{ fmtDate(r.date_start) }} → {{ fmtDate(r.date_end) }}
            </td>
            <td>
              <div v-if="r.produit_noms?.length" class="text-xs text-base-content/60">
                {{ r.produit_noms.join(', ') }}
              </div>
              <span v-else class="text-xs text-base-content/30 italic">Aucun produit</span>
            </td>
            <td><StatusBadge :status="r.status" /></td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Modal création ─────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showCreate" class="modal modal-open">
        <div class="modal-box w-11/12 max-w-xl max-h-[90vh] overflow-y-auto">
          <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" @click="showCreate = false">✕</button>

          <h3 class="font-bold text-xl mb-4">Nouvelle réservation</h3>

          <div v-if="loadingCreate" class="flex justify-center py-8">
            <span class="loading loading-spinner loading-md"></span>
          </div>

          <form v-else class="space-y-4" @submit.prevent="submitCreate">

            <!-- Article -->
            <div class="form-control">
              <label class="label pb-1"><span class="label-text font-medium">Article <span class="text-error">*</span></span></label>
              <select v-model="form.article_id" class="select select-bordered select-sm w-full" required>
                <option value="" disabled>Sélectionner un article…</option>
                <option v-for="art in allArticles" :key="art.id" :value="art.id">
                  {{ art.reference }} — {{ art.produit_id?.name }}
                  ({{ ETAT_LABEL[art.etat] ?? art.etat }}, {{ art.entrepot_id?.nom }})
                </option>
              </select>
              <!-- Produit auto-détecté -->
              <div v-if="selectedArticle" class="mt-1 text-xs text-base-content/50 pl-1">
                Produit : <strong>{{ selectedArticle.produit_id?.name }}</strong>
              </div>
            </div>

            <!-- Dates -->
            <div class="grid grid-cols-2 gap-3">
              <div class="form-control">
                <label class="label pb-1"><span class="label-text font-medium">Date début <span class="text-error">*</span></span></label>
                <input v-model="form.date_start" type="date" class="input input-bordered input-sm" required />
              </div>
              <div class="form-control">
                <label class="label pb-1"><span class="label-text font-medium">Date fin <span class="text-error">*</span></span></label>
                <input v-model="form.date_end" type="date" class="input input-bordered input-sm" :min="form.date_start" required />
              </div>
            </div>

            <!-- Client -->
            <div class="form-control">
              <label class="label pb-1"><span class="label-text font-medium">Client <span class="text-error">*</span></span></label>
              <input
                v-model="clientSearch"
                type="text"
                placeholder="Rechercher un client…"
                class="input input-bordered input-sm mb-1"
              />
              <select v-model="form.client_id" class="select select-bordered select-sm w-full" required>
                <option value="" disabled>Sélectionner…</option>
                <option v-for="c in filteredClients" :key="c.id" :value="c.id">
                  {{ c.first_name }} {{ c.last_name }}{{ c.company_name ? ` (${c.company_name})` : '' }}
                </option>
              </select>
            </div>

            <!-- Adresse de livraison -->
            <div class="form-control">
              <label class="label pb-1"><span class="label-text font-medium">Adresse de livraison</span></label>
              <input v-model="form.delivery_address" type="text" class="input input-bordered input-sm" placeholder="Laisser vide si identique au client" />
            </div>

            <!-- Notes -->
            <div class="form-control">
              <label class="label pb-1"><span class="label-text font-medium">Notes</span></label>
              <textarea v-model="form.notes" class="textarea textarea-bordered textarea-sm resize-none" rows="2" placeholder="Informations complémentaires…" />
            </div>

            <!-- Erreur -->
            <div v-if="createError" class="alert alert-error text-sm py-2">{{ createError }}</div>

            <div class="flex gap-2 justify-end pt-2">
              <button type="button" class="btn btn-sm btn-ghost" @click="showCreate = false">Annuler</button>
              <button type="submit" class="btn btn-sm btn-primary" :disabled="saving || !formValid">
                <span v-if="!saving">Créer la réservation</span>
                <span v-else class="loading loading-spinner loading-xs"></span>
              </button>
            </div>
          </form>
        </div>
        <div class="modal-backdrop" @click="showCreate = false"></div>
      </div>
    </Teleport>

    <!-- ── Modal de détail ────────────────────────────────────────── -->
    <ReservationModal
      :reservation="selectedReservation"
      @close="selectedId = null"
    />
  </div>
</template>
