import { defineStore } from 'pinia'
import { getContacts, createContact, patchContact as apiPatch, deleteContact as apiDelete } from '../api/directus'

export const useContactsStore = defineStore('contacts', {
  state: () => ({ contacts: [], loading: false, error: null }),
  actions: {
    async fetch() {
      if (this.contacts.length) return
      this.loading = true
      this.error = null
      try {
        const raw = await getContacts()
        this.contacts = raw.map(c => ({ ...c, created_at: c.date_created }))
      } catch (err) {
        this.error = err.message || 'Erreur de connexion'
      } finally {
        this.loading = false
      }
    },

    async create(data) {
      const raw = await createContact(data)
      if (raw) this.contacts.push({ ...raw, created_at: raw.date_created })
      return raw
    },

    async patch(id, data) {
      const raw = await apiPatch(id, data)
      const idx = this.contacts.findIndex(c => c.id === id)
      if (idx !== -1 && raw) this.contacts[idx] = { ...raw, created_at: raw.date_created }
    },

    async delete(id) {
      await apiDelete(id)
      this.contacts = this.contacts.filter(c => c.id !== id)
    },
  },
})
