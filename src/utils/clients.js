// Recherche et affichage des clients (fiches du magasin clients : prenom, nom, raison_sociale, telephone…),
// partagés par l'écran « Nouveau devis » et la fenêtre de réservation.

const sansAccent = (s) => (s ?? '').toString().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Numéro réduit à ses chiffres, indicatif français ramené à 0 : « +33 6 12… » et « 06 12… » se valent
export const chiffres = (s) => (s ?? '').toString().replace(/\D/g, '').replace(/^33/, '0')

// Nom d'un client tel que Directus le renvoie avec une réservation (first_name, last_name, company_name)
export const nomFiche    = (c) => [c?.first_name, c?.last_name].filter(Boolean).join(' ') || c?.company_name || '—'

export const nomClient   = (c) => [c.prenom, c.nom].filter(Boolean).join(' ') || c.raison_sociale || '—'
export const initiales   = (c) => nomClient(c).split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
export const coordonnees = (c) =>
  [(c.prenom || c.nom) && c.raison_sociale, c.telephone, c.email, c.ville].filter(Boolean).join(' · ')

// Clients dont le nom, la société, l'e-mail, la ville ou le téléphone correspondent à la saisie
export function chercherClients(clients, saisie, max = 6) {
  const mots = sansAccent(saisie).trim().split(/\s+/)
  if (mots.join('').length < 2) return []
  const numero = chiffres(saisie)
  return clients.filter(c => {
    const texte = sansAccent([c.prenom, c.nom, c.raison_sociale, c.email, c.ville].filter(Boolean).join(' '))
    return mots.every(m => texte.includes(m)) || (numero.length >= 4 && chiffres(c.telephone).includes(numero))
  }).slice(0, max)
}

// Fiche qui porte déjà ce téléphone ou cet e-mail, s'il y en a une
export function clientEnDouble(clients, telephone, email) {
  const numero  = chiffres(telephone)
  const adresse = (email ?? '').trim().toLowerCase()
  return clients.find(c =>
    (numero.length >= 8 && chiffres(c.telephone) === numero) || (adresse && (c.email ?? '').toLowerCase() === adresse)
  ) ?? null
}
