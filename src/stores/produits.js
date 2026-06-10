import { defineStore } from 'pinia'
import { getProduits, patchProduit, createProduit, deleteProduit as apiDelete } from '../api/directus'

function mapProduit(p) {
  return {
    id:               p.id,
    nom:              p.name ?? '',
    slug:             p.slug ?? '',
    categorie:        p.category?.name ?? (typeof p.category === 'string' ? p.category : ''),
    statut:           p.status ?? 'draft',
    prix_location:    p.price ?? 0,
    badge:            p.badge ?? null,
    description:      p.short_description ?? p.long_description ?? '',
    long_description: p.long_description ?? '',
    images_urls:      p.images_urls ?? [],
    image:            p.image ?? null,
    specs:            p.specs ?? null,
    jours_avant:      p.jours_avant ?? 0,
    jours_apres:      p.jours_apres ?? 0,
  }
}

export const useProduitsStore = defineStore('produits', {
  state: () => ({ produits: [], loading: false, error: null }),
  actions: {
    async fetch() {
      if (this.produits.length) return
      this.loading = true
      this.error = null
      try {
        const raw = await getProduits()
        this.produits = raw.map(mapProduit)
      } catch (err) {
        this.error = err.message || 'Erreur de chargement'
      } finally {
        this.loading = false
      }
    },

    async create(data) {
      const raw = await createProduit(data)
      if (raw) {
        const mapped = mapProduit(raw)
        this.produits.push(mapped)
        return mapped
      }
    },

    async patch(id, data) {
      const raw = await patchProduit(id, data)
      const idx = this.produits.findIndex(p => p.id === id)
      if (idx !== -1 && raw) {
        const p = this.produits[idx]
        if (raw.name              !== undefined) p.nom           = raw.name
        if (raw.slug              !== undefined) p.slug          = raw.slug
        if (raw.status            !== undefined) p.statut        = raw.status
        if (raw.price             !== undefined) p.prix_location = raw.price
        if (raw.badge             !== undefined) p.badge         = raw.badge
        if (raw.short_description !== undefined) p.description   = raw.short_description
        if (raw.long_description  !== undefined) p.long_description = raw.long_description
        if (raw.jours_avant       !== undefined) p.jours_avant   = raw.jours_avant
        if (raw.jours_apres       !== undefined) p.jours_apres   = raw.jours_apres
      }
    },

    async delete(id) {
      await apiDelete(id)
      this.produits = this.produits.filter(p => p.id !== id)
    },
  },
})
