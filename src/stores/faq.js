import { defineStore } from 'pinia'
import { getFaq } from '../api/directus'

export const useFaqStore = defineStore('faq', {
  state: () => ({
    categories: [],
    loading: false,
    error: null,
  }),
  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        this.categories = await getFaq()
      } catch (err) {
        this.error = err.message || 'Erreur de connexion'
      } finally {
        this.loading = false
      }
    },
  },
})
