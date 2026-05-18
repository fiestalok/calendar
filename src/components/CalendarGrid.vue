<script setup>
import { computed } from 'vue'
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, parseISO,
  startOfDay, endOfDay, addDays, isSameDay
} from 'date-fns'
import CalendarDay from './CalendarDay.vue'

const props = defineProps({
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  reservations: { type: Array, default: () => [] }
})

defineEmits(['select-reservation'])

const days = computed(() => {
  const ref = new Date(props.year, props.month, 1)
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(ref), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(ref), { weekStartsOn: 1 })
  })
})

const forDay = (day) => {
  const ds = startOfDay(day)
  const de = endOfDay(day)
  const result = []
  for (const r of props.reservations) {
    const rs = parseISO(r.date_start)
    const re = parseISO(r.date_end)
    if (startOfDay(rs) <= de && endOfDay(re) >= ds) {
      result.push({ ...r, _blocking: false, _isStart: isSameDay(rs, day), _isEnd: isSameDay(re, day) })
    } else if (r.jours_avant_max || r.jours_apres_max) {
      const bs = addDays(rs, -(r.jours_avant_max ?? 0))
      const be = addDays(re,   r.jours_apres_max ?? 0)
      if (startOfDay(bs) <= de && endOfDay(be) >= ds) {
        result.push({ ...r, _blocking: true, _isStart: isSameDay(bs, day), _isEnd: isSameDay(be, day) })
      }
    }
  }
  return result
}
</script>

<template>
  <div class="rounded-box shadow overflow-hidden border border-base-200">
    <div class="grid grid-cols-7 bg-base-100 border-b border-base-200">
      <div
        v-for="d in ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']"
        :key="d"
        class="py-2 text-center text-xs font-semibold text-base-content/50 uppercase tracking-wide"
      >
        {{ d }}
      </div>
    </div>
    <div class="grid grid-cols-7 gap-px bg-base-200">
      <CalendarDay
        v-for="day in days"
        :key="day.toISOString()"
        :date="day"
        :is-current-month="isSameMonth(day, new Date(year, month, 1))"
        :reservations="forDay(day)"
        @select-reservation="$emit('select-reservation', $event)"
      />
    </div>
  </div>
</template>
