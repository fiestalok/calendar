import { defineStore } from 'pinia'
import { getArticles } from '../api/directus'

function mapArticle(a) {
  return {
    id:                   a.id,
    nom:                  a.name,
    reference:            a.slug           ?? '',
    categorie:            a.category?.name ?? '',
    statut:               a.status === 'published' ? 'disponible' : (a.status ?? 'disponible'),
    quantite_totale:      a.stock          ?? 0,
    quantite_disponible:  a.stock          ?? 0,
    quantite_en_location: 0,
    prix_location:        a.price          ?? 0,
    valeur_achat:         null,
    entrepot_id:          null,
    emplacement:          null,
    description:          a.short_description ?? a.long_description ?? '',
    notes:                null,
    prochaine_echeance:   null,
    factures:             [],
    // champs catalog
    badge:                a.badge,
    images_urls:          a.images_urls    ?? [],
    specs:                a.specs          ?? null,
  }
}

export const useStockStore = defineStore('stock', {
  state: () => ({
    items: [],
    loading: false,
    error: null,
  }),
  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        const raw = await getArticles()
        this.items = raw.map(mapArticle)
      } catch (err) {
        this.error = err.message || 'Erreur de connexion'
      } finally {
        this.loading = false
      }
    },
  },
})
