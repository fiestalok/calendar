// Libellés et couleurs des statuts de réservation, communs à tous les écrans.
// Mêmes teintes que le planning : jaune, bleu ciel, vert, gris, rouge.
export const STATUTS = {
  en_attente:     { label: 'En attente',     cls: 'bg-amber-100 text-amber-800' },
  devis_realise:  { label: 'Devis réalisé',  cls: 'bg-sky-100 text-sky-800' },
  devis_confirme: { label: 'Devis confirmé', cls: 'bg-emerald-100 text-emerald-800' },
  terminee:       { label: 'Terminée',       cls: 'bg-gray-100 text-gray-600' },
  annulee:        { label: 'Annulée',        cls: 'bg-red-100 text-red-700' },
}
