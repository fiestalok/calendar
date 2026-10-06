<script setup>
import { computed } from 'vue'
import { STATUTS } from '../utils/statuts'

const props = defineProps({ status: { type: String, required: true } })

const config = computed(() => STATUTS[props.status] ?? { label: props.status, cls: 'bg-gray-100 text-gray-600' })
</script>

<template>
  <span class="inline-block text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap" :class="config.cls">{{ config.label }}</span>
</template>
