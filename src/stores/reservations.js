import { defineStore } from 'pinia'
import { getReservations, getAllReservationsProduits, getReservationsTarifs, patchReservation } from '../api/directus'
import { montantReservation } from '../utils/tarifs'

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
      if (this.loading) return
      this.loading = true
      this.error = null
      try {
        const [rawReservations, rawJunctions, rawTarifs] = await Promise.all([
          getReservations(),
          getAllReservationsProduits(),
          getReservationsTarifs(),
        ])
        const tarifs = Object.fromEntries(rawTarifs.map(t => [t.id, t]))

        // For each reservation: product lines, product names + max blocking days
        const lookup = {}
        for (const rp of rawJunctions) {
          const id = rp.reservations_id
          // produits_id can come back as an object {id,name,jours_avant,jours_apres}
          // or as a bare integer if the relation didn't resolve — handle both
          const prod = typeof rp.produits_id === 'object' ? rp.produits_id : null
          if (!lookup[id]) lookup[id] = { jours_avant: 0, jours_apres: 0, noms: [], lignes: [] }
          lookup[id].lignes.push(rp)
          if (prod) {
            lookup[id].jours_avant = Math.max(lookup[id].jours_avant, prod.jours_avant ?? 0)
            lookup[id].jours_apres = Math.max(lookup[id].jours_apres, prod.jours_apres ?? 0)
            if (prod.name && !lookup[id].noms.includes(prod.name)) lookup[id].noms.push(prod.name)
          }
        }

        this.reservations = rawReservations.map(r => ({
          ...r,
          jours_avant_max: lookup[r.id]?.jours_avant ?? 0,
          jours_apres_max: lookup[r.id]?.jours_apres ?? 0,
          produit_noms:    lookup[r.id]?.noms         ?? [],
          // Montant calculé comme le total du devis (total_price n'est rempli que par le site)
          montant:         montantReservation(tarifs[r.id] ?? {}, lookup[r.id]?.lignes ?? []),
        }))
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
    updateField(id, fields) {
      const index = this.reservations.findIndex(r => r.id === id)
      if (index !== -1) {
        this.reservations[index] = { ...this.reservations[index], ...fields }
      }
    },
    setFilter(status) {
      this.filterStatus = status
    }
  }
})
