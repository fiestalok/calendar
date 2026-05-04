<script setup>
import { computed, ref } from 'vue'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useReservationsStore } from '../stores/reservations'
import StatusBadge from './StatusBadge.vue'

const props = defineProps({ reservation: { type: Object, default: null } })
defineEmits(['close'])

const store = useReservationsStore()
const loading = ref(null)
const toast = ref(null)

const client = computed(() => props.reservation?.client)
const articles = computed(() => props.reservation?.articles || [])

const fmtDate = (d) =>
  d ? format(parseISO(d), "EEEE d MMMM yyyy", { locale: fr }) : '—'

const actions = computed(() => {
  const s = props.reservation?.status
  if (s === 'en_attente') return [
    { key: 'quote', label: 'Préparer un devis', status: 'devis_realise', cls: 'btn-primary' },
    { key: 'cancel', label: 'Annuler', status: 'annulee', cls: 'btn-error btn-outline' }
  ]
  if (s === 'devis_realise') return [
    { key: 'confirm', label: 'Confirmer la réservation', status: 'devis_confirme', cls: 'btn-success' },
    { key: 'cancel', label: 'Annuler', status: 'annulee', cls: 'btn-error btn-outline' }
  ]
  if (s === 'devis_confirme') return [
    { key: 'done', label: 'Marquer comme terminée', status: 'terminee', cls: 'btn-neutral' },
    { key: 'reset', label: 'Remettre en attente', status: 'en_attente', cls: 'btn-ghost' }
  ]
  return [{ key: 'reset', label: 'Remettre en attente', status: 'en_attente', cls: 'btn-ghost' }]
})

async function act(action) {
  loading.value = action.key
  try {
    await store.updateStatus(props.reservation.id, action.status)
    showToast('Statut mis à jour', 'success')
  } catch {
    showToast('Erreur lors de la mise à jour', 'error')
  } finally {
    loading.value = null
  }
}

function showToast(msg, type) {
  toast.value = { msg, type }
  setTimeout(() => { toast.value = null }, 3000)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="reservation" class="modal modal-open">
      <div class="modal-box w-11/12 max-w-2xl max-h-[90vh] overflow-y-auto">
        <button
          class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 z-10"
          @click="$emit('close')"
        >✕</button>

        <div class="pr-8 mb-4">
          <h3 class="font-bold text-xl">
            {{ client?.first_name }} {{ client?.last_name }}
          </h3>
          <div class="mt-2">
            <StatusBadge :status="reservation.status" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 bg-base-200 rounded-box p-4 mb-4">
          <div>
            <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Début</p>
            <p class="text-sm font-medium capitalize">{{ fmtDate(reservation.date_start) }}</p>
          </div>
          <div>
            <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Fin</p>
            <p class="text-sm font-medium capitalize">{{ fmtDate(reservation.date_end) }}</p>
          </div>
        </div>

        <div v-if="articles.length" class="mb-4">
          <p class="text-xs font-semibold text-base-content/50 uppercase mb-2">Articles réservés</p>
          <div class="space-y-2">
            <div
              v-for="item in articles"
              :key="item.articles_id?.id"
              class="flex items-center gap-3 bg-base-200 rounded-box p-3"
            >
              <img
                v-if="item.articles_id?.images_urls?.[0]"
                :src="item.articles_id.images_urls[0]"
                class="w-12 h-12 object-cover rounded shrink-0"
                alt=""
              />
              <div
                v-else
                class="w-12 h-12 bg-base-300 rounded flex items-center justify-center text-2xl shrink-0"
              >🏰</div>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-sm truncate">{{ item.articles_id?.name || 'Article' }}</p>
                <p class="text-xs text-base-content/60">
                  Qté : {{ item.quantity || 1 }}
                  <span v-if="item.unit_price"> — {{ item.unit_price }} €</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div v-if="client?.phone">
            <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Téléphone</p>
            <a :href="`tel:${client.phone}`" class="link link-primary text-sm">{{ client.phone }}</a>
          </div>
          <div v-if="client?.email">
            <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Email</p>
            <a :href="`mailto:${client.email}`" class="link link-primary text-sm break-all">{{ client.email }}</a>
          </div>
          <div v-if="reservation.delivery_address">
            <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Lieu de livraison</p>
            <p class="text-sm">{{ reservation.delivery_address }}</p>
          </div>
          <div v-if="reservation.total_price">
            <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Prix total</p>
            <p class="text-sm font-bold text-success">{{ reservation.total_price }} €</p>
          </div>
        </div>

        <div v-if="reservation.notes" class="mb-4">
          <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Notes</p>
          <p class="text-sm bg-base-200 rounded-box p-3">{{ reservation.notes }}</p>
        </div>

        <div class="flex flex-wrap gap-2 justify-end pt-4 border-t border-base-200">
          <button
            v-for="a in actions"
            :key="a.key"
            class="btn btn-sm"
            :class="a.cls"
            :disabled="loading !== null"
            @click="act(a)"
          >
            <span v-if="loading !== a.key">{{ a.label }}</span>
            <span v-else class="loading loading-spinner loading-xs"></span>
          </button>
        </div>
      </div>
      <div class="modal-backdrop" @click="$emit('close')"></div>

      <div v-if="toast" class="toast toast-end z-[200]">
        <div
          class="alert text-sm"
          :class="toast.type === 'success' ? 'alert-success' : 'alert-error'"
        >
          {{ toast.msg }}
        </div>
      </div>
    </div>
  </Teleport>
</template>
