<script setup>
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFaqStore } from '../stores/faq'

const store = useFaqStore()
const { categories: faq, loading, error } = storeToRefs(store)
onMounted(() => store.fetch())
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Page header (Creatio style) ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path d="M10.75 16.82A7.462 7.462 0 0 1 10 17c-.386 0-.766-.02-1.138-.06a.75.75 0 0 1-.457-1.281l.984-.984a.75.75 0 0 1 .993-.07 5.01 5.01 0 0 0 1.562.518.75.75 0 0 1 .184 1.386l-.378.22ZM10 3a7 7 0 1 0 0 14A7 7 0 0 0 10 3ZM1 10a9 9 0 1 1 18 0 9 9 0 0 1-18 0Zm9-3a3 3 0 0 0-2.906 2.25.75.75 0 0 1-1.457-.358A4.5 4.5 0 0 1 13.5 10a.75.75 0 0 1-1.5 0 3 3 0 0 0-3-3Z" />
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Transfert de compétence</h1>
      <span class="text-xs text-gray-400">Procédures internes</span>
    </div>

    <!-- ── Scrollable content ── -->
    <div class="flex-1 overflow-y-auto bg-gray-100 p-6">

      <div v-if="loading" class="flex items-center justify-center py-16 text-sm text-gray-400">Chargement…</div>
      <div v-else-if="error" class="text-sm text-red-500 text-center py-8">{{ error }}</div>
      <div v-else class="space-y-6 max-w-3xl">
        <div v-for="category in faq" :key="category.id">

          <!-- Category header (Creatio section style) -->
          <div class="flex items-center gap-2 mb-3">
            <span class="text-[#e65100] font-bold">▲</span>
            <span class="text-base font-semibold text-gray-800">{{ category.icon }} {{ category.categorie }}</span>
          </div>

          <!-- Questions -->
          <div class="space-y-2">
            <div
              v-for="item in category.questions"
              :key="item.id"
              class="collapse collapse-arrow bg-white shadow-sm rounded-xl border border-gray-100"
            >
              <input type="checkbox" />
              <div class="collapse-title text-sm font-medium text-gray-800 py-4 pr-10 min-h-0">
                {{ item.question }}
              </div>
              <div class="collapse-content">
                <div class="text-sm text-gray-600 leading-relaxed whitespace-pre-line pb-2 pt-0">{{ item.reponse }}</div>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  </div>
</template>
