<script setup>
import { computed } from 'vue'

const props = defineProps({ reservation: { type: Object, required: true } })
defineEmits(['click'])

const statusStyle = computed(() => ({
  en_attente: 'bg-warning/20 border-warning/60 text-base-content',
  devis_realise: 'bg-info/20 border-info/60 text-base-content',
  devis_confirme: 'bg-success/20 border-success/60 text-base-content',
  terminee: 'bg-neutral/20 border-neutral/60 text-base-content',
  annulee: 'bg-error/20 border-error/60 text-base-content'
}[props.reservation.status] ?? 'bg-base-200 border-base-300 text-base-content'))

const label = computed(() => {
  const c = props.reservation.client
  const name = c ? `${c.first_name} ${c.last_name}` : 'Client'
  const art = props.reservation.articles?.[0]?.articles_id?.name
  return art ? `${name} · ${art}` : name
})
</script>

<template>
  <button
    class="w-full text-left text-xs px-1.5 py-0.5 rounded border truncate hover:opacity-75 transition-opacity leading-5"
    :class="statusStyle"
    :title="label"
    @click.stop="$emit('click')"
  >
    {{ label }}
  </button>
</template>
