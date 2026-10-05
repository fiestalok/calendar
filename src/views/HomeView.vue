<script setup>
import { computed, onMounted, ref } from 'vue'
import { differenceInCalendarDays, format, isValid, parseISO, startOfDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useReservationsStore } from '../stores/reservations'
import { joursLocation, totalLigne } from '../utils/tarifs'
import ReservationModal from '../components/ReservationModal.vue'

const HORIZON = 7   // jours affichés dans l'agenda, aujourd'hui compris

const store = useReservationsStore()

onMounted(() => store.fetchReservations())

// Le chargement n'est signalé qu'à la première ouverture : ensuite les chiffres se mettent à jour sur place
const chargement = computed(() => store.loading && !store.reservations.length)

// ── Modal de détail ──────────────────────────────────────────────────────────
const selectedId = ref(null)
const selectedReservation = computed(() =>
  store.reservations.find(r => r.id === selectedId.value) ?? null
)

// ── Dates ────────────────────────────────────────────────────────────────────
const aujourdHui    = startOfDay(new Date())
const moisCourant   = aujourdHui.getMonth()
const anneeCourante = aujourdHui.getFullYear()

const date       = (iso) => iso ? parseISO(iso) : new Date(NaN)
const debut      = (r) => date(r.date_start)
const fin        = (r) => date(r.date_end ?? r.date_start)
// Nombre de jours entre aujourd'hui et une date : négatif si elle est passée
const dansJours  = (d) => differenceInCalendarDays(d, aujourdHui)
const estPassee  = (r) => dansJours(fin(r)) < 0
const cetteAnnee = (r) => debut(r).getFullYear() === anneeCourante
const ceMois     = (r) => cetteAnnee(r) && debut(r).getMonth() === moisCourant

const jour    = (d, motif) => isValid(d) ? format(d, motif, { locale: fr }) : '—'
const heure   = (d) => (d.getHours() || d.getMinutes()) ? format(d, d.getMinutes() ? "H'h'mm" : "H'h'") : null
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`
const majuscule = (texte) => texte.charAt(0).toUpperCase() + texte.slice(1)

const dateLabel = jour(aujourdHui, 'EEEE d MMMM yyyy')

function formatCurrency(n) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}
const formatNombre = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)

// ── Réservations ─────────────────────────────────────────────────────────────
const avecStatut = (...statuts) => store.reservations.filter(r => statuts.includes(r.status))
const somme      = (reservations) => reservations.reduce((sum, r) => sum + (r.montant || 0), 0)

const nomClient = (r) =>
  [r.client?.first_name, r.client?.last_name].filter(Boolean).join(' ') || r.client?.company_name || '—'

// Période d'une réservation ; l'année n'est précisée que si ce n'est pas l'année en cours
const periode = (r) => {
  const annee = fin(r).getFullYear() === anneeCourante ? '' : ' yyyy'
  return joursLocation(r.date_start, r.date_end) > 1
    ? `${jour(debut(r), 'd MMM')} → ${jour(fin(r), `d MMM${annee}`)}`
    : jour(debut(r), `EEE d MMM${annee}`)
}

const produits = (r) => (r.lignes ?? [])
  .map(l => l.produits_id?.name && ((l.quantity || 1) > 1 ? `${l.produits_id.name} × ${l.quantity}` : l.produits_id.name))
  .filter(Boolean).join(', ')

// ── Chiffres clés ────────────────────────────────────────────────────────────
// Chiffre d'affaires : montant des réservations terminées, daté par le début de la location
const termineesAnnee = computed(() => avecStatut('terminee').filter(cetteAnnee))
const termineesMois  = computed(() => termineesAnnee.value.filter(ceMois))
// Devis signés ou envoyés dont l'événement n'est pas encore passé
const signeesAVenir  = computed(() => avecStatut('devis_confirme').filter(r => !estPassee(r)))
const devisEnvoyes   = computed(() => avecStatut('devis_realise').filter(r => !estPassee(r)))
// Livraisons cochées dans le CRM (et non la demande faite sur le site) sur les réservations à venir
const livraisons     = computed(() =>
  avecStatut('en_attente', 'devis_realise', 'devis_confirme').filter(r => r.livraison && dansJours(debut(r)) >= 0)
)

const chiffres = computed(() => [
  { label: 'CA du mois', fond: '#1b5e20',
    valeur: formatCurrency(somme(termineesMois.value)), detail: pluriel(termineesMois.value.length, 'terminée') },
  { label: `CA ${anneeCourante}`, fond: '#00695c',
    valeur: formatCurrency(somme(termineesAnnee.value)), detail: pluriel(termineesAnnee.value.length, 'terminée') },
  { label: 'À venir, signé', fond: '#1565c0',
    valeur: formatCurrency(somme(signeesAVenir.value)), detail: pluriel(signeesAVenir.value.length, 'devis signé') },
  { label: 'En attente de réponse', fond: '#e65100',
    valeur: formatCurrency(somme(devisEnvoyes.value)), detail: pluriel(devisEnvoyes.value.length, 'devis envoyé') },
  { label: 'Livraisons planifiées', fond: '#4a148c',
    valeur: livraisons.value.length,
    detail: `dont ${pluriel(livraisons.value.filter(r => r.status === 'devis_confirme').length, 'signée')}` },
])

// ── À traiter ────────────────────────────────────────────────────────────────
const TON = { attention: 'bg-amber-100 text-amber-800', alerte: 'bg-red-100 text-red-700' }

// Ligne d'une rubrique : ouvre la réservation ; la note à droite est en rouge si alerte
const ligne = (r, note, alerte = false) => ({
  cle: r.id, id: r.id, note, alerte,
  titre:  nomClient(r),
  detail: [periode(r), produits(r)].filter(Boolean).join(' · '),
})

const taches = computed(() => {
  const demandes  = avecStatut('en_attente').sort(parDate)
  // Devis envoyés restés sans suite : la date d'envoi est celle du dernier devis généré
  const relances  = avecStatut('devis_realise').sort(parDate)
    .filter(r => estPassee(r) || !r.date_devis || depuis(r.date_devis) >= DELAI_RELANCE)
  const aCloturer = avecStatut('devis_confirme').filter(estPassee).sort(parDate)
  // Les demandes à chiffrer n'ont pas encore d'article : seuls les devis déjà partis sont signalés
  const sansArticle = avecStatut('devis_realise', 'devis_confirme').sort(parDate)
    .filter(r => !estPassee(r) && r.produits_sans_article > 0)
  const stockBas  = consommables.value.filter(c => (c.stock ?? 0) <= (c.seuil_alerte ?? SEUIL_DEFAUT))
  const articlesConnus = store.reservations.every(r => r.produits_sans_article != null)

  return [
    { cle: 'demandes', label: 'Nouvelles demandes à chiffrer', ton: 'attention', total: demandes.length,
      lignes: demandes.map(r => estPassee(r)
        ? ligne(r, 'date passée', true)
        : ligne(r, r.date_created ? `reçue ${ilYA(depuis(r.date_created))}` : '')) },
    { cle: 'relances', label: `Devis sans réponse depuis ${DELAI_RELANCE} jours`, ton: 'attention', total: relances.length,
      lignes: relances.map(r => estPassee(r)
        ? ligne(r, 'date passée', true)
        : ligne(r, r.date_devis ? `devis généré ${ilYA(depuis(r.date_devis))}` : "date d'envoi inconnue")) },
    { cle: 'cloture', label: 'Événements passés à clôturer', ton: 'alerte', total: aCloturer.length,
      lignes: aCloturer.map(r => ligne(r, `${formatCurrency(r.montant || 0)} · passé ${ilYA(-dansJours(fin(r)))}`)) },
    articlesConnus && {
      cle: 'articles', label: 'Produits sans article affecté', ton: 'alerte',
      total: sansArticle.reduce((sum, r) => sum + r.produits_sans_article, 0),
      lignes: sansArticle.map(r => ligne(r, `${pluriel(r.produits_sans_article, 'produit')} à configurer`)) },
    { cle: 'stock', label: 'Consommables sous le seuil', ton: 'attention', total: stockBas.length,
      lignes: stockBas.map(c => ({
        cle: `conso-${c.id}`, vers: '/consommables', alerte: (c.stock ?? 0) <= 0,
        titre:  c.nom,
        detail: `Seuil d'alerte : ${c.seuil_alerte ?? SEUIL_DEFAUT}`,
        note:   `${[c.stock ?? 0, c.unite].filter(v => v != null && v !== '').join(' ')} en stock`,
      })) },
  ].filter(Boolean)
})

// Rubrique dépliée : la première non vide tant que rien n'a été choisi
const choix   = ref(undefined)
const depliee = computed(() => choix.value !== undefined ? choix.value : taches.value.find(t => t.total)?.cle ?? null)
const basculer = (cle) => { choix.value = depliee.value === cle ? null : cle }

function ouvrir(l) {
  if (l.vers) router.push(l.vers)
  else selectedId.value = l.id
}

// ── Les prochains jours ──────────────────────────────────────────────────────
const NON_SIGNE = { en_attente: 'À chiffrer', devis_realise: 'Devis non signé' }

const jourAgenda = (d, dans) => {
  if (dans === 0) return "Aujourd'hui"
  if (dans === 1) return 'Demain'
  return majuscule(jour(d, 'EEE d MMM'))
}
const lieu = (r) => r.delivery_address || [r.client?.zip_code, r.client?.city].filter(Boolean).join(' ')

// Une entrée au départ du matériel et une à son retour, pour les réservations en cours
const agenda = computed(() => {
  const entrees = []
  for (const r of avecStatut('en_attente', 'devis_realise', 'devis_confirme')) {
    for (const [d, depart] of [[debut(r), true], [fin(r), false]]) {
      const dans = dansJours(d)
      if (!(dans >= 0 && dans < HORIZON)) continue
      const livree = r.livraison
      entrees.push({
        cle: `${r.id}-${depart ? 'depart' : 'retour'}`, id: r.id, date: d,
        quand:     [jourAgenda(d, dans), heure(d)].filter(Boolean).join(' · '),
        type:      livree ? (depart ? ['Livraison', r.distance_km ? `${r.distance_km} km` : null].filter(Boolean).join(' · ') : 'Reprise du matériel')
                          : (depart ? 'Retrait au dépôt' : 'Retour au dépôt'),
        livraison: livree && depart,
        accent:    livree,
        detail:    [nomClient(r), produits(r), livree ? lieu(r) : null].filter(Boolean).join(' · '),
        nonSigne:  NON_SIGNE[r.status],
      })
    }
  }
  return entrees.sort((a, b) => a.date - b.date)
})
const livraisonsAgenda = computed(() => agenda.value.filter(e => e.livraison).length)

// ── CA par mois ──────────────────────────────────────────────────────────────
// Hauteur d'une barre en % de la zone de tracé, dont le haut reste libre pour afficher le montant
const hauteur = (valeur, max) => valeur > 0 ? Math.max(2, valeur / max * 82) : 0

const caParMois = computed(() => {
  const mois = Array.from({ length: 12 }, (_, i) => ({
    nom: jour(new Date(anneeCourante, i, 1), 'LLLL'), courant: i === moisCourant, termine: 0, signe: 0,
  }))
  for (const r of termineesAnnee.value) mois[debut(r).getMonth()].termine += r.montant || 0
  for (const r of signeesAVenir.value.filter(cetteAnnee)) mois[debut(r).getMonth()].signe += r.montant || 0
  const max = Math.max(1, ...mois.map(m => m.termine + m.signe))
  return mois.map(m => ({
    ...m,
    total:    m.termine + m.signe,
    hTermine: hauteur(m.termine, max),
    hSigne:   hauteur(m.signe, max),
    titre:    `${majuscule(m.nom)} : ${formatCurrency(m.termine)} terminé${m.signe ? `, ${formatCurrency(m.signe)} signé à venir` : ''}`,
  }))
})

// ── Produits les plus loués ──────────────────────────────────────────────────
// Locations terminées ou signées de l'année : nombre de réservations et CA des lignes (hors livraison et remises)
const produitsLoues = computed(() => {
  const parProduit = {}
  for (const r of [...termineesAnnee.value, ...signeesAVenir.value.filter(cetteAnnee)]) {
    const jours = joursLocation(r.date_start, r.date_end)
    for (const l of r.lignes ?? []) {
      const produit = l.produits_id
      if (!produit?.name) continue
      const p = (parProduit[produit.id] ??= { id: produit.id, nom: produit.name, locations: 0, ca: 0 })
      p.locations += 1
      p.ca += totalLigne(l, jours)
    }
  }
  return Object.values(parProduit).sort((a, b) => b.locations - a.locations || b.ca - a.ca).slice(0, 8)
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Page header (white bar, Creatio style) ── -->
    <div class="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
      <div>
        <h1 class="text-lg font-semibold text-gray-900">Tableau de bord</h1>
        <p class="text-xs text-gray-400 capitalize mt-0.5">{{ dateLabel }}</p>
      </div>
      <RouterLink
        to="/planning"
        class="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
          <path fill-rule="evenodd" d="M4 1.75a.75.75 0 0 1 1.5 0V3h5V1.75a.75.75 0 0 1 1.5 0V3h.25A2.75 2.75 0 0 1 15 5.75v7.5A2.75 2.75 0 0 1 12.25 16H3.75A2.75 2.75 0 0 1 1 13.25v-7.5A2.75 2.75 0 0 1 3.75 3H4V1.75ZM3.75 6.5c-.69 0-1.25.56-1.25 1.25v5.5c0 .69.56 1.25 1.25 1.25h8.5c.69 0 1.25-.56 1.25-1.25v-5.5c0-.69-.56-1.25-1.25-1.25H3.75Z" clip-rule="evenodd" />
        </svg>
        Voir le planning
      </RouterLink>
    </div>

    <!-- ── Scrollable content ── -->
    <div class="flex-1 overflow-y-auto bg-gray-100 p-6 space-y-4">

      <div v-if="store.error" class="bg-white rounded-xl shadow-sm p-4 text-center text-red-500 text-sm">
        Connexion Directus indisponible — {{ store.error }}
      </div>

      <!-- KPI cards (Creatio style: flat colored, number large, label small below) -->
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div v-for="c in chiffres" :key="c.label"
          class="rounded-xl p-5 shadow-sm flex flex-col justify-between min-h-[100px]" :style="{ background: c.fond }">
          <div class="text-3xl font-bold text-white leading-none">{{ chargement ? '…' : c.valeur }}</div>
          <div class="mt-3">
            <div class="text-xs text-white/80 font-medium uppercase tracking-wide">{{ c.label }}</div>
            <div v-if="!chargement" class="text-[11px] text-white/60 mt-0.5">{{ c.detail }}</div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        <!-- À traiter : chaque rubrique se déplie sur les réservations concernées -->
        <section class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <span class="w-1 h-4 rounded-full bg-[#e65100]"></span>
            <h2 class="text-sm font-semibold text-gray-800">À traiter</h2>
          </div>
          <div v-if="chargement" class="p-8 text-center text-sm text-gray-400">Chargement…</div>
          <ul v-else class="divide-y divide-gray-100">
            <li v-for="t in taches" :key="t.cle">
              <button type="button"
                class="w-full flex items-center gap-2.5 px-5 py-2.5 text-left text-sm transition-colors"
                :class="t.total ? 'text-gray-800 hover:bg-gray-50' : 'text-gray-400 cursor-default'"
                :disabled="!t.total" :aria-expanded="depliee === t.cle && t.total > 0"
                @click="basculer(t.cle)">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                  class="w-3.5 h-3.5 shrink-0 transition-transform"
                  :class="[t.total ? 'text-gray-400' : 'text-gray-200', { 'rotate-90': depliee === t.cle && t.total }]">
                  <path fill-rule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
                </svg>
                <span class="flex-1">{{ t.label }}</span>
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full"
                  :class="t.total ? TON[t.ton] : 'bg-gray-100 text-gray-400'">{{ t.total }}</span>
              </button>
              <div v-if="depliee === t.cle && t.total" class="bg-gray-50 border-t border-gray-100 divide-y divide-gray-100">
                <button v-for="l in t.lignes" :key="l.cle" type="button"
                  class="w-full flex items-center gap-3 pl-11 pr-5 py-2 text-left hover:bg-blue-50 transition-colors"
                  @click="ouvrir(l)">
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-medium text-gray-900 truncate">{{ l.titre }}</span>
                    <span class="block text-xs text-gray-500 truncate">{{ l.detail }}</span>
                  </span>
                  <span class="text-xs shrink-0" :class="l.alerte ? 'text-red-600 font-semibold' : 'text-gray-400'">{{ l.note }}</span>
                </button>
              </div>
            </li>
          </ul>
        </section>

        <!-- Agenda : départs et retours de matériel -->
        <section class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <span class="w-1 h-4 rounded-full bg-[#1565c0]"></span>
            <h2 class="text-sm font-semibold text-gray-800">Les {{ HORIZON }} prochains jours</h2>
            <span v-if="livraisonsAgenda" class="ml-auto text-xs text-gray-400">{{ pluriel(livraisonsAgenda, 'livraison') }}</span>
          </div>
          <div v-if="chargement" class="p-8 text-center text-sm text-gray-400">Chargement…</div>
          <div v-else-if="!agenda.length" class="p-8 text-center text-sm text-gray-400">
            Rien de prévu sur les {{ HORIZON }} prochains jours
          </div>
          <div v-else class="divide-y divide-gray-100">
            <button v-for="e in agenda" :key="e.cle" type="button"
              class="w-full block px-5 py-2.5 text-left hover:bg-gray-50 transition-colors"
              @click="selectedId = e.id">
              <span class="flex items-baseline justify-between gap-3">
                <span class="text-sm font-semibold text-gray-900">{{ e.quand }}</span>
                <span class="text-xs font-medium shrink-0" :class="e.accent ? 'text-blue-600' : 'text-gray-500'">{{ e.type }}</span>
              </span>
              <span class="flex items-center gap-2 mt-0.5">
                <span class="flex-1 min-w-0 text-xs text-gray-500 truncate" :title="e.detail">{{ e.detail }}</span>
                <span v-if="e.nonSigne" class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">{{ e.nonSigne }}</span>
              </span>
            </button>
          </div>
        </section>

      </div>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">

        <!-- CA par mois : terminé, et signé à venir par-dessus -->
        <section class="lg:col-span-3 bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <span class="w-1 h-4 rounded-full bg-[#1b5e20]"></span>
            <h2 class="text-sm font-semibold text-gray-800">CA par mois</h2>
            <span class="ml-auto text-xs text-gray-400">{{ anneeCourante }}</span>
          </div>
          <div class="px-5 py-4">
            <div class="flex items-end gap-2 h-36">
              <div v-for="m in caParMois" :key="m.nom" :title="m.titre"
                class="flex-1 min-w-0 h-full flex flex-col items-center justify-end">
                <span v-if="m.total" class="text-[10px] leading-none text-gray-500 whitespace-nowrap mb-1">{{ formatNombre(m.total) }}</span>
                <div v-if="m.signe" class="w-full shrink-0 rounded-t bg-gray-300" :style="{ height: m.hSigne + '%' }"></div>
                <div v-if="m.termine" class="w-full shrink-0 bg-emerald-500" :class="{ 'rounded-t': !m.signe }" :style="{ height: m.hTermine + '%' }"></div>
                <div v-if="!m.total" class="w-full h-0.5 shrink-0 bg-gray-100"></div>
              </div>
            </div>
            <div class="flex gap-2 mt-1.5 text-[11px] text-gray-400">
              <span v-for="m in caParMois" :key="m.nom" class="flex-1 text-center uppercase"
                :class="{ 'font-bold text-gray-700': m.courant }">{{ m.nom[0] }}</span>
            </div>
            <div class="flex gap-4 mt-3 text-xs text-gray-500">
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>Terminé</span>
              <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-gray-300"></span>Signé, à venir</span>
            </div>
          </div>
        </section>

        <!-- Produits les plus loués -->
        <section class="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
            <span class="w-1 h-4 rounded-full bg-[#4a148c]"></span>
            <h2 class="text-sm font-semibold text-gray-800">Produits les plus loués</h2>
            <span class="ml-auto text-xs text-gray-400">Locations · CA</span>
          </div>
          <div v-if="chargement" class="p-8 text-center text-sm text-gray-400">Chargement…</div>
          <div v-else-if="!produitsLoues.length" class="p-8 text-center text-sm text-gray-400">
            Aucune location terminée ou signée en {{ anneeCourante }}
          </div>
          <ul v-else class="divide-y divide-gray-100">
            <li v-for="p in produitsLoues" :key="p.id" class="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <span class="text-gray-800 truncate">{{ p.nom }}</span>
              <span class="text-gray-500 shrink-0 tabular-nums">{{ p.locations }} · {{ formatCurrency(p.ca) }}</span>
            </li>
          </ul>
        </section>

      </div>
    </div>

    <ReservationModal :reservation="selectedReservation" @close="selectedId = null" />
  </div>
</template>
