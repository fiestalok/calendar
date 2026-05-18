<script setup>
const factures = []
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Page header ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-gray-400">
        <path fill-rule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0-6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clip-rule="evenodd"/>
      </svg>
      <h1 class="text-lg font-semibold text-gray-900">Factures</h1>
    </div>

    <!-- ── Empty state ── -->
    <div class="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4">
      <div class="w-16 h-16 rounded-2xl flex items-center justify-center" style="background:#f3f0ff;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-8 h-8" style="color:#047857;">
          <path fill-rule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0-6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clip-rule="evenodd"/>
        </svg>
      </div>
      <div class="text-center">
        <p class="text-base font-semibold text-gray-600 mb-1">Module Factures</p>
        <p class="text-sm text-gray-400">Cette section est en cours de développement.</p>
      </div>
    </div>

  </div>
</template>
