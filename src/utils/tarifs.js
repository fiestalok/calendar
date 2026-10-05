// Tarifs partagés par le devis, la modale de réservation et le tableau de bord :
// un seul calcul pour que le montant affiché partout soit celui du devis.

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

// Prix d'une ligne produit : prix figé sur la ligne, sinon prix du catalogue (null si inconnu)
export function prixLigne(ligne) {
  if (ligne.unit_price) return Number(ligne.unit_price)
  return ligne.produits_id?.price ? Number(ligne.produits_id.price) : null
}

export function totalProduits(lignes) {
  return lignes.reduce((sum, l) => sum + (prixLigne(l) ?? 0) * (l.quantity || 1), 0)
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
// r = { livraison, distance_km, remise, remise_montant }, lignes = ses lignes reservations_produits
export function montantReservation(r, lignes) {
  const frais     = r.livraison ? livraisonFee(r.distance_km ?? 0) : 0
  const sousTotal = totalProduits(lignes) + frais - (r.remise ? remiseLivraison(frais) : 0)
  return sousTotal - plafonneRemise(r.remise_montant, sousTotal)
}
