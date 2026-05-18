<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  // [{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', type: 'reservation'|'prep'|'retour' }]
  blockedRanges: { type: Array, default: () => [] },
  loading:       { type: Boolean, default: false },
})

const DAYS_FR  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const current = ref(new Date())

function prevMonth() {
  const d = new Date(current.value)
  d.setMonth(d.getMonth() - 1)
  current.value = d
}
function nextMonth() {
  const d = new Date(current.value)
  d.setMonth(d.getMonth() + 1)
  current.value = d
}

const monthLabel = computed(() =>
  current.value.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
)

const days = computed(() => {
  const y = current.value.getFullYear()
  const m = current.value.getMonth()
  const firstDay = new Date(y, m, 1)
  const lastDay  = new Date(y, m + 1, 0)

  // offset so week starts on Monday (getDay: 0=Sun,1=Mon…)
  const offset = (firstDay.getDay() + 6) % 7
  const result = []

  for (let i = offset - 1; i >= 0; i--) {
    const d = new Date(y, m, -i)
    result.push({ date: d, current: false })
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    result.push({ date: new Date(y, m, i), current: true })
  }
  while (result.length % 7 !== 0) {
    const last = result[result.length - 1].date
    result.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), current: false })
  }
  return result
})

function toStr(date) {
  return date.toISOString().slice(0, 10)
}

function getDayType(date) {
  const s = toStr(date)
  for (const r of props.blockedRanges) {
    if (s >= r.start && s <= r.end) return r.type
  }
  return null
}

function isToday(date) {
  return toStr(date) === toStr(new Date())
}

const DAY_CLS = {
  reservation: 'bg-red-500 text-white rounded-md',
  prep:        'bg-amber-300 text-amber-900 rounded-md',
  retour:      'bg-amber-300 text-amber-900 rounded-md',
}
</script>

<template>
  <div class="select-none">

    <!-- Loading -->
    <div v-if="loading" class="py-6 text-center text-sm text-gray-400">Chargement…</div>

    <div v-else>
      <!-- Navigation -->
      <div class="flex items-center justify-between mb-3">
        <button @click="prevMonth" class="p-1 hover:bg-gray-100 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-gray-500">
            <path fill-rule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd"/>
          </svg>
        </button>
        <span class="text-sm font-semibold text-gray-700 capitalize">{{ monthLabel }}</span>
        <button @click="nextMonth" class="p-1 hover:bg-gray-100 rounded-lg transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-gray-500">
            <path fill-rule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06L7.28 11.78a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>

      <!-- Header -->
      <div class="grid grid-cols-7 mb-1">
        <div v-for="d in DAYS_FR" :key="d" class="text-center text-[10px] font-semibold text-gray-400 uppercase py-1">{{ d }}</div>
      </div>

      <!-- Grid -->
      <div class="grid grid-cols-7 gap-0.5">
        <div v-for="(day, i) in days" :key="i"
          class="h-8 flex items-center justify-center text-xs transition-colors"
          :class="[
            !day.current ? 'text-gray-300' : '',
            isToday(day.date) && !getDayType(day.date) ? 'ring-2 ring-blue-400 rounded-md font-bold text-blue-600' : '',
            getDayType(day.date) ? DAY_CLS[getDayType(day.date)] : (day.current ? 'text-gray-700 hover:bg-gray-100 rounded-md' : ''),
          ]">
          {{ day.date.getDate() }}
        </div>
      </div>

      <!-- Légende -->
      <div class="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded bg-amber-300"></div>
          <span class="text-[10px] text-gray-500">Préparation / Retour</span>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded bg-red-500"></div>
          <span class="text-[10px] text-gray-500">Réservé</span>
        </div>
      </div>
    </div>

  </div>
</template>
