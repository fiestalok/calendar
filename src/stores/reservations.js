import { defineStore } from 'pinia'
import {
  getReservations, getAllReservationsProduits, getAllReservationsArticles,
  getReservationsTarifs, getReservationsSuivi, patchReservation,
} from '../api/directus'
import { montantReservation } from '../utils/tarifs'

// Nombre de produits d'une réservation sans article principal affecté. Même règle que la fenêtre
// de réservation : un article dont le produit est inconnu est rattaché à un produit resté sans article.
function produitsSansArticle(lignes, articles) {
  const principaux = articles.filter(a => a.type !== 'secondaire')
  const couverts   = new Set(principaux.map(a => a.produit_id?.id ?? a.produit_id).filter(Boolean))
  const sans       = lignes.filter(l => !couverts.has(l.produits_id?.id ?? l.produits_id)).length
  const orphelins  = principaux.filter(a => !a.produit_id).length
  if (!orphelins || !sans) return sans
  return orphelins === sans ? 0 : sans - 1
}

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
        const [rawReservations, rawJunctions, rawTarifs, rawArticles, rawSuivi] = await Promise.all([
          getReservations(),
          getAllReservationsProduits(),
          getReservationsTarifs(),
          getAllReservationsArticles(),
          getReservationsSuivi(),
        ])
        const tarifs = Object.fromEntries(rawTarifs.map(t => [t.id, t]))
        const suivi  = Object.fromEntries(rawSuivi.map(s => [s.id, s]))

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

        // Articles affectés à chaque réservation (null si leur lecture a échoué)
        const articles = rawArticles && {}
        for (const ra of rawArticles ?? []) {
          if (ra.articles_id && typeof ra.articles_id === 'object') (articles[ra.reservations_id] ??= []).push(ra.articles_id)
        }

        this.reservations = rawReservations.map(r => {
          const lignes = lookup[r.id]?.lignes ?? []
          const tarif  = tarifs[r.id] ?? {}
          return {
            ...r,
            jours_avant_max: lookup[r.id]?.jours_avant ?? 0,
            jours_apres_max: lookup[r.id]?.jours_apres ?? 0,
            produit_noms:    lookup[r.id]?.noms         ?? [],
            lignes,
            // Livraison cochée dans le CRM (delivery ne reflète que la demande faite sur le site)
            livraison:       !!tarif.livraison,
            distance_km:     tarif.distance_km ?? 0,
            // Montant calculé comme le total du devis (total_price n'est rempli que par le site)
            montant:         montantReservation({ ...r, ...tarif }, lignes),
            produits_sans_article: articles ? produitsSansArticle(lignes, articles[r.id] ?? []) : null,
            date_created:    suivi[r.id]?.date_created ?? null,
            date_devis:      suivi[r.id]?.fichier_devis?.uploaded_on ?? null,
          }
        })
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
