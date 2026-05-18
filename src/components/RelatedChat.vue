<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  people: { type: Array, default: () => [] }
})

const openId = ref(null)
const input = ref('')
const logs = ref({})
const chatEl = ref(null)

const openPerson = computed(() => props.people.find(p => p.id === openId.value) ?? null)
const messages = computed(() => logs.value[openId.value] ?? [])

watch(() => props.people.map(p => p.id).join(','), () => { openId.value = null })

watch(messages, async () => {
  await nextTick()
  if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
}, { deep: true })

function open(person) {
  openId.value = person.id
  if (!logs.value[person.id]) logs.value[person.id] = []
}

function send() {
  const text = input.value.trim()
  if (!text || !openId.value) return
  if (!logs.value[openId.value]) logs.value[openId.value] = []
  logs.value[openId.value].push({
    id: Date.now(),
    text,
    fromMe: true,
    time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  })
  input.value = ''
}
</script>

<template>
  <div class="w-[250px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">

    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
      <button v-if="openId" @click="openId = null"
        class="text-gray-400 hover:text-gray-600 transition-colors -ml-0.5 flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
          <path fill-rule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clip-rule="evenodd" />
        </svg>
      </button>
      <span class="text-sm font-semibold text-gray-700 flex-1 truncate">
        {{ openPerson ? openPerson.name : 'Related' }}
      </span>
      <span v-if="!openId" class="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
        {{ people.length }}
      </span>
    </div>

    <!-- List -->
    <template v-if="!openId">
      <div class="flex-1 overflow-y-auto">
        <div v-if="!people.length"
          class="flex flex-col items-center justify-center h-full gap-2 text-gray-300 px-4 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-8 h-8">
            <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z" />
          </svg>
          <p class="text-xs leading-snug">Aucune personne liée</p>
        </div>

        <div v-for="person in people" :key="person.id"
          @click="open(person)"
          class="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-50 transition-colors">
          <div class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
               :style="{ background: person.color }">
            {{ person.initials }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-gray-900 truncate">{{ person.name }}</div>
            <div class="text-xs text-gray-400 truncate">{{ person.subtitle }}</div>
          </div>
          <div v-if="logs[person.id]?.length" class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
        </div>
      </div>
    </template>

    <!-- Chat thread -->
    <template v-else>
      <div class="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2 flex-shrink-0">
        <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
             :style="{ background: openPerson.color }">
          {{ openPerson.initials }}
        </div>
        <span class="text-xs text-gray-500 truncate">{{ openPerson.subtitle }}</span>
      </div>

      <div ref="chatEl" class="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        <div v-if="!messages.length" class="text-center text-xs text-gray-300 mt-6 px-2">
          Démarrez la conversation avec {{ openPerson.name }}
        </div>
        <div v-for="msg in messages" :key="msg.id"
          class="flex"
          :class="msg.fromMe ? 'justify-end' : 'justify-start'">
          <div class="max-w-[85%] px-3 py-1.5 rounded-2xl text-xs leading-relaxed"
               :class="msg.fromMe
                 ? 'bg-blue-600 text-white rounded-br-sm'
                 : 'bg-gray-100 text-gray-800 rounded-bl-sm'">
            {{ msg.text }}
            <div class="text-[10px] mt-0.5 opacity-60 text-right">{{ msg.time }}</div>
          </div>
        </div>
      </div>

      <div class="p-2 border-t border-gray-100 flex-shrink-0">
        <div class="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-1.5 border border-gray-200">
          <input v-model="input" type="text" placeholder="Message…"
            class="flex-1 text-xs bg-transparent outline-none text-gray-800 placeholder-gray-400"
            @keydown.enter="send" />
          <button @click="send" :disabled="!input.trim()"
            class="text-blue-600 hover:text-blue-700 disabled:opacity-30 transition-colors flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z" />
            </svg>
          </button>
        </div>
      </div>
    </template>

  </div>
</template>
