<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useCommentsStore } from '../stores/comments'
import { useAuthStore } from '../stores/auth'

const props = defineProps({
  recordType: { type: String, required: true },
  recordId:   { type: [String, Number], required: true },
})

const store    = useCommentsStore()
const auth     = useAuthStore()
const newText  = ref('')
const posting  = ref(false)

const k        = computed(() => `${props.recordType}_${props.recordId}`)
const comments = computed(() => store.cache[k.value] ?? [])
const loading  = computed(() => !!store.loading[k.value])
const fetchError = computed(() => store.errors[k.value] ?? null)

onMounted(() => store.fetch(props.recordType, props.recordId))
watch(() => props.recordId, () => store.fetch(props.recordType, props.recordId))

async function post() {
  if (!newText.value.trim() || posting.value) return
  posting.value = true
  try {
    await store.create(props.recordType, props.recordId, auth.displayName, newText.value.trim())
    newText.value = ''
  } finally {
    posting.value = false
  }
}

async function remove(id) {
  await store.delete(id, props.recordType, props.recordId)
}

function formatTime(d) {
  return new Date(d).toLocaleString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
function initials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
</script>

<template>
  <div class="bg-white rounded-xl shadow-sm overflow-hidden mt-4">
    <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path fill-rule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902.848.137 1.705.248 2.57.331v3.443a.75.75 0 0 0 1.28.53l3.58-3.579a.78.78 0 0 1 .527-.224 41.202 41.202 0 0 0 5.183-.5c1.437-.232 2.43-1.49 2.43-2.903V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0 0 10 2Zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM8 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm5 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
      </svg>
      <span class="text-sm font-semibold text-gray-700">Commentaires</span>
      <span v-if="comments.length" class="ml-auto text-xs text-gray-400">{{ comments.length }}</span>
    </div>

    <div v-if="loading" class="px-5 py-6 text-center text-sm text-gray-400">Chargement…</div>
    <div v-else-if="fetchError" class="px-5 py-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 flex-shrink-0">
        <path fill-rule="evenodd" d="M6.701 2.25c.577-1 2.026-1 2.598 0l5.196 9a1.5 1.5 0 0 1-1.299 2.25H2.804a1.5 1.5 0 0 1-1.3-2.25l5.197-9ZM8 5a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 5Zm0 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
      </svg>
      {{ fetchError }}
    </div>
    <div v-else class="divide-y divide-gray-50 max-h-72 overflow-y-auto">
      <div v-if="comments.length === 0" class="px-5 py-6 text-center text-sm text-gray-400">
        Aucun commentaire pour l'instant.
      </div>
      <div v-for="c in comments" :key="c.id" class="px-5 py-4 flex gap-3 group">
        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
          {{ initials(c.author) }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2 mb-1">
            <span class="text-sm font-semibold text-gray-900">{{ c.author }}</span>
            <span class="text-[11px] text-gray-400">{{ formatTime(c.date_created) }}</span>
            <button @click="remove(c.id)"
              class="ml-auto opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-xs">
              ✕
            </button>
          </div>
          <p class="text-sm text-gray-700 leading-relaxed">{{ c.text }}</p>
        </div>
      </div>
    </div>

    <div class="border-t border-gray-100 p-4 bg-gray-50">
      <div class="flex items-center gap-3 mb-2">
        <div class="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
          {{ initials(auth.displayName) }}
        </div>
        <span class="text-sm font-medium text-gray-700">{{ auth.displayName }}</span>
      </div>
      <div class="flex gap-2">
        <input v-model="newText" type="text" placeholder="Ajouter un commentaire…"
          class="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          @keydown.enter="post"/>
        <button @click="post" :disabled="posting || !newText.trim()"
          class="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {{ posting ? '…' : 'Envoyer' }}
        </button>
      </div>
    </div>
  </div>
</template>
