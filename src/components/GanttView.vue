<script setup>
import { computed, ref } from 'vue'
import {
  addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval,
  parseISO, format, isToday, isWeekend,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { useReservationsStore } from '../stores/reservations'
import ReservationModal from './ReservationModal.vue'

const store    = useReservationsStore()
const current  = ref(startOfMonth(new Date()))
const mode     = ref('compact') // 'client' | 'compact'
const selectedId = ref(null)

const selected = computed(() =>
  selectedId.value ? store.reservations.find(r => r.id === selectedId.value) : null
)

const LABEL_W = 160

const months = computed(() =>
  [0, 1, 2, 3].map(offset => {
    const start = addMonths(current.value, offset)
    const end   = endOfMonth(start)
    return {
      start,
      end,
      label: format(start, 'MMMM yyyy', { locale: fr }),
      days:  eachDayOfInterval({ start, end }),
    }
  })
)

const title = computed(() => {
  const m = months.value
  return `${m[0].label} — ${m[3].label}`
})

const statusFilters = [
  { value: 'all',            label: 'Tous' },
  { value: 'en_attente',     label: 'En attente' },
  { value: 'devis_realise',  label: 'Devis réalisé' },
  { value: 'devis_confirme', label: 'Confirmés' },
  { value: 'terminee',       label: 'Terminées' },
  { value: 'annulee',        label: 'Annulées' },
]

const STATUS_STYLES = {
  en_attente:     { bg: 'rgba(234,179,8,0.18)',   border: '#eab308', text: '#78350f' },
  devis_realise:  { bg: 'rgba(14,165,233,0.18)',  border: '#0ea5e9', text: '#0c4a6e' },
  devis_confirme: { bg: 'rgba(34,197,94,0.18)',   border: '#22c55e', text: '#14532d' },
  terminee:       { bg: 'rgba(107,114,128,0.18)', border: '#6b7280', text: '#374151' },
  annulee:        { bg: 'rgba(239,68,68,0.18)',   border: '#ef4444', text: '#7f1d1d' },
}

function legendDot(v) {
  const c = STATUS_STYLES[v]
  return c ? { backgroundColor: c.border } : {}
}

function monthReservations(mStart, mEnd) {
  return store.filteredReservations.filter(r => {
    const s = parseISO(r.date_start)
    const e = parseISO(r.date_end)
    return s <= mEnd && e >= mStart
  })
}

// Renvoie left/width en pourcentages relatifs à la zone jour (flex-1)
function getBar(r, mStart, mEnd, nDays) {
  const rStart = parseISO(r.date_start)
  const rEnd   = parseISO(r.date_end)
  if (rStart > mEnd || rEnd < mStart) return null

  const cs = rStart < mStart ? mStart : rStart
  const ce = rEnd   > mEnd   ? mEnd   : rEnd

  const si   = cs.getDate() - 1          // index 0-based dans le mois
  const span = ce.getDate() - si         // nombre de jours couverts

  const style        = STATUS_STYLES[r.status] || STATUS_STYLES.en_attente
  const startsInMonth = rStart >= mStart
  const endsInMonth   = rEnd   <= mEnd
  const rl = startsInMonth ? '4px' : '0'
  const rr = endsInMonth   ? '4px' : '0'

  return {
    leftPct:  (si / nDays) * 100,
    widthPct: (span / nDays) * 100,
    style,
    borderRadius: `${rl} ${rr} ${rr} ${rl}`,
    borderLeft: startsInMonth ? `3px solid ${style.border}` : 'none',
  }
}

function clientName(r) {
  if (!r.client) return '—'
  return [r.client.first_name, r.client.last_name].filter(Boolean).join(' ') || r.client.email || '—'
}

function produitLabel(r) {
  if (!r.produit_noms?.length) return ''
  return r.produit_noms.length === 1
    ? r.produit_noms[0]
    : `${r.produit_noms[0]} +${r.produit_noms.length - 1}`
}

function barText(r) {
  const pl = produitLabel(r)
  return pl ? `#${r.id} · ${pl}` : `#${r.id}`
}
</script>

<template>
  <div class="flex flex-col gap-4">

    <!-- ── Toolbar ─────────────────────────────────────────────────────────── -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <!-- Navigation -->
      <div class="flex items-center gap-1">
        <button class="btn btn-ghost btn-sm" @click="current = subMonths(current, 1)">‹ Préc.</button>
        <span class="text-sm font-bold capitalize px-2 min-w-[280px] text-center text-base-content/80">
          {{ title }}
        </span>
        <button class="btn btn-ghost btn-sm" @click="current = addMonths(current, 1)">Suiv. ›</button>
        <button class="btn btn-ghost btn-xs ml-1" @click="current = startOfMonth(new Date())">Aujourd'hui</button>
      </div>

      <!-- Toggle mode -->
      <div class="join">
        <button
          class="join-item btn btn-sm gap-1.5"
          :class="mode === 'client' ? 'btn-primary' : 'btn-ghost'"
          @click="mode = 'client'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
            <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z"/>
          </svg>
          Par client
        </button>
        <button
          class="join-item btn btn-sm gap-1.5"
          :class="mode === 'compact' ? 'btn-primary' : 'btn-ghost'"
          @click="mode = 'compact'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
            <path fill-rule="evenodd" d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75ZM2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm0 4.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd"/>
          </svg>
          Compact
        </button>
      </div>
    </div>

    <!-- ── Filtres statut ──────────────────────────────────────────────────── -->
    <div class="flex flex-wrap justify-center gap-2">
      <button
        v-for="f in statusFilters"
        :key="f.value"
        class="btn btn-sm gap-1.5"
        :class="store.filterStatus === f.value ? 'btn-primary' : 'btn-ghost'"
        @click="store.setFilter(f.value)"
      >
        <span v-if="f.value !== 'all'" class="w-2 h-2 rounded-full shrink-0" :style="legendDot(f.value)" />
        {{ f.label }}
        <span v-if="f.value === 'en_attente' && store.pendingCount > 0" class="badge badge-error badge-xs">
          {{ store.pendingCount }}
        </span>
      </button>
    </div>

    <!-- ── Sections par mois ───────────────────────────────────────────────── -->
    <div
      v-for="m in months"
      :key="m.label"
      class="bg-white rounded-box shadow border border-base-200 overflow-hidden"
    >
      <!-- Titre du mois -->
      <div class="flex items-center gap-3 px-4 py-2.5 border-b border-base-200 bg-base-50">
        <h3 class="text-sm font-bold capitalize text-base-content">{{ m.label }}</h3>
        <span class="text-xs text-base-content/35">
          {{ monthReservations(m.start, m.end).length }}
          réservation{{ monthReservations(m.start, m.end).length !== 1 ? 's' : '' }}
        </span>
      </div>

      <!-- En-tête jours -->
      <div class="flex border-b-2 border-base-200">
        <div
          v-if="mode === 'client'"
          :style="`width: ${LABEL_W}px`"
          class="shrink-0 border-r border-base-200 px-3 py-1.5 bg-base-50"
        >
          <span class="text-[10px] font-bold tracking-widest uppercase text-base-content/40">Client</span>
        </div>
        <div class="flex flex-1 bg-base-50">
          <div
            v-for="day in m.days"
            :key="day.toISOString()"
            class="flex-1 py-1 text-center border-r border-base-200 last:border-r-0"
            :class="[isWeekend(day) ? 'bg-base-200/50' : '', isToday(day) ? '!bg-primary/10' : '']"
          >
            <div class="text-[8px] font-medium uppercase text-base-content/35 leading-none">
              {{ format(day, 'EEE', { locale: fr }).slice(0, 1) }}
            </div>
            <div
              class="text-[10px] font-bold mt-0.5 leading-none"
              :class="isToday(day) ? 'text-primary' : 'text-base-content/50'"
            >
              {{ day.getDate() }}
            </div>
          </div>
        </div>
      </div>

      <!-- Vide -->
      <div
        v-if="store.loading"
        class="py-4 text-center text-xs text-base-content/30"
      >Chargement…</div>
      <div
        v-else-if="!monthReservations(m.start, m.end).length"
        class="py-3 text-center text-xs text-base-content/25"
      >Aucune réservation</div>

      <!-- Lignes réservations -->
      <div
        v-for="r in monthReservations(m.start, m.end)"
        :key="r.id"
        class="flex border-b border-base-100 last:border-b-0 hover:bg-base-50/50 transition-colors"
        style="height: 38px"
      >
        <!-- Colonne client (mode client) -->
        <div
          v-if="mode === 'client'"
          :style="`width: ${LABEL_W}px`"
          class="shrink-0 border-r border-base-200 px-3 flex flex-col justify-center bg-white"
        >
          <div class="text-[12px] font-semibold text-base-content leading-tight truncate">
            {{ clientName(r) }}
          </div>
          <div v-if="produitLabel(r)" class="text-[10px] text-base-content/40 leading-tight truncate mt-0.5">
            {{ produitLabel(r) }}
          </div>
        </div>

        <!-- Zone jours (flex-1 = remplit tt la place disponible) -->
        <div class="relative flex-1">
          <!-- Fond : week-end + aujourd'hui -->
          <div class="absolute inset-0 flex pointer-events-none">
            <div
              v-for="day in m.days"
              :key="day.toISOString()"
              class="flex-1 h-full border-r border-base-100 last:border-r-0"
              :class="[isWeekend(day) ? 'bg-base-200/15' : '', isToday(day) ? '!bg-primary/5' : '']"
            />
          </div>

          <!-- Barre -->
          <button
            v-if="getBar(r, m.start, m.end, m.days.length)"
            class="absolute top-1.5 bottom-1.5 flex items-center overflow-hidden text-[11px] font-medium hover:brightness-95 transition-all"
            :style="`
              left: ${getBar(r, m.start, m.end, m.days.length).leftPct}%;
              width: ${getBar(r, m.start, m.end, m.days.length).widthPct}%;
              background-color: ${getBar(r, m.start, m.end, m.days.length).style.bg};
              border-left: ${getBar(r, m.start, m.end, m.days.length).borderLeft};
              border-radius: ${getBar(r, m.start, m.end, m.days.length).borderRadius};
              color: ${getBar(r, m.start, m.end, m.days.length).style.text};
            `"
            :title="`${clientName(r)} — ${r.date_start} → ${r.date_end}`"
            @click="selectedId = r.id"
          >
            <span class="truncate px-2">{{ barText(r) }}</span>
          </button>
        </div>
      </div>

    </div>

  </div>

  <ReservationModal :reservation="selected" @close="selectedId = null" />
</template>
