<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth   = useAuthStore()

const email    = ref('')
const password = ref('')
const loading  = ref(false)
const error    = ref(null)

async function submit() {
  if (!email.value || !password.value) return
  loading.value = true
  error.value   = null
  try {
    await auth.login(email.value.trim(), password.value)
    router.replace('/')
  } catch (err) {
    error.value = err.response?.status === 401
      ? 'Email ou mot de passe incorrect.'
      : 'Impossible de se connecter. Vérifiez votre connexion.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="min-h-screen flex items-center justify-center p-4"
    style="background: linear-gradient(135deg, #3d1a72 0%, #1a0840 100%);"
  >
    <div class="w-full max-w-[340px]">

      <!-- Brand -->
      <div class="flex items-center gap-3 mb-8 justify-center">
        <div
          class="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"
          style="background: linear-gradient(135deg, #059669, #047857);"
        >
          <span class="text-white font-black text-xl leading-none">F</span>
        </div>
        <div>
          <div class="text-white font-bold text-xl tracking-wide">Fiestalok</div>
          <div class="text-emerald-300/55 text-xs font-medium">CRM Événementiel</div>
        </div>
      </div>

      <!-- Card -->
      <div
        class="rounded-2xl p-6 shadow-2xl"
        style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(24px);"
      >
        <h2 class="text-white font-semibold text-base mb-5">Connexion</h2>

        <form @submit.prevent="submit" class="space-y-4">

          <div>
            <label class="block text-xs font-medium mb-1.5" style="color:rgba(255,255,255,0.55);">
              Email
            </label>
            <input
              v-model="email"
              type="email"
              placeholder="votre@email.fr"
              class="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-colors placeholder:opacity-30"
              style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.9);"
              :disabled="loading"
              autocomplete="email"
            />
          </div>

          <div>
            <label class="block text-xs font-medium mb-1.5" style="color:rgba(255,255,255,0.55);">
              Mot de passe
            </label>
            <input
              v-model="password"
              type="password"
              placeholder="••••••••"
              class="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-colors placeholder:opacity-30"
              style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.9);"
              :disabled="loading"
              autocomplete="current-password"
            />
          </div>

          <p v-if="error" class="text-xs text-red-400 text-center">{{ error }}</p>

          <button
            type="submit"
            class="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50 flex items-center justify-center mt-1"
            style="background: linear-gradient(135deg, #059669, #047857);"
            :disabled="loading || !email || !password"
          >
            <span v-if="!loading">Se connecter</span>
            <span v-else class="loading loading-spinner loading-sm"></span>
          </button>

        </form>
      </div>

    </div>
  </div>
</template>
