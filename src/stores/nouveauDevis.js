import { defineStore } from 'pinia'

// Écran « Nouveau devis » et fenêtre de la réservation qu'il crée. Ils sont hébergés par la mise en
// page : n'importe quelle vue peut ouvrir l'écran, éventuellement sur une date choisie dans le planning.
export const useNouveauDevisStore = defineStore('nouveauDevis', {
  state: () => ({
    ouvert: false,
    date: null,            // jour prérempli (AAAA-MM-JJ)
    reservationId: null,   // réservation créée, affichée à la fermeture de l'écran
  }),
  actions: {
    ouvrir(date = null) {
      this.date = date
      this.ouvert = true
    },
    fermer() {
      this.ouvert = false
    },
    afficher(id) {
      this.ouvert = false
      this.reservationId = id
    },
  },
})
