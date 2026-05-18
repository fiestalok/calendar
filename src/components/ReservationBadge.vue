<script setup>
import { computed } from 'vue'

const props = defineProps({
  reservation: { type: Object, required: true },
})
defineEmits(['click'])

const isBlocking = computed(() => props.reservation._blocking === true)
const isStart = computed(() => props.reservation._isStart !== false)
const isEnd = computed(() => props.reservation._isEnd !== false)

const statusStyle = computed(() => {
  if (isBlocking.value) return 'bg-base-200/60 border-base-300 text-base-content/40 border-dashed'
  return {
    en_attente:     'bg-warning/20 border-warning/60 text-base-content',
    devis_realise:  'bg-info/20 border-info/60 text-base-content',
    devis_confirme: 'bg-success/20 border-success/60 text-base-content',
    terminee:       'bg-neutral/20 border-neutral/60 text-base-content',
    annulee:        'bg-error/20 border-error/60 text-base-content',
  }[props.reservation.status] ?? 'bg-base-200 border-base-300 text-base-content'
})

const clientName = computed(() => {
  const c = props.reservation.client
  return c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : 'Client'
})

const produitLabel = computed(() => {
  const noms = props.reservation.produit_noms
  if (!noms?.length) return null
  return noms.length === 1 ? noms[0] : `${noms[0]} +${noms.length - 1}`
})

const label = computed(() => {
  if (isBlocking.value) {
    return produitLabel.value ? `⏸ ${produitLabel.value}` : `⏸ ${clientName.value}`
  }
  return produitLabel.value ? `${clientName.value} · ${produitLabel.value}` : clientName.value
})

const title = computed(() => {
  if (isBlocking.value) {
    return `Blocage logistique — ${clientName.value}${produitLabel.value ? ` (${produitLabel.value})` : ''}`
  }
  return produitLabel.value ? `${clientName.value} · ${produitLabel.value}` : clientName.value
})

// Build bar width/margin/rounding based on span position
const barClass = computed(() => [
  isStart.value ? '' : '-ml-1',
  isStart.value && isEnd.value
    ? 'w-full'
    : !isStart.value && !isEnd.value
    ? 'w-[calc(100%+0.5rem)]'
    : 'w-[calc(100%+0.25rem)]',
  isStart.value ? 'rounded-l' : 'rounded-l-none',
  isEnd.value   ? 'rounded-r' : 'rounded-r-none',
  isStart.value ? 'border-l' : 'border-l-0',
  isEnd.value   ? 'border-r' : 'border-r-0',
  isStart.value ? 'pl-1.5' : 'pl-0.5',
  isEnd.value   ? 'pr-1.5' : 'pr-0.5',
])
</script>

<template>
  <button
    class="text-left text-xs py-0.5 border truncate hover:opacity-75 transition-opacity leading-5"
    :class="[statusStyle, barClass]"
    :title="title"
    @click.stop="$emit('click')"
  >
    {{ label }}
  </button>
</template>
