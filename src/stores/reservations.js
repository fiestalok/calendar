import { defineStore } from 'pinia'
import { getReservations, patchReservation, authenticate } from '../api/directus'

export const useReservationsStore = defineStore('reservations', {
  state: () => ({
    reservations: [],
    loading: false,
    error: null,
    filterStatus: 'all'
  }),
  getters: {
    filteredReservations(state) {
      if (state.filterStatus === 'all') return state.reservations
      return state.reservations.filter(r => r.status === state.filterStatus)
    },
    pendingCount(state) {
      return state.reservations.filter(r => r.status === 'en_attente').length
    }
  },
  actions: {
    async fetchReservations() {
      this.loading = true
      this.error = null
      try {
        await authenticate()
        this.reservations = await getReservations()
      } catch (err) {
        this.error = err.message || 'Erreur de connexion au serveur'
      } finally {
        this.loading = false
      }
    },
    async updateStatus(id, status) {
      await patchReservation(id, { status })
      const index = this.reservations.findIndex(r => r.id === id)
      if (index !== -1) {
        this.reservations[index] = { ...this.reservations[index], status }
      }
    },
    setFilter(status) {
      this.filterStatus = status
    }
  }
})
