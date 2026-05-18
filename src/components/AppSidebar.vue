<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReservationsStore } from '../stores/reservations'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const store = useReservationsStore()
const auth  = useAuthStore()
const pendingCount = computed(() => store.pendingCount)

const router = useRouter()

function logout() {
  auth.logout()
  router.push('/login')
}

function isActive(to, exact = false) {
  if (exact) return route.path === to
  return route.path === to || route.path.startsWith(to + '/')
}

// SVG paths (Heroicons mini solid 20px)
const ICONS = {
  home:      '<path fill-rule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clip-rule="evenodd"/>',
  calendar:  '<path fill-rule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clip-rule="evenodd"/>',
  users:     '<path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z"/>',
  contact:   '<path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-5.5-2.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10 12a5.99 5.99 0 0 0-4.793 2.39A6.483 6.483 0 0 0 10 16.5a6.483 6.483 0 0 0 4.793-2.11A5.99 5.99 0 0 0 10 12Z" clip-rule="evenodd"/>',
  prospect:  '<path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clip-rule="evenodd"/>',
  produits:  '<path d="M2 3a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2Z"/><path fill-rule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 0 1-1.99 1.79H4.802a2 2 0 0 1-1.99-1.79L2 7.5ZM7 11a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1Z" clip-rule="evenodd"/>',
  articles:  '<path fill-rule="evenodd" d="M4 4a2 2 0 0 0-2 2v1h16V6a2 2 0 0 0-2-2H4Zm-2 5v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9H2Zm4 3a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Z" clip-rule="evenodd"/>',
  gammes:    '<path d="M5.127 3.502 5.25 3.5h9.5c.041 0 .082 0 .123.002A2.251 2.251 0 0 0 12.75 2h-5.5a2.25 2.25 0 0 0-2.123 1.502ZM1 10.25A2.25 2.25 0 0 1 3.25 8h13.5A2.25 2.25 0 0 1 19 10.25v5.5A2.25 2.25 0 0 1 16.75 18H3.25A2.25 2.25 0 0 1 1 15.75v-5.5ZM3.25 6.5c-.04 0-.082 0-.123.002A2.25 2.25 0 0 1 5.25 5h9.5c.98 0 1.814.627 2.123 1.502a3.819 3.819 0 0 0-.123-.002H3.25Z"/>',
  booking:   '<path fill-rule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 15h-1.5l.5 2.75a.75.75 0 0 1-1.47.26L12.38 15H7.62l-.4 2.01a.75.75 0 0 1-1.47-.26L6.25 15h-1.5A2.75 2.75 0 0 1 2 12.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v3.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-3.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clip-rule="evenodd"/>',
  warehouse: '<path fill-rule="evenodd" d="M1 2.75A.75.75 0 0 1 1.75 2h16.5a.75.75 0 0 1 0 1.5H18v8.75A2.75 2.75 0 0 1 15.25 15h-1.072l.798 3.06a.75.75 0 0 1-1.452.39L13.41 18H6.59l-.114.45a.75.75 0 0 1-1.452-.39L5.823 15H4.75A2.75 2.75 0 0 1 2 12.25V3.5h-.25A.75.75 0 0 1 1 2.75ZM7.373 15l-.391 1.5h6.036l-.391-1.5H7.373Zm5.52-9.252a.75.75 0 1 0-1.06-1.06l-1.83 1.83-.97-.97a.75.75 0 0 0-1.06 0L6.22 8.28a.75.75 0 1 0 1.06 1.06l1.22-1.22.97.97a.75.75 0 0 0 1.06 0l2.363-2.349Z" clip-rule="evenodd"/>',
  invoice:   '<path fill-rule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0-6a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z" clip-rule="evenodd"/>',
  faq:       '<path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clip-rule="evenodd"/>',
}

const NAV = [
  { to: '/',         label: 'Accueil',                  icon: 'home',      color: '#f59e0b', exact: true },
  { to: '/planning',      label: 'Planning',      icon: 'calendar', color: '#3b82f6', badge: true },
  { to: '/reservations',  label: 'Réservations',  icon: 'booking',  color: '#0ea5e9' },
  { section: 'Ventes' },
  { to: '/clients',  label: 'Clients',                  icon: 'users',     color: '#10b981' },
  { to: '/contacts', label: 'Contacts',                 icon: 'contact',   color: '#06b6d4' },
  { to: '/prospects',label: 'Prospects',                icon: 'prospect',  color: '#10b981' },
  { section: 'Matériel' },
  { to: '/produits',  label: 'Produits',  icon: 'produits',  color: '#f97316' },
  { to: '/articles',  label: 'Articles',  icon: 'articles',  color: '#ea580c' },
  { to: '/gammes',    label: 'Gammes',    icon: 'gammes',    color: '#047857' },
  { to: '/entrepots', label: 'Entrepôts', icon: 'warehouse', color: '#64748b' },
  { section: 'Compta' },
  { to: '/factures', label: 'Factures',                 icon: 'invoice',   color: '#047857' },
  { section: 'Outils' },
  { to: '/faq',      label: 'Transfert de compétence',  icon: 'faq',       color: '#059669' },
]
</script>

<template>
  <aside
    class="w-[220px] flex flex-col h-screen flex-shrink-0 overflow-hidden"
    style="background: linear-gradient(180deg, #3d1a72 0%, #2d1156 100%);"
  >
    <!-- ── Logo ── -->
    <div class="px-4 pt-5 pb-3 flex items-center gap-2.5">
      <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
           style="background: linear-gradient(135deg, #059669, #047857);">
        <span class="text-white font-black text-base leading-none">F</span>
      </div>
      <div class="min-w-0">
        <div class="text-white font-bold text-sm leading-tight tracking-wide">Fiestalok</div>
        <div class="text-emerald-300/60 text-[10px] font-medium tracking-wide mt-0.5">CRM Événementiel</div>
      </div>
    </div>

    <!-- ── Search ── -->
    <div class="px-3 pb-2">
      <div class="relative">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
             class="w-3 h-3 text-white/30 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <path fill-rule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clip-rule="evenodd"/>
        </svg>
        <input
          type="text"
          placeholder="Rechercher…"
          class="w-full text-xs pl-7 pr-3 py-1.5 rounded-lg border border-white/10 focus:outline-none focus:border-white/25 transition-colors"
          style="background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.85);"
        />
      </div>
    </div>

    <!-- ── Nav ── -->
    <nav class="flex-1 px-3 overflow-y-auto pb-2 space-y-0.5">

      <template v-for="item in NAV" :key="item.to || item.section">

        <!-- Section label -->
        <div v-if="item.section" class="px-1 pt-3.5 pb-1">
          <div class="flex items-center gap-2">
            <div class="h-px flex-1 bg-white/[0.12]" />
            <span class="text-[9px] font-bold tracking-[0.14em] uppercase text-white/30 flex-shrink-0">{{ item.section }}</span>
            <div class="h-px flex-1 bg-white/[0.12]" />
          </div>
        </div>

        <!-- Nav item -->
        <div v-else class="relative">
          <div
            v-if="isActive(item.to, item.exact)"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-white/70 pointer-events-none"
          />
          <RouterLink
            :to="item.to"
            class="flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-150"
            :class="isActive(item.to, item.exact) ? 'bg-white/[0.14]' : 'hover:bg-white/[0.07]'"
          >
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm"
              :style="{ background: item.color }"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-white" v-html="ICONS[item.icon]" />
            </div>
            <span
              class="flex-1 text-sm font-medium leading-tight"
              :class="isActive(item.to, item.exact) ? 'text-white' : 'text-white/65'"
            >{{ item.label }}</span>
            <span
              v-if="item.badge && pendingCount > 0"
              class="text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none flex-shrink-0"
              style="background:#ef4444;"
            >{{ pendingCount }}</span>
          </RouterLink>
        </div>

      </template>
    </nav>

    <!-- ── User ── -->
    <div class="px-3 py-3 border-t border-white/10">
      <div class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl">
        <div
          class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
          style="background: linear-gradient(135deg, #059669, #047857);"
        >
          {{ auth.initials }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[11px] font-semibold text-white/80 truncate leading-tight">{{ auth.displayName }}</div>
          <div class="text-[10px] text-white/35 truncate mt-0.5">{{ auth.user?.email }}</div>
        </div>
        <button
          @click="logout"
          class="p-1.5 rounded-lg transition-colors flex-shrink-0"
          style="color:rgba(255,255,255,0.3);"
          title="Se déconnecter"
          @mouseenter="$event.currentTarget.style.background='rgba(255,255,255,0.08)'; $event.currentTarget.style.color='rgba(255,255,255,0.7)'"
          @mouseleave="$event.currentTarget.style.background=''; $event.currentTarget.style.color='rgba(255,255,255,0.3)'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
            <path fill-rule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clip-rule="evenodd"/>
            <path fill-rule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-.943a.75.75 0 1 0-1.004-1.114l-2.5 2.25a.75.75 0 0 0 0 1.114l2.5 2.25a.75.75 0 1 0 1.004-1.114l-1.048-.943h9.546A.75.75 0 0 0 19 10Z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
    </div>

  </aside>
</template>
