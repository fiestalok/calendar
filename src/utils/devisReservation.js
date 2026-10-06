// Génération du devis d'une réservation : PDF (devis + conditions générales), dépôt dans Directus
// et rattachement à la réservation. Partagé par la fenêtre de réservation et l'écran « Nouveau devis ».
import { lignesDevis } from './tarifs'
import { uploadFile, patchReservation } from '../api/directus'

const CHAMPS_CLIENT = ['company_name', 'first_name', 'last_name', 'address', 'zip_code', 'city', 'phone', 'email']

// Empreinte du contenu d'un devis, enregistrée avec le PDF : la comparer à celle de la réservation
// actuelle dit si le devis est encore à jour. Mêmes paramètres que genererDevisReservation.
export function empreinteDevis(r, client, lignes) {
  const contenu = JSON.stringify([
    lignesDevis(r, lignes).map(l => [l.designation, l.detail ?? '', l.quantite, l.prixTTC, l.jours ?? 0]),
    Date.parse(r.date_start), Date.parse(r.date_end), r.delivery_address ?? '', !!r.livraison, r.notes ?? '',
    CHAMPS_CLIENT.map(champ => client?.[champ] ?? ''),
  ])
  // FNV-1a sur 32 bits : il s'agit de repérer un changement, pas de protéger quoi que ce soit
  let h = 0x811c9dc5
  for (let i = 0; i < contenu.length; i++) h = Math.imul(h ^ contenu.charCodeAt(i), 0x01000193)
  return `devis-v1:${(h >>> 0).toString(16).padStart(8, '0')}`
}

// r = réservation avec ses paramètres de prix (voir lignesDevis), client = sa fiche client Directus,
// lignes = ses lignes reservations_produits. Renvoie l'identifiant du fichier enregistré.
export async function genererDevisReservation(r, client, lignes, { avecTVA = false } = {}) {
  const { buildDevisPdf, loadDevisFonts } = await import('./devisPdf')

  // Devis + conditions générales de location dans un seul PDF
  const pdf = await buildDevisPdf({
    numero:       r.id,
    dateEmission: new Date(),
    client: {
      societe:    client?.company_name,
      prenom:     client?.first_name,
      nom:        client?.last_name,
      adresse:    client?.address,
      codePostal: client?.zip_code,
      ville:      client?.city,
      telephone:  client?.phone,
      email:      client?.email,
    },
    debut:     r.date_start,
    fin:       r.date_end,
    lieu:      r.delivery_address,
    livraison: !!r.livraison,
    lignes:    lignesDevis(r, lignes),
    avecTVA,
    notes:     r.notes,
  }, await loadDevisFonts(import.meta.env.BASE_URL + 'fonts/'))

  // L'empreinte voyage dans la description du fichier (les propriétés doivent précéder le fichier dans l'envoi).
  // Si Directus la refuse, le devis est tout de même déposé, sans elle.
  const deposer = (avecEmpreinte) => {
    const fd = new FormData()
    if (avecEmpreinte) fd.append('description', empreinteDevis(r, client, lignes))
    fd.append('file', new Blob([pdf], { type: 'application/pdf' }), `devis-reservation-${r.id}.pdf`)
    return uploadFile(fd)
  }
  const fichier = await deposer(true).catch(() => deposer(false))
  await patchReservation(r.id, { fichier_devis: fichier.id })
  return fichier.id
}
