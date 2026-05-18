import { defineStore } from 'pinia'
import { getArticles, createArticle, patchArticle as apiPatch, deleteArticle as apiDelete } from '../api/directus'

function mapArticle(a) {
  return {
    id:           a.id,
    produit_id:   a.produit_id?.id   ?? a.produit_id,
    produit_nom:  a.produit_id?.name ?? '',
    name:         a.name       ?? '',
    reference:    a.reference  ?? '',
    etat:         a.etat       ?? 'disponible',
    entrepot_id:  a.entrepot_id?.id  ?? a.entrepot_id,
    entrepot_nom: a.entrepot_id?.nom ?? '',
    emplacement:  a.emplacement ?? '',
    date_achat:   a.date_achat  ?? null,
    valeur_achat: a.valeur_achat ?? null,
    notes:        a.notes ?? null,
  }
}

export const useArticlesStore = defineStore('articles', {
  state: () => ({ articles: [], loading: false, error: null }),
  actions: {
    async fetch() {
      if (this.articles.length) return
      this.loading = true
      this.error = null
      try {
        const raw = await getArticles()
        this.articles = raw.map(mapArticle)
      } catch (err) {
        this.error = err.message || 'Erreur de chargement'
      } finally {
        this.loading = false
      }
    },

    async create(data, produit_nom = '', entrepot_nom = '') {
      const raw = await createArticle(data)
      if (raw) {
        this.articles.push(mapArticle({
          ...raw,
          produit_id:  { id: data.produit_id, name: produit_nom },
          entrepot_id: data.entrepot_id ? { id: data.entrepot_id, nom: entrepot_nom } : null,
        }))
      }
      return raw
    },

    async patch(id, data, produit_nom, entrepot_nom) {
      const raw = await apiPatch(id, data)
      const idx = this.articles.findIndex(a => a.id === id)
      if (idx !== -1) {
        const old = this.articles[idx]
        this.articles[idx] = mapArticle({
          ...raw,
          produit_id:  { id: data.produit_id  ?? old.produit_id,  name: produit_nom  ?? old.produit_nom },
          entrepot_id: data.entrepot_id != null ? { id: data.entrepot_id, nom: entrepot_nom ?? old.entrepot_nom } : null,
        })
      }
    },

    async delete(id) {
      await apiDelete(id)
      this.articles = this.articles.filter(a => a.id !== id)
    },
  },
})
