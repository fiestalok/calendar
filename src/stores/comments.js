import { defineStore } from 'pinia'
import { getCommentaires, createCommentaire, deleteCommentaire } from '../api/directus'

function key(recordType, recordId) { return `${recordType}_${recordId}` }

export const useCommentsStore = defineStore('comments', {
  state: () => ({ cache: {}, loading: {}, errors: {} }),
  actions: {
    async fetch(recordType, recordId) {
      const k = key(recordType, recordId)
      if (this.cache[k]) return
      this.loading[k] = true
      delete this.errors[k]
      try {
        const raw = await getCommentaires(recordType, recordId)
        this.cache[k] = raw ?? []
      } catch (err) {
        this.cache[k] = []
        this.errors[k] = err.response?.status === 403
          ? 'Permissions insuffisantes sur la collection commentaires (Directus).'
          : (err.message ?? 'Erreur de chargement')
      } finally {
        delete this.loading[k]
      }
    },
    async create(recordType, recordId, author, text) {
      const raw = await createCommentaire({
        record_type: recordType,
        record_id:   String(recordId),
        author,
        text,
      })
      if (raw) {
        const k = key(recordType, recordId)
        if (!this.cache[k]) this.cache[k] = []
        this.cache[k].push(raw)
      }
    },
    async delete(id, recordType, recordId) {
      await deleteCommentaire(id)
      const k = key(recordType, recordId)
      if (this.cache[k]) this.cache[k] = this.cache[k].filter(c => c.id !== id)
    },
  },
})
