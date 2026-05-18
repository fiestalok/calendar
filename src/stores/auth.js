import { defineStore } from 'pinia'
import { loginDirectus, getMe, setTokens, clearTokens } from '../api/directus'

const STORAGE_KEY = 'fiestalok_session'

function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) }
  catch { return null }
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    const s = loadSession()
    if (s?.access) setTokens(s.access, s.refresh)
    return {
      user: s?.user ?? null,
      accessToken: s?.access ?? null,
    }
  },
  getters: {
    isLoggedIn: (s) => !!s.accessToken && !!s.user,
    displayName: (s) => {
      const full = [s.user?.first_name, s.user?.last_name].filter(Boolean).join(' ')
      if (full) return full
      // email → keep only the part before @
      const email = s.user?.email ?? ''
      return email.split('@')[0] || 'Utilisateur'
    },
    initials: (s) => {
      const full = [s.user?.first_name, s.user?.last_name].filter(Boolean).join(' ')
      const name = full || (s.user?.email ?? '').split('@')[0] || 'U'
      return name.split(/[\s._-]/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    },
  },
  actions: {
    async login(email, password) {
      const { access_token, refresh_token } = await loginDirectus(email, password)
      const user = await getMe(access_token)
      this._save(user, access_token, refresh_token)
    },
    _save(user, access, refresh) {
      this.user = user
      this.accessToken = access
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, access, refresh }))
      setTokens(access, refresh)
    },
    updateTokens(access, refresh) {
      this.accessToken = access
      const s = loadSession()
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, access, refresh }))
    },
    logout() {
      this.user = null
      this.accessToken = null
      localStorage.removeItem(STORAGE_KEY)
      clearTokens()
    },
  },
})
