// Disponibilité d'un produit sur une période, comptée en jours calendaires. Une location occupe ses
// unités de (début − jours_avant) à (fin + jours_apres), comme les blocages logistiques du planning.
import { addDays, parseISO, startOfDay } from 'date-fns'

const FERMES   = ['devis_confirme', 'terminee']   // devis signés : les unités sont prises
const EN_DEVIS = ['en_attente', 'devis_realise']  // devis encore ouverts : elles peuvent l'être

const jour = (iso) => startOfDay(parseISO(iso))

// Unités louables par produit : articles principaux qui ne sont pas hors service
export function unitesParProduit(articles) {
  const parProduit = {}
  for (const a of articles) {
    const id = a.produit_id?.id ?? a.produit_id
    if (id && a.type !== 'secondaire' && a.etat !== 'hors_service') parProduit[id] = (parProduit[id] ?? 0) + 1
  }
  return parProduit
}

// Demande des autres réservations pour un produit entre deux dates :
// { fermes, enDevis } en nombre d'unités, devis = nombre de devis ouverts concernés.
// produit = { id, jours_avant, jours_apres }, reservations = celles du magasin (avec leurs lignes).
export function demandeProduit(produit, debut, fin, reservations) {
  const marge = (produit.jours_avant ?? 0) + (produit.jours_apres ?? 0)
  const min   = addDays(jour(debut), -marge)
  const max   = addDays(jour(fin), marge)
  const demande = { fermes: 0, enDevis: 0, devis: 0 }
  for (const r of reservations) {
    if (!r.date_start || jour(r.date_start) > max || jour(r.date_end ?? r.date_start) < min) continue
    const unites = (r.lignes ?? [])
      .filter(l => (l.produits_id?.id ?? l.produits_id) === produit.id)
      .reduce((sum, l) => sum + (l.quantity || 1), 0)
    if (!unites) continue
    if (FERMES.includes(r.status)) demande.fermes += unites
    else if (EN_DEVIS.includes(r.status)) { demande.enDevis += unites; demande.devis += 1 }
  }
  return demande
}

// Verdict affichable pour une quantité voulue : ton = 'ok' | 'attention' | 'alerte'
export function disponibilite(unites, quantite, { fermes, enDevis, devis }) {
  const libres = unites - fermes
  if (!unites) return { ton: 'attention', texte: 'Aucune unité en stock' }
  if (libres <= 0) return { ton: 'alerte', texte: 'Déjà réservé sur ces dates' }
  if (libres < quantite) return { ton: 'alerte', texte: `Plus que ${libres} libre${libres > 1 ? 's' : ''}` }
  if (libres - enDevis < quantite) return { ton: 'attention', texte: `Libre, ${devis} devis en cours` }
  return { ton: 'ok', texte: unites > 1 ? `${libres} libre${libres > 1 ? 's' : ''} sur ${unites}` : 'Disponible' }
}
