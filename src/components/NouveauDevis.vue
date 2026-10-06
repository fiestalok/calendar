<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useReservationsStore } from '../stores/reservations'
import { useClientsStore } from '../stores/clients'
import { useProduitsStore } from '../stores/produits'
import { useNouveauDevisStore } from '../stores/nouveauDevis'
import { useArticlesStore } from '../stores/articles'
import { createReservation, createReservationProduit } from '../api/directus'
import { joursLocation, livraisonFee, zoneLivraison, lignesDevis } from '../utils/tarifs'
import { horodatage } from '../utils/dates'
import { chiffres, nomClient, initiales, coordonnees, chercherClients, clientEnDouble } from '../utils/clients'
import { demandeProduit, disponibilite, unitesParProduit } from '../utils/disponibilite'
import { genererDevisReservation } from '../utils/devisReservation'

// Écran unique de création d'un devis : client (existant ou nouveau), dates, produits, livraison.
// Rien n'est enregistré avant la validation ; le client, la réservation et ses lignes sont alors créés d'un coup.
const ecran         = useNouveauDevisStore()
const reservations  = useReservationsStore()
const clientsStore  = useClientsStore()
const produitsStore = useProduitsStore()
const articlesStore = useArticlesStore()

const champ = 'w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white'
const TON   = { ok: 'bg-emerald-100 text-emerald-800', attention: 'bg-amber-100 text-amber-800', alerte: 'bg-red-100 text-red-700' }

const sansAccent = (s) => (s ?? '').toString().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const euros      = (n) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
}).format(n)

// ── Client ───────────────────────────────────────────────────────────────────
const CLIENT_VIDE = {
  typeClient: 'particulier', first_name: '', last_name: '', company_name: '',
  phone: '', email: '', address: '', zip_code: '', city: '',
}
const champRecherche = ref(null)
const recherche = ref('')
const clientId  = ref(null)    // client existant choisi
const creation  = ref(false)   // saisie d'un nouveau client, créé avec le devis
const nouveau   = ref({ ...CLIENT_VIDE })

const client    = computed(() => clientsStore.clients.find(c => c.id === clientId.value) ?? null)
const resultats = computed(() => chercherClients(clientsStore.clients, recherche.value))

function choisir(c) {
  clientId.value = c.id
  creation.value = false
  recherche.value = ''
}

function changerClient() {
  clientId.value = null
  creation.value = false
}

// Ouvre la saisie d'un nouveau client, préremplie avec ce qui vient d'être tapé
function creerClient() {
  const saisie = recherche.value.trim()
  const fiche  = { ...CLIENT_VIDE }
  if (saisie.includes('@')) fiche.email = saisie
  else if (chiffres(saisie).length >= 6 && !/[a-z]/i.test(saisie)) fiche.phone = saisie
  else {
    const [premier, ...reste] = saisie.split(/\s+/)
    if (reste.length) { fiche.first_name = premier; fiche.last_name = reste.join(' ') }
    else fiche.last_name = premier ?? ''
  }
  nouveau.value = fiche
  creation.value = true
}

// Fiche existante qui porte déjà ce téléphone ou cet e-mail
const doublon = computed(() =>
  creation.value ? clientEnDouble(clientsStore.clients, nouveau.value.phone, nouveau.value.email) : null
)

const clientPret = computed(() => {
  if (clientId.value) return true
  const n = nouveau.value
  return creation.value && !!(n.last_name.trim() || n.company_name.trim()) && !!(n.phone.trim() || n.email.trim())
})

const adresseClient = computed(() => {
  const c = client.value
  const [rue, codePostal, ville] = c
    ? [c.adresse, c.code_postal, c.ville]
    : [nouveau.value.address, nouveau.value.zip_code, nouveau.value.city]
  return [rue, [codePostal, ville].filter(Boolean).join(' ')].map(m => (m ?? '').trim()).filter(Boolean).join(', ')
})

// ── Dates et horaires ────────────────────────────────────────────────────────
const dateDebut  = ref(ecran.date ?? '')
const dateFin    = ref(ecran.date ?? '')
const heureDebut = ref('')
const heureFin   = ref('')

watch(dateDebut, (debut) => { if (debut && (!dateFin.value || dateFin.value < debut)) dateFin.value = debut })

const datesPretes   = computed(() => !!dateDebut.value && !!dateFin.value)
const ordreInvalide = computed(() => datesPretes.value && (
  dateFin.value < dateDebut.value ||
  (dateFin.value === dateDebut.value && !!heureDebut.value && !!heureFin.value && heureFin.value < heureDebut.value)
))
const periodeValide = computed(() => datesPretes.value && !ordreInvalide.value)
const debutISO = computed(() => dateDebut.value ? horodatage(dateDebut.value, heureDebut.value) : null)
const finISO   = computed(() => dateFin.value ? horodatage(dateFin.value, heureFin.value) : null)
// Les produits sont facturés par jour de location, comme sur le site (1 jour tant que la période est incomplète)
const jours    = computed(() => joursLocation(debutISO.value, finISO.value))

// ── Produits ─────────────────────────────────────────────────────────────────
const lignes = ref([])            // [{ produit, quantite }]
const rechercheProduit = ref('')
// Unités en stock par produit, null tant qu'elles ne sont pas connues
const unites = computed(() =>
  articlesStore.loading || articlesStore.error ? null : unitesParProduit(articlesStore.articles)
)

const quantite = (l) => Math.max(1, Math.floor(Number(l.quantite) || 1))

// Produits du catalogue qui ne sont pas encore dans le devis
const catalogue = computed(() => {
  const pris = new Set(lignes.value.map(l => l.produit.id))
  const q    = sansAccent(rechercheProduit.value).trim()
  return produitsStore.produits.filter(p =>
    !pris.has(p.id) && p.statut !== 'archived' && (!q || sansAccent(`${p.nom} ${p.categorie}`).includes(q))
  )
})

function ajouter(produit) {
  lignes.value.push({ produit, quantite: 1 })
  rechercheProduit.value = ''
}

function retirer(ligne) {
  lignes.value = lignes.value.filter(l => l !== ligne)
}

// Disponibilité de chaque produit sur la période, pour la quantité voulue (1 tant qu'il n'est pas dans le devis)
const dispos = computed(() => {
  if (!periodeValide.value || !unites.value) return {}
  const verdict = (p, voulu) => disponibilite(
    unites.value[p.id] ?? 0, voulu, demandeProduit(p, dateDebut.value, dateFin.value, reservations.reservations)
  )
  const parProduit = {}
  for (const p of produitsStore.produits) parProduit[p.id] = verdict(p, 1)
  for (const l of lignes.value) parProduit[l.produit.id] = verdict(l.produit, quantite(l))
  return parProduit
})

// ── Livraison, remise, notes ─────────────────────────────────────────────────
const livraison     = ref(false)
const adresse       = ref('')
const distanceKm    = ref(0)
const remiseAuto    = ref(false)   // livraison offerte, dans la limite du plafond
const remiseLibelle = ref('')
const remiseMontant = ref(0)
const notes         = ref('')

const km = computed(() => Math.max(0, Number(distanceKm.value) || 0))

watch(livraison, (active) => { if (active && !adresse.value) adresse.value = adresseClient.value })

// ── Récapitulatif ────────────────────────────────────────────────────────────
// Paramètres de prix et lignes au format de Directus : le total affiché est calculé comme celui du devis
const parametres = computed(() => ({
  date_start:     debutISO.value,
  date_end:       finISO.value,
  livraison:      livraison.value,
  distance_km:    livraison.value ? km.value : 0,
  remise:         livraison.value && remiseAuto.value,
  remise_libelle: remiseLibelle.value.trim() || null,
  remise_montant: Math.max(0, Number(remiseMontant.value) || 0) || null,
}))

const lignesProduits = computed(() => lignes.value.map(l => ({
  quantity:    quantite(l),
  unit_price:  l.produit.prix_location,
  produits_id: { id: l.produit.id, name: l.produit.nom, price: l.produit.prix_location },
})))

const recap = computed(() => lignesDevis(parametres.value, lignesProduits.value).map(l => ({
  libelle: `${l.designation}${l.quantite > 1 ? ` × ${l.quantite}` : ''}${l.jours > 1 ? ` · ${l.jours} jours` : ''}`,
  montant: (l.prixTTC ?? 0) * l.quantite * (l.jours ?? 1),
})))
const total = computed(() => recap.value.reduce((sum, l) => sum + l.montant, 0))

const jourCourt = (iso) => format(parseISO(iso), 'EEE d MMM', { locale: fr })
const periode = computed(() => {
  if (!periodeValide.value) return 'Dates à préciser'
  const duree = `${jours.value} jour${jours.value > 1 ? 's' : ''}`
  return dateFin.value === dateDebut.value
    ? `${jourCourt(dateDebut.value)} · ${duree}`
    : `${jourCourt(dateDebut.value)} → ${jourCourt(dateFin.value)} · ${duree}`
})

const manques = computed(() => [
  !clientPret.value && (creation.value ? 'le nom du client et un téléphone ou un e-mail' : 'un client'),
  !datesPretes.value && 'les dates',
  ordreInvalide.value && 'une fin après le début',
  !lignes.value.length && 'au moins un produit',
].filter(Boolean))

// ── Enregistrement ───────────────────────────────────────────────────────────
const enCours     = ref(null)   // 'devis' | 'simple' pendant l'enregistrement
const erreur      = ref('')
const enregistree = ref(null)   // réservation enregistrée dont le devis n'a pas pu être généré
// Ce qui est déjà créé si un essai s'est arrêté en route : un nouvel essai ne le recrée pas
const reservationId = ref(null)
const lignesCreees  = ref(new Set())

const message = (err) => err?.response?.data?.errors?.[0]?.message ?? err?.message ?? 'erreur inconnue'

async function enregistrer(avecDevis) {
  if (manques.value.length || enCours.value) return
  enCours.value = avecDevis ? 'devis' : 'simple'
  erreur.value = ''
  try {
    if (!clientId.value) {
      const fiche = Object.fromEntries(Object.entries(nouveau.value).map(([cle, v]) => [cle, v.trim() || null]))
      if (fiche.typeClient !== 'entreprise') fiche.company_name = null
      const cree = await clientsStore.create(fiche)
      if (!cree?.id) throw new Error('le client n\'a pas pu être créé')
      choisir(cree)
    }

    const p = parametres.value
    if (!reservationId.value) {
      const creee = await createReservation({
        status:           'en_attente',
        client:           clientId.value,
        date_start:       p.date_start,
        date_end:         p.date_end,
        notes:            notes.value.trim() || null,
        delivery:         p.livraison,
        delivery_address: p.livraison ? adresse.value.trim() || null : null,
        // livraison et installation sont des champs entiers dans Directus : 1/0, pas true/false
        livraison:        p.livraison ? 1 : 0,
        installation:     p.livraison ? 1 : 0,
        distance_km:      p.distance_km,
        remise:           p.remise,
        remise_libelle:   p.remise_libelle,
        remise_montant:   p.remise_montant,
      })
      reservationId.value = creee.id
    }
    const id = reservationId.value

    // Prix du catalogue figé sur chaque ligne, comme pour les demandes venues du site
    for (const l of lignesProduits.value) {
      if (lignesCreees.value.has(l.produits_id.id)) continue
      await createReservationProduit({
        reservations_id: id, produits_id: l.produits_id.id, quantity: l.quantity, unit_price: l.unit_price,
      })
      lignesCreees.value.add(l.produits_id.id)
    }

    await reservations.fetchReservations()
    const creee = reservations.reservations.find(r => r.id === id)
    if (!creee) throw new Error(`la réservation n°${id} est enregistrée, mais la liste n'a pas pu être rechargée`)

    if (avecDevis) {
      try {
        // Réservation telle que Directus l'a enregistrée, complétée par les remises que la liste ne porte pas
        const { remise, remise_libelle, remise_montant } = p
        await genererDevisReservation({ ...creee, remise, remise_libelle, remise_montant }, creee.client, creee.lignes)
      } catch (err) {
        enregistree.value = id
        erreur.value = `La réservation n°${id} est enregistrée, mais le devis n'a pas pu être généré : ${message(err)}`
        return
      }
    }
    ecran.afficher(id)
  } catch (err) {
    erreur.value = `Enregistrement interrompu : ${message(err)}`
  } finally {
    enCours.value = null
  }
}

function fermer() {
  if (enCours.value) return
  // Une réservation déjà enregistrée s'ouvre plutôt que de disparaître
  if (reservationId.value) return ecran.afficher(reservationId.value)
  const saisi = clientId.value || creation.value || recherche.value.trim() || lignes.value.length || notes.value.trim()
  if (saisi && !confirm('Abandonner ce devis ? Rien ne sera enregistré.')) return
  ecran.fermer()
}

clientsStore.fetch()
produitsStore.fetch()
articlesStore.fetch()
reservations.fetchReservations()

onMounted(() => champRecherche.value?.focus())
</script>

<template>
  <Teleport to="body">
    <div class="modal modal-open">
      <div class="modal-box w-11/12 max-w-5xl p-0 overflow-hidden flex flex-col" style="max-height: 92vh;">

        <!-- ── En-tête ───────────────────────────────────────────────────── -->
        <div class="flex-shrink-0 bg-base-100 border-b border-base-200 px-6 py-4 flex items-center gap-3">
          <span class="text-lg font-bold text-base-content/90">Nouveau devis</span>
          <span class="text-xs text-base-content/40">Rien n'est enregistré avant la validation</span>
          <button class="btn btn-sm btn-circle btn-ghost ml-auto" title="Fermer" @click="fermer">✕</button>
        </div>

        <!-- ── Corps scrollable ──────────────────────────────────────────── -->
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
            <div class="lg:col-span-3 space-y-4">

              <!-- ── Client ─────────────────────────────────────────────── -->
              <div class="rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
                <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                  <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</span>
                  <span v-if="creation && !clientId" class="ml-auto text-[11px] font-semibold text-blue-500">Nouveau client</span>
                </div>
                <div class="p-4">

                  <!-- Client existant choisi -->
                  <div v-if="client" class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                      {{ initiales(client) }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="font-semibold text-sm text-gray-900 truncate">{{ nomClient(client) }}</p>
                      <p class="text-xs text-gray-500 truncate">{{ coordonnees(client) || 'Aucune coordonnée' }}</p>
                    </div>
                    <button type="button" class="btn btn-xs btn-ghost text-base-content/50" :disabled="!!reservationId" @click="changerClient">
                      Changer
                    </button>
                  </div>

                  <!-- Nouveau client : créé avec le devis -->
                  <div v-else-if="creation" class="space-y-3">
                    <div class="flex gap-2">
                      <button v-for="t in [['particulier', 'Particulier'], ['entreprise', 'Entreprise']]" :key="t[0]" type="button"
                        class="flex-1 py-1.5 text-sm font-semibold rounded-lg border transition-colors"
                        :class="nouveau.typeClient === t[0] ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
                        @click="nouveau.typeClient = t[0]">{{ t[1] }}</button>
                    </div>
                    <input v-if="nouveau.typeClient === 'entreprise'" v-model="nouveau.company_name" type="text"
                      placeholder="Raison sociale" aria-label="Raison sociale" :class="champ" />
                    <div class="grid grid-cols-2 gap-3">
                      <input v-model="nouveau.first_name" type="text" placeholder="Prénom" aria-label="Prénom" :class="champ" />
                      <input v-model="nouveau.last_name" type="text" placeholder="Nom" aria-label="Nom" :class="champ" />
                      <input v-model="nouveau.phone" type="tel" placeholder="Téléphone" aria-label="Téléphone" :class="champ" />
                      <input v-model="nouveau.email" type="email" placeholder="E-mail" aria-label="E-mail" :class="champ" />
                    </div>
                    <input v-model="nouveau.address" type="text" placeholder="Adresse (facultative)" aria-label="Adresse" :class="champ" />
                    <div class="grid grid-cols-3 gap-3">
                      <input v-model="nouveau.zip_code" type="text" placeholder="Code postal" aria-label="Code postal" :class="champ" />
                      <input v-model="nouveau.city" type="text" placeholder="Ville" aria-label="Ville" :class="[champ, 'col-span-2']" />
                    </div>
                    <div v-if="doublon" class="flex items-center gap-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                      <p class="flex-1 min-w-0 text-xs text-amber-800">
                        Ces coordonnées sont déjà celles de <span class="font-semibold">{{ nomClient(doublon) }}</span>.
                      </p>
                      <button type="button" class="btn btn-xs btn-warning btn-outline shrink-0" @click="choisir(doublon)">Utiliser cette fiche</button>
                    </div>
                    <button type="button" class="text-xs font-medium text-blue-600 hover:underline" @click="creation = false">
                      ← Chercher un client existant
                    </button>
                  </div>

                  <!-- Recherche -->
                  <div v-else>
                    <input ref="champRecherche" v-model="recherche" type="text" autocomplete="off"
                      placeholder="Nom, téléphone ou e-mail du client" aria-label="Rechercher un client" :class="champ"
                      @keydown.enter.prevent="resultats[0] ? choisir(resultats[0]) : recherche.trim() && creerClient()" />
                    <div v-if="recherche.trim().length >= 2" class="mt-2 rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                      <button v-for="c in resultats" :key="c.id" type="button"
                        class="w-full block px-3 py-2 text-left hover:bg-blue-50 transition-colors" @click="choisir(c)">
                        <span class="block text-sm font-medium text-gray-900 truncate">{{ nomClient(c) }}</span>
                        <span class="block text-xs text-gray-500 truncate">{{ coordonnees(c) || 'Aucune coordonnée' }}</span>
                      </button>
                      <button type="button"
                        class="w-full block px-3 py-2 text-left text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                        @click="creerClient">
                        + Créer le client « {{ recherche.trim() }} »
                      </button>
                    </div>
                    <p v-else-if="clientsStore.error" class="text-xs text-red-500 mt-2">Clients indisponibles : {{ clientsStore.error }}</p>
                    <p v-else class="text-xs text-gray-400 mt-2">
                      Saisissez au moins deux lettres. Si le client n'existe pas, il se crée ici, avec le devis.
                    </p>
                  </div>
                </div>
              </div>

              <!-- ── Dates et horaires ──────────────────────────────────── -->
              <div class="rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
                <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                  <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dates et horaires</span>
                  <span v-if="periodeValide" class="ml-auto text-[11px] font-semibold text-blue-500">
                    {{ jours }} jour{{ jours > 1 ? 's' : '' }} de location
                  </span>
                </div>
                <div class="p-4">
                  <div class="grid grid-cols-[3rem_1fr_7.5rem] gap-x-3 gap-y-2 items-center">
                    <label for="nouveau-devis-debut" class="text-xs font-semibold text-gray-500">Début</label>
                    <input id="nouveau-devis-debut" v-model="dateDebut" type="date" :class="champ" />
                    <input v-model="heureDebut" type="time" aria-label="Heure de début (facultative)" :class="champ" />
                    <label for="nouveau-devis-fin" class="text-xs font-semibold text-gray-500">Fin</label>
                    <input id="nouveau-devis-fin" v-model="dateFin" type="date" :min="dateDebut" :class="champ" />
                    <input v-model="heureFin" type="time" aria-label="Heure de fin (facultative)" :class="champ" />
                  </div>
                  <p class="text-xs mt-2" :class="ordreInvalide ? 'text-red-500' : 'text-gray-400'">
                    {{ ordreInvalide ? 'La fin doit être après le début.' : 'Les heures sont facultatives.' }}
                  </p>
                </div>
              </div>

              <!-- ── Produits ───────────────────────────────────────────── -->
              <div class="rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
                <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                  <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Produits</span>
                  <span v-if="!periodeValide" class="ml-auto text-[11px] text-gray-400">Indiquez les dates pour voir la disponibilité</span>
                </div>
                <div v-for="l in lignes" :key="l.produit.id" class="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-900 truncate">{{ l.produit.nom }}</p>
                    <p class="text-xs text-gray-400">{{ euros(l.produit.prix_location) }} / jour</p>
                  </div>
                  <span v-if="dispos[l.produit.id]" class="text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0" :class="TON[dispos[l.produit.id].ton]">
                    {{ dispos[l.produit.id].texte }}
                  </span>
                  <input v-model.number="l.quantite" type="number" min="1" max="99" :aria-label="`Quantité de ${l.produit.nom}`"
                    class="w-16 text-sm px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-center font-semibold bg-white" />
                  <span class="w-20 text-right text-sm font-semibold text-gray-800 tabular-nums shrink-0">
                    {{ euros(l.produit.prix_location * quantite(l) * jours) }}
                  </span>
                  <button type="button" class="btn btn-xs btn-ghost btn-circle text-base-content/30 hover:text-error"
                    :title="`Retirer ${l.produit.nom}`" :disabled="lignesCreees.has(l.produit.id)" @click="retirer(l)">✕</button>
                </div>
                <div class="p-4">
                  <input v-model="rechercheProduit" type="text" autocomplete="off"
                    placeholder="Ajouter un produit" aria-label="Chercher un produit à ajouter" :class="champ" />
                  <div class="mt-2 max-h-52 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
                    <button v-for="p in catalogue" :key="p.id" type="button"
                      class="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-blue-50 transition-colors" @click="ajouter(p)">
                      <span class="flex-1 min-w-0">
                        <span class="block text-sm text-gray-800 truncate">{{ p.nom }}</span>
                        <span class="block text-xs text-gray-400 truncate">
                          {{ p.categorie || 'Sans catégorie' }} · {{ euros(p.prix_location) }} / jour<template v-if="p.statut !== 'published'"> · non publié sur le site</template>
                        </span>
                      </span>
                      <span v-if="dispos[p.id]" class="text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0" :class="TON[dispos[p.id].ton]">
                        {{ dispos[p.id].texte }}
                      </span>
                      <span class="text-blue-600 text-lg leading-none shrink-0" aria-hidden="true">+</span>
                    </button>
                    <p v-if="!catalogue.length" class="px-3 py-3 text-xs text-gray-400 text-center">
                      {{ produitsStore.loading ? 'Chargement…' : produitsStore.error || 'Aucun autre produit à ajouter' }}
                    </p>
                  </div>
                </div>
              </div>

              <!-- ── Livraison et installation ──────────────────────────── -->
              <div class="rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
                <label class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2 cursor-pointer">
                  <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Livraison et installation</span>
                  <input v-model="livraison" type="checkbox" class="toggle toggle-sm toggle-primary ml-auto" />
                </label>
                <div v-if="livraison" class="p-4 space-y-3">
                  <input v-model="adresse" type="text" placeholder="Adresse de livraison" aria-label="Adresse de livraison" :class="champ" />
                  <div class="flex items-center gap-2">
                    <input v-model.number="distanceKm" type="number" min="0" max="999" aria-label="Distance en kilomètres"
                      class="w-20 text-sm px-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-center font-semibold bg-white" />
                    <span class="text-xs text-gray-500">km · forfait {{ zoneLivraison(km) }}</span>
                    <span class="ml-auto text-sm font-bold text-primary">{{ euros(livraisonFee(km)) }}</span>
                  </div>
                  <label class="flex items-center gap-2 cursor-pointer select-none">
                    <input v-model="remiseAuto" type="checkbox" class="checkbox checkbox-sm checkbox-primary" />
                    <span class="text-sm text-gray-700">Livraison offerte (remise plafonnée à 50 €)</span>
                  </label>
                </div>
                <p v-else class="px-4 py-3 text-sm text-gray-400">Retrait au dépôt par le client.</p>
              </div>

              <!-- ── Remise et notes ────────────────────────────────────── -->
              <div class="rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
                <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                  <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                  <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Remise et notes</span>
                  <span class="text-[10px] text-gray-400">(facultatif)</span>
                </div>
                <div class="p-4 space-y-3">
                  <div class="flex items-center gap-2">
                    <input v-model="remiseLibelle" type="text" maxlength="80" placeholder="Intitulé de la remise (ex. Geste commercial)"
                      aria-label="Intitulé de la remise" :class="[champ, 'flex-1 min-w-0']" />
                    <input v-model.number="remiseMontant" type="number" min="0" step="0.01" placeholder="0" aria-label="Montant de la remise en euros"
                      class="w-24 text-sm px-2 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-center font-semibold bg-white" />
                    <span class="text-xs text-gray-500">€</span>
                  </div>
                  <textarea v-model="notes" rows="2" placeholder="Notes (accès, consignes, précisions du client…)" aria-label="Notes"
                    :class="[champ, 'resize-none']"></textarea>
                </div>
              </div>

            </div>

            <!-- ── Récapitulatif ─────────────────────────────────────────── -->
            <div class="lg:col-span-2 lg:sticky lg:top-0 rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
              <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Récapitulatif</span>
              </div>
              <div class="p-4">
                <p class="text-sm font-semibold text-gray-900 truncate">
                  {{ client ? nomClient(client) : creation ? nomClient({ prenom: nouveau.first_name, nom: nouveau.last_name, raison_sociale: nouveau.company_name }) : 'Client à choisir' }}
                </p>
                <p class="text-xs text-gray-500 first-letter:uppercase">{{ periode }}</p>

                <div class="mt-3 space-y-1.5">
                  <div v-for="(l, i) in recap" :key="i" class="flex items-baseline justify-between gap-3 text-sm">
                    <span class="min-w-0 text-gray-600">{{ l.libelle }}</span>
                    <span class="shrink-0 tabular-nums" :class="l.montant < 0 ? 'text-red-500' : 'text-gray-800'">{{ euros(l.montant) }}</span>
                  </div>
                  <p v-if="!recap.length" class="text-sm text-gray-400">Aucun produit pour l'instant.</p>
                </div>

                <div class="flex items-baseline justify-between border-t border-gray-100 mt-3 pt-3">
                  <span class="text-sm text-gray-500">Total</span>
                  <span class="text-2xl font-bold text-gray-900 tabular-nums">{{ euros(total) }}</span>
                </div>
                <p class="text-[11px] text-gray-400 text-right">TVA non applicable, article 293 B du CGI</p>
                <p v-if="lignes.length && !periodeValide" class="text-xs text-amber-600 text-right mt-1">Calculé pour une journée : indiquez les dates.</p>

                <div v-if="erreur" class="alert alert-error text-sm py-2 mt-3">{{ erreur }}</div>

                <div class="mt-4 space-y-2">
                  <button v-if="enregistree" class="btn btn-primary btn-sm w-full" @click="ecran.afficher(enregistree)">
                    Ouvrir la réservation n°{{ enregistree }}
                  </button>
                  <template v-else>
                    <button class="btn btn-primary btn-sm w-full" :disabled="!!manques.length || !!enCours" @click="enregistrer(true)">
                      <span v-if="enCours !== 'devis'">Enregistrer et générer le devis</span>
                      <span v-else class="loading loading-spinner loading-xs"></span>
                    </button>
                    <button class="btn btn-ghost btn-sm w-full" :disabled="!!manques.length || !!enCours" @click="enregistrer(false)">
                      <span v-if="enCours !== 'simple'">Enregistrer sans générer</span>
                      <span v-else class="loading loading-spinner loading-xs"></span>
                    </button>
                    <p v-if="manques.length" class="text-xs text-base-content/40 text-center">Il manque : {{ manques.join(', ') }}.</p>
                  </template>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>
