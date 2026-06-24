import { defineStore } from 'pinia'
import { getClients, getAllDevis, createClient, patchClient as apiPatch, deleteClient as apiDelete, createDevis as apiCreateDevis, patchDevis as apiPatchDevis } from '../api/directus'

function mapClient(c) {
  return {
    id:              c.id,
    type:            c.typeClient?.toLowerCase() ?? null,
    prenom:          c.first_name    ?? null,
    nom:             c.last_name     ?? null,
    raison_sociale:  (c.company_name && c.company_name !== 'undefined') ? c.company_name : null,
    email:           c.email         ?? null,
    telephone:       c.phone         ?? null,
    adresse:         c.address       ?? null,
    ville:           c.city          ?? null,
    code_postal:     c.zip_code      ?? null,
    siret:           c.siret         ?? null,
    secteur:         c.secteur       ?? null,
    notes:           c.notes         ?? null,
    created_at:      c.date_created,
    contacts:        [],
    sites_web:       [],
    factures:        [],
    reservations_count: 0,
    total_depense:   0,
    devis:           [],
  }
}

function mapDevis(d) {
  return {
    id:             d.id,
    numero:         d.numero,
    date:           d.date_created,
    date_validite:  d.valid_until,
    description:    d.description,
    montant:        d.montant,
    statut:         d.statut,
    facture_ref:    d.facture_ref    ?? null,
    facture_id:     d.facture?.id    ?? null,
    facture_numero: d.facture?.numero ?? null,
    fichier_id:     d.fichier        ?? null,
    reservation_id: d.reservation    ?? null,
  }
}

export const useClientsStore = defineStore('clients', {
  state: () => ({ clients: [], loading: false, error: null }),

  actions: {
    async fetch() {
      this.loading = true
      this.error = null
      try {
        const [rawClients, rawDevis] = await Promise.all([getClients(), getAllDevis()])
        const devisByClient = {}
        for (const d of rawDevis) {
          if (!devisByClient[d.client]) devisByClient[d.client] = []
          devisByClient[d.client].push(mapDevis(d))
        }
        this.clients = rawClients.map(c => ({ ...mapClient(c), devis: devisByClient[c.id] ?? [] }))
      } catch (err) {
        this.error = err.message || 'Impossible de contacter le serveur'
      } finally {
        this.loading = false
      }
    },

    async create(data) {
      const raw = await createClient(data)
      if (raw) {
        const mapped = { ...mapClient(raw), devis: [] }
        this.clients.push(mapped)
        return mapped
      }
    },

    async patch(id, data) {
      const raw = await apiPatch(id, data)
      const idx = this.clients.findIndex(c => c.id === id)
      if (idx !== -1 && raw) {
        const old = this.clients[idx]
        this.clients[idx] = { ...mapClient(raw), devis: old.devis }
      }
    },

    async delete(id) {
      await apiDelete(id)
      this.clients = this.clients.filter(c => c.id !== id)
    },

    async addDevis(clientId, data) {
      const raw = await apiCreateDevis(data)
      if (raw) {
        const mapped = mapDevis(raw)
        const idx = this.clients.findIndex(c => c.id === clientId)
        if (idx !== -1) {
          this.clients[idx].devis = [mapped, ...(this.clients[idx].devis ?? [])]
        }
        return mapped
      }
    },

    async patchDevis(clientId, devisId, data) {
      const raw = await apiPatchDevis(devisId, data)
      if (raw) {
        const ci = this.clients.findIndex(c => c.id === clientId)
        if (ci !== -1) {
          const di = this.clients[ci].devis.findIndex(d => d.id === devisId)
          if (di !== -1) this.clients[ci].devis[di] = mapDevis(raw)
        }
      }
    },
  },
})
