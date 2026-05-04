<script setup>
import { computed } from 'vue'

const props = defineProps({ status: { type: String, required: true } })

const config = computed(() => ({
  en_attente: { label: 'En attente', cls: 'badge-warning' },
  devis_realise: { label: 'Devis réalisé', cls: 'badge-info' },
  devis_confirme: { label: 'Devis confirmé', cls: 'badge-success' },
  terminee: { label: 'Terminée', cls: 'badge-neutral' },
  annulee: { label: 'Annulée', cls: 'badge-error' }
}[props.status] ?? { label: props.status, cls: 'badge-ghost' }))
</script>

<template>
  <span class="badge" :class="config.cls">{{ config.label }}</span>
</template>
