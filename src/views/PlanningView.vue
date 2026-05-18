<script setup>
import { ref } from 'vue'
import CalendarView from './CalendarView.vue'
import ListView from './ListView.vue'

const tab = ref('calendar')
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Page header (Creatio style) ── -->
    <div class="bg-white border-b border-gray-200 flex items-center flex-shrink-0">
      <!-- Title -->
      <div class="px-6 py-3 border-r border-gray-200">
        <div class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
            <path fill-rule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clip-rule="evenodd" />
          </svg>
          <h1 class="text-lg font-semibold text-gray-900">Planning</h1>
        </div>
      </div>

      <!-- Tabs inside header bar -->
      <div class="flex h-full">
        <button
          class="px-5 h-full text-[13px] font-semibold border-b-2 transition-colors uppercase tracking-wide"
          :class="tab === 'calendar'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-400 hover:text-gray-600'"
          @click="tab = 'calendar'"
        >Calendrier</button>
        <button
          class="px-5 h-full text-[13px] font-semibold border-b-2 transition-colors uppercase tracking-wide"
          :class="tab === 'list'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-400 hover:text-gray-600'"
          @click="tab = 'list'"
        >Liste</button>
      </div>
    </div>

    <!-- ── Content ── -->
    <div class="flex-1 overflow-y-auto bg-gray-100 p-6">
      <CalendarView v-show="tab === 'calendar'" />
      <ListView v-show="tab === 'list'" />
    </div>

  </div>
</template>
