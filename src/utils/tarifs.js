// Tarifs partagés par le devis, la modale de réservation et le tableau de bord :
// un seul calcul pour que le montant affiché partout soit celui du devis.
import { differenceInCalendarDays, parseISO } from 'date-fns'

const REMISE_LIVRAISON_PLAFOND = 50

// Forfait livraison + installation selon la distance (€)
export function livraisonFee(km) {
  if (km <= 15)  return 20
  if (km <= 30)  return 40
  if (km <= 50)  return 65
  if (km <= 80)  return 100
  if (km <= 120) return 150
  return 150 + (km - 120)
}

// Nombre de jours de location, compté comme sur le site : jours calendaires, bornes incluses
// (du samedi au dimanche = 2 jours), jamais moins de 1.
export function joursLocation(debut, fin) {
  if (!debut || !fin) return 1
  return Math.max(1, differenceInCalendarDays(parseISO(fin), parseISO(debut)) + 1)
}

// Prix par jour d'une ligne produit : prix figé sur la ligne, sinon prix du catalogue (null si inconnu)
export function prixLigne(ligne) {
  if (ligne.unit_price) return Number(ligne.unit_price)
  return ligne.produits_id?.price ? Number(ligne.produits_id.price) : null
}

// Total d'une ligne produit : prix par jour × quantité × nombre de jours
export function totalLigne(ligne, jours = 1) {
  return (prixLigne(ligne) ?? 0) * (ligne.quantity || 1) * jours
}

export function totalProduits(lignes, jours = 1) {
  return lignes.reduce((sum, l) => sum + totalLigne(l, jours), 0)
}

// Remise automatique : livraison offerte, dans la limite du plafond
export function remiseLivraison(fraisLivraison) {
  return Math.min(fraisLivraison, REMISE_LIVRAISON_PLAFOND)
}

// Remise manuelle, plafonnée pour que le total ne devienne pas négatif
export function plafonneRemise(montant, sousTotal) {
  return Math.min(Math.max(0, Number(montant) || 0), Math.max(0, sousTotal))
}

// Montant total d'une réservation, identique au total de son devis.
// r = { date_start, date_end, livraison, distance_km, remise, remise_montant },
// lignes = ses lignes reservations_produits. La livraison et les remises ne dépendent pas des jours.
export function montantReservation(r, lignes) {
  const produits  = totalProduits(lignes, joursLocation(r.date_start, r.date_end))
  const frais     = r.livraison ? livraisonFee(r.distance_km ?? 0) : 0
  const sousTotal = produits + frais - (r.remise ? remiseLivraison(frais) : 0)
  return sousTotal - plafonneRemise(r.remise_montant, sousTotal)
}
