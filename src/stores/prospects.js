import { defineStore } from 'pinia'
import { getProspects, createProspect, patchProspect as apiPatch, deleteProspect as apiDelete } from '../api/directus'

export const useProspectsStore = defineStore('prospects', {
  state: () => ({ prospects: [], loading: false, error: null }),
  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        const raw = await getProspects()
        this.prospects = raw.map(p => ({ ...p, created_at: p.date_created }))
      } catch (err) {
        this.error = err.message || 'Erreur de connexion'
      } finally {
        this.loading = false
      }
    },

    async create(data) {
      const raw = await createProspect(data)
      if (raw) this.prospects.push({ ...raw, created_at: raw.date_created })
      return raw
    },

    async patch(id, data) {
      const raw = await apiPatch(id, data)
      const idx = this.prospects.findIndex(p => p.id === id)
      if (idx !== -1 && raw) this.prospects[idx] = { ...raw, created_at: raw.date_created }
    },

    async delete(id) {
      await apiDelete(id)
      this.prospects = this.prospects.filter(p => p.id !== id)
    },
  },
})
