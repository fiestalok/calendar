import { defineStore } from 'pinia'
import { getEntrepots } from '../api/directus'

export const useEntrepotsStore = defineStore('entrepots', {
  state: () => ({
    entrepots: [],
    loading: false,
    error: null,
  }),
  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        const raw = await getEntrepots()
        this.entrepots = raw.map(e => ({ ...e, created_at: e.date_created }))
      } catch (err) {
        this.error = err.message || 'Erreur de connexion'
      } finally {
        this.loading = false
      }
    },
  },
})
