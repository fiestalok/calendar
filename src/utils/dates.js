// Dates et horaires des réservations. Dans Directus, date_start et date_end sont des horodatages :
// une date saisie sans heure y est enregistrée à minuit UTC, ce qui la distingue d'un horaire réel.
import { format, parseISO } from 'date-fns'

// Vrai si la valeur ne porte qu'une date : aucun horaire à afficher
export function sansHeure(iso) {
  if (!iso) return true
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso) || /T00:00(:00(\.0+)?)?Z$/.test(iso)) return true
  const d = parseISO(iso)
  return !d.getHours() && !d.getMinutes()
}

// Horaire local à afficher (« 14h », « 14h30 »), ou null s'il n'y en a pas
export function heureLocale(iso) {
  if (sansHeure(iso)) return null
  const d = parseISO(iso)
  return `${d.getHours()}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, '0') : ''}`
}

// Valeur à enregistrer pour un jour (AAAA-MM-JJ) et une heure locale facultative (HH:MM)
export function horodatage(jour, heure) {
  return heure ? new Date(`${jour}T${heure}`).toISOString() : `${jour}T00:00:00.000Z`
}

// L'inverse, pour préremplir les champs de saisie : jour (AAAA-MM-JJ) et heure (HH:MM, vide sans horaire)
export const jourSaisi   = (iso) => iso ? format(parseISO(iso), 'yyyy-MM-dd') : ''
export const heureSaisie = (iso) => sansHeure(iso) ? '' : format(parseISO(iso), 'HH:mm')
