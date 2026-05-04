<script setup>
import { computed } from 'vue'
import { isToday, getDate } from 'date-fns'
import ReservationBadge from './ReservationBadge.vue'

const props = defineProps({
  date: { type: Date, required: true },
  isCurrentMonth: { type: Boolean, default: true },
  reservations: { type: Array, default: () => [] }
})

defineEmits(['select-reservation'])

const dayNumber = computed(() => getDate(props.date))
const today = computed(() => isToday(props.date))
const visible = computed(() => props.reservations.slice(0, 3))
const extra = computed(() => Math.max(0, props.reservations.length - 3))
</script>

<template>
  <div
    class="min-h-[90px] p-1 transition-colors"
    :class="isCurrentMonth ? 'bg-base-100' : 'bg-base-100/40'"
  >
    <div class="flex justify-end mb-1">
      <span
        class="w-6 h-6 text-xs flex items-center justify-center rounded-full font-medium"
        :class="[
          today ? 'bg-primary text-primary-content' : '',
          !isCurrentMonth ? 'text-base-content/30' : 'text-base-content'
        ]"
      >
        {{ dayNumber }}
      </span>
    </div>
    <div class="space-y-0.5">
      <ReservationBadge
        v-for="r in visible"
        :key="r.id"
        :reservation="r"
        @click="$emit('select-reservation', r.id)"
      />
      <p v-if="extra > 0" class="text-xs text-base-content/40 px-1 leading-5">
        +{{ extra }} autre{{ extra > 1 ? 's' : '' }}
      </p>
    </div>
  </div>
</template>
