<script setup>
import { computed, ref, watch } from 'vue'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useRouter } from 'vue-router'
import { useReservationsStore } from '../stores/reservations'
import { useAuthStore } from '../stores/auth'
import {
  getReservationProduits,
  getReservationArticles, getReservationArticleIds,
  getArticlesForReservation, getArticlesByIds,
  deleteReservationArticle, createReservationArticle,
  getReservationValidation, patchReservation,
  uploadFile, getFileUrl,
  getArticlesByProduit,
  getProduitGammes, getConsommablesByGammes, getGammes,
  getReservationConsommables, createReservationConsommable, deleteReservationConsommable,
  patchConsommable, getGammeArticlesMateriel, getAllArticlesSecondaires, createGammeArticleMateriel,
  getArticles,
  assetUrl,
} from '../api/directus'
import StatusBadge from './StatusBadge.vue'

const router = useRouter()

const props = defineProps({ reservation: { type: Object, default: null } })
defineEmits(['close'])

const store = useReservationsStore()
const auth  = useAuthStore()

const loading         = ref(null)
const toast           = ref(null)
const produits        = ref([])
const linkedArticles  = ref([])
const junctionIds     = ref([])
const validatedBy     = ref({})
const articlesError   = ref(false)
const step            = ref('detail')
// steps: 'detail' | 'article_select' | 'setup_list' | 'setup_article' | 'article_preview'

const articles           = ref([])
const selectedArticleIds = ref({})
const articleLoading     = ref(false)
const clientContacte     = ref(false)
const devisSigneFile     = ref(null)
const devisSigneInput    = ref(null)
const previewArticle     = ref(null)
const livraison          = ref(false)
const installation       = ref(false)
const distanceKm         = ref(0)
const remise             = ref(false)

// ── Consommables & setup par article ─────────────────────────────────────────
// { [produitId]: [{ gamme: {id,nom}, consoItems: [...], materielArts: [...] }] }
const gammesByProduit   = ref({})
// { [produitId]: { consoQty: { [consoId]: qty }, materielIds: [], configured: false } }
const setupState        = ref({})
const currentSetupProduitId = ref(null)

// Articles supplémentaires libres (global)
const allArticlesLibres    = ref([])
const selectedExtraIds     = ref([])
const extraSearch          = ref('')
const showCadeauAdd        = ref(false)
const setupExtraSearch     = ref('')

// Articles secondaires disponibles pour ajout à une gamme
const allSecondaryArticles = ref([])
const pendingGammeArticles = ref([])
const showAddForGamme      = ref({})

// Consommables confirmés (pour affichage dans detail + reset)
const reservationConso  = ref([])
const consoJunctionIds  = ref([])

// ── Computed setup ────────────────────────────────────────────────────────────
const currentGammes = computed(() =>
  currentSetupProduitId.value ? (gammesByProduit.value[currentSetupProduitId.value] ?? []) : []
)

const currentArticleInfo = computed(() => {
  const pid      = currentSetupProduitId.value
  const produit  = produits.value.find(p => p.produits_id?.id === pid)
  const articleId = selectedArticleIds.value[pid]
  const article  = articles.value.find(a => a.id === articleId)
  return {
    ref: article?.reference ?? `Article #${articleId}`,
    nom: produit?.produits_id?.name ?? '—',
  }
})

const setupListItems = computed(() =>
  produits.value
    .filter(p => selectedArticleIds.value[p.produits_id?.id])
    .map(p => {
      const pid       = p.produits_id?.id
      const articleId = selectedArticleIds.value[pid]
      const article   = articles.value.find(a => a.id === articleId)
      const state     = setupState.value[pid] ?? { configured: false }
      const gammes    = gammesByProduit.value[pid] ?? []
      return {
        produitId:   pid,
        produitNom:  p.produits_id?.name ?? '—',
        articleRef:  article?.reference ?? `Article #${articleId}`,
        configured:  state.configured,
        consoCount:  gammes.reduce((s, g) => s + g.consoItems.length, 0),
        matCount:    gammes.reduce((s, g) => s + g.materielArts.length, 0),
      }
    })
)

const allConsoItemsFlat = computed(() =>
  Object.values(gammesByProduit.value).flatMap(gs => gs.flatMap(g => g.consoItems))
)

const allConfigured = computed(() => {
  const pids = Object.keys(setupState.value)
  return pids.length > 0 && pids.every(pid => setupState.value[pid].configured)
})

// ── Chargement articles liés ──────────────────────────────────────────────────
async function loadLinkedArticles(reservationId) {
  articlesError.value = false
  junctionIds.value = []

  const expanded = await getReservationArticles(reservationId)
  const hasExpanded = (expanded ?? []).some(j => j.articles_id && typeof j.articles_id === 'object' && j.articles_id.id)
  if (hasExpanded) {
    junctionIds.value = expanded.map(j => j.id).filter(Boolean)
    linkedArticles.value = expanded.map(j => ({ junctionId: j.id, article: j.articles_id }))
    return
  }

  const direct = await getArticlesForReservation(reservationId)
  if (direct?.length) {
    linkedArticles.value = direct.map(a => ({ junctionId: null, article: a }))
    const rawIds = await getReservationArticleIds(reservationId)
    junctionIds.value = (rawIds ?? []).map(r => r.id).filter(Boolean)
    return
  }

  const rawIds = await getReservationArticleIds(reservationId)
  if (rawIds?.length) {
    junctionIds.value = rawIds.map(r => r.id).filter(Boolean)
    const articleIdValues = rawIds.map(r => r.articles_id).filter(v => v !== undefined && v !== null)
    if (articleIdValues.length) {
      const arts   = await getArticlesByIds(articleIdValues)
      const artMap = Object.fromEntries(arts.map(a => [a.id, a]))
      linkedArticles.value = rawIds.map(r => ({
        junctionId: r.id,
        article: artMap[r.articles_id] ?? { id: r.articles_id, reference: `Article #${r.articles_id}` },
      }))
      return
    }
    articlesError.value = true
    linkedArticles.value = rawIds.map((r, i) => ({ junctionId: r.id, article: { id: null, reference: `Article ${i + 1} (permission manquante)` } }))
    return
  }

  linkedArticles.value = []
}

watch(() => props.reservation?.id, async (id) => {
  step.value = 'detail'
  clientContacte.value = false
  devisSigneFile.value = null
  linkedArticles.value = []
  junctionIds.value    = []
  reservationConso.value  = []
  consoJunctionIds.value  = []
  gammesByProduit.value   = {}
  setupState.value        = {}
  if (!id) { produits.value = []; validatedBy.value = {}; return }

  const [rawP, rawV, rawConso] = await Promise.all([
    getReservationProduits(id),
    getReservationValidation(id),
    getReservationConsommables(id),
  ])
  produits.value         = rawP ?? []
  validatedBy.value      = rawV ?? {}
  livraison.value        = !!(rawV?.livraison)
  installation.value     = !!(rawV?.installation)
  distanceKm.value       = rawV?.distance_km ?? 0
  remise.value           = !!(rawV?.remise)
  reservationConso.value = rawConso ?? []
  consoJunctionIds.value = (rawConso ?? []).map(r => r.id).filter(Boolean)
  await loadLinkedArticles(id)
}, { immediate: true })

watch(() => props.reservation?.status, () => { clientContacte.value = false; devisSigneFile.value = null })

// ── Helpers ───────────────────────────────────────────────────────────────────
const client  = computed(() => props.reservation?.client)
const fmtDate     = (d) => d ? format(parseISO(d), "EEEE d MMMM yyyy", { locale: fr }) : '—'
const fmtTime     = (d) => { if (!d) return null; const dt = parseISO(d); const h = dt.getHours(); const m = dt.getMinutes(); return (h || m) ? `${String(h).padStart(2,'0')}h${m ? String(m).padStart(2,'0') : ''}` : null }
const fmtDateLong = (d) => {
  if (!d) return '—'
  const dt = parseISO(d)
  const base = format(dt, "EEE. d MMM yyyy", { locale: fr })
  const h = dt.getHours(); const min = dt.getMinutes()
  if (h === 0 && min === 0) return base
  return `${base} ${String(h).padStart(2,'0')}h${min ? String(min).padStart(2,'0') : ''}`
}

const clientInitials = computed(() => {
  const c = client.value
  if (!c) return '?'
  const name = [c.company_name, c.first_name, c.last_name].filter(Boolean).join(' ')
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
})

const signedDevisUrl = computed(() =>
  validatedBy.value.fichier_devis_signe ? getFileUrl(validatedBy.value.fichier_devis_signe) : null
)

const devisGenereUrl = computed(() =>
  validatedBy.value.fichier_devis ? getFileUrl(validatedBy.value.fichier_devis) : null
)

// ── Actions ───────────────────────────────────────────────────────────────────
const actions = computed(() => {
  const s = props.reservation?.status
  if (s === 'en_attente') return [
    { key: 'cancel', label: 'Annuler',                status: 'annulee',       cls: 'btn-error btn-outline' },
    { key: 'send',   label: 'Devis envoyé au client', status: 'devis_realise', cls: 'btn-primary' },
  ]
  if (s === 'devis_realise') return [
    { key: 'cancel',  label: 'Annuler',              status: 'annulee',        cls: 'btn-error btn-outline' },
    { key: 'reset',   label: 'Pas encore envoyé',   status: 'en_attente',     cls: 'btn-neutral btn-outline' },
    { key: 'confirm', label: 'Devis signé reçu',    status: 'devis_confirme', cls: 'btn-primary' },
  ]
  if (s === 'devis_confirme') return [
    { key: 'step_back', label: 'Revenir à l\'envoi', status: 'devis_realise', cls: 'btn-neutral btn-outline' },
    { key: 'done',      label: 'Marquer terminé',    status: 'terminee',      cls: 'btn-primary' },
  ]
  return [{ key: 'reset', label: 'Remettre en attente', status: 'en_attente', cls: 'btn-neutral btn-outline' }]
})

const VALIDATED_FIELD = {
  devis_realise:  'devis_realise_par',
  devis_confirme: 'devis_confirme_par',
  terminee:       'terminee_par',
}

const allProductsSetup = computed(() =>
  produits.value.length > 0 &&
  produits.value.every(p => productArticleGroups.value[p.produits_id?.id]?.principal?.length > 0)
)

const confirmBlocked = computed(() => {
  const s = props.reservation?.status
  if (s === 'en_attente') return !allProductsSetup.value || !devisGenereUrl.value || !clientContacte.value
  if (s === 'devis_realise') return !signedDevisUrl.value
  return false
})

const confirmBlockedReason = computed(() => {
  const s = props.reservation?.status
  if (s === 'en_attente') {
    if (!allProductsSetup.value) return 'Configurez tous les produits'
    if (!devisGenereUrl.value) return 'Générez le devis'
    if (!clientContacte.value) return 'Cochez la confirmation client'
  }
  if (!signedDevisUrl.value) return 'Ajoutez le devis signé'
  return ''
})

async function act(action) {
  if (action.key === 'step_back') { showConfirmedBackWarning.value = true; return }
  loading.value = action.key
  try {
    if (action.key === 'confirm' && devisSigneFile.value) {
      const fd = new FormData()
      fd.append('file', devisSigneFile.value)
      const uploaded = await uploadFile(fd)
      patchReservation(props.reservation.id, { fichier_devis_signe: uploaded.id }).catch(() => {})
      validatedBy.value = { ...validatedBy.value, fichier_devis_signe: uploaded.id }
    }

    if (action.status === 'terminee') {
      for (const row of reservationConso.value) {
        const cid = row.consommable_id?.id ?? row.consommable_id
        if (cid && row.quantite) {
          const item = allConsoItemsFlat.value.find(c => c.consommable_id?.id === cid)
          const newStock = Math.max(0, (item?.consommable_id?.stock ?? 0) - row.quantite)
          await patchConsommable(cid, { stock: newStock }).catch(() => {})
          if (item?.consommable_id) item.consommable_id.stock = newStock
        }
      }
    }

    await store.updateStatus(props.reservation.id, action.status)
    const field = VALIDATED_FIELD[action.status]
    if (field) patchReservation(props.reservation.id, { [field]: auth.user.name }).catch(() => {})
    showToast('Statut mis à jour', 'success')
  } catch (err) {
    showToast(err?.response?.data?.errors?.[0]?.message ?? err?.message ?? 'Erreur', 'error')
  } finally {
    loading.value = null
  }
}

function onDevisSigneChange(e) {
  devisSigneFile.value = e.target.files?.[0] ?? null
}

async function uploadDevisSigne() {
  if (!devisSigneFile.value) return
  loading.value = 'upload_devis_signe'
  try {
    const fd = new FormData()
    fd.append('file', devisSigneFile.value)
    const uploaded = await uploadFile(fd)
    await patchReservation(props.reservation.id, { fichier_devis_signe: uploaded.id })
    validatedBy.value = { ...validatedBy.value, fichier_devis_signe: uploaded.id }
    devisSigneFile.value = null
    showToast('Devis signé enregistré', 'success')
  } catch (err) {
    showToast(err?.message ?? 'Erreur upload', 'error')
  } finally {
    loading.value = null
  }
}

const factureFile  = ref(null)
const factureInput = ref(null)
const factureUrl   = computed(() =>
  validatedBy.value.fichier_facture ? getFileUrl(validatedBy.value.fichier_facture) : null
)

function onFactureChange(e) {
  factureFile.value = e.target.files?.[0] ?? null
}

async function uploadFacture() {
  if (!factureFile.value) return
  loading.value = 'upload_facture'
  try {
    const fd = new FormData()
    fd.append('file', factureFile.value)
    const uploaded = await uploadFile(fd)
    await patchReservation(props.reservation.id, { fichier_facture: uploaded.id })
    validatedBy.value = { ...validatedBy.value, fichier_facture: uploaded.id }
    factureFile.value = null
    showToast('Facture enregistrée', 'success')
  } catch (err) {
    showToast(err?.message ?? 'Erreur upload facture', 'error')
  } finally {
    loading.value = null
  }
}

async function toggleLivraison(val) {
  livraison.value = val
  installation.value = val
  if (!val) distanceKm.value = 0
  await patchReservation(props.reservation.id, { livraison: val, installation: val, distance_km: val ? distanceKm.value : 0 }).catch(() => {})
}

function livraisonFee(km) {
  if (km <= 15)  return 20
  if (km <= 30)  return 40
  if (km <= 50)  return 65
  if (km <= 80)  return 100
  if (km <= 120) return 150
  return 150 + (km - 120)
}

const livraisonMontant   = computed(() => livraison.value ? livraisonFee(distanceKm.value) : 0)
const livraisonZoneIdx   = computed(() => {
  const km = distanceKm.value
  if (km <= 15)  return 0
  if (km <= 30)  return 1
  if (km <= 50)  return 2
  if (km <= 80)  return 3
  if (km <= 120) return 4
  return 5
})

async function saveDistance() {
  await patchReservation(props.reservation.id, { distance_km: distanceKm.value }).catch(() => {})
}

const produitsTotalTTC = computed(() =>
  produits.value.reduce((sum, p) => {
    const price = p.unit_price ?? p.produits_id?.prix_location ?? 0
    return sum + price * (p.quantity || 1)
  }, 0)
)
const remiseMontantTTC = computed(() => {
  if (!remise.value) return 0
  return Math.min(livraisonMontant.value, 50)
})
const remiseDescription = computed(() => {
  if (!remise.value) return ''
  return livraisonMontant.value <= 50
    ? 'Livraison & installation offerts'
    : 'Livraison & installation offerts (plafond 50 €)'
})
async function toggleRemise(val) {
  remise.value = val
  await patchReservation(props.reservation.id, { remise: val }).catch(() => {})
}

async function generateDevis() {
  loading.value = 'generate_devis'
  try {
    const logoImg = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = import.meta.env.BASE_URL + 'Logo.png'
    })

    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const r   = props.reservation
    const c   = client.value
    const now = format(new Date(), 'dd/MM/yyyy')
    const W = 210, M = 10, INNER = 190, pageH = 297, TVA = 0.20
    const FOOTER_H = 18, USABLE = pageH - FOOTER_H - 4

    const TEAL  = [0, 84, 115]
    const LTEAL = [220, 238, 248]
    const MGREY = [240, 240, 242]
    const LGREY = [200, 200, 205]
    const DGREY = [100, 100, 110]
    const BLACK = [20, 20, 30]
    const WHITE = [255, 255, 255]

    let y = 0
    const addPage   = () => { doc.addPage(); y = 14 }
    const checkPage = (n = 10) => { if (y + n > USABLE) addPage() }
    const setColor  = (rgb) => doc.setTextColor(...rgb)

    // ── Helpers ───────────────────────────────────────────────────────────────
    let sectionNum = 0
    const sectionHeader = (title) => {
      checkPage(10); y += 4
      sectionNum++
      doc.setFillColor(...TEAL); doc.rect(M, y, INNER, 7, 'F')
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); setColor(WHITE)
      doc.text(`${sectionNum}. ${title.toUpperCase()}`, M + 4, y + 5)
      y += 10
    }

    const drawTable = (cols, rows) => {
      const headerH = 6.5
      checkPage(headerH + 6)
      doc.setFillColor(...LTEAL); doc.rect(M, y, INNER, headerH, 'F')
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setColor(TEAL)
      for (const col of cols) {
        const align = col.align ?? 'left'
        doc.text(col.label, align === 'right' ? col.x + col.w - 2 : col.x + 2, y + 4.5, { align })
      }
      y += headerH
      let odd = false
      for (const row of rows) {
        const cells = row.cells ?? row
        const sub   = row.subtitle ?? null
        const rowH  = sub ? 10 : 6
        checkPage(rowH + 2)
        if (odd) { doc.setFillColor(...MGREY); doc.rect(M, y, INNER, rowH, 'F') }
        odd = !odd
        doc.setDrawColor(...LGREY); doc.setLineWidth(0.1)
        doc.line(M, y + rowH, M + INNER, y + rowH)
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setColor(BLACK)
        for (let i = 0; i < cols.length; i++) {
          const col = cols[i]; const cell = String(cells[i] ?? '—')
          const align = col.align ?? 'left'
          const tx = align === 'right' ? col.x + col.w - 2 : col.x + 2
          doc.text((doc.splitTextToSize(cell, col.w - 4)[0] ?? cell), tx, sub ? y + 4 : y + 4.5, { align })
        }
        if (sub) { doc.setFontSize(7); doc.setFont('helvetica', 'italic'); setColor(DGREY); doc.text(sub, cols[0].x + 2, y + 8.5) }
        y += rowH
      }
      doc.setDrawColor(...LGREY); doc.line(M, y, M + INNER, y)
      y += 4
    }

    const drawCardHeader = (bx, bW, label) => {
      doc.setFillColor(...LTEAL)
      doc.roundedRect(bx, y, bW, 6, 1.5, 1.5, 'F')
      doc.rect(bx, y + 3, bW, 3, 'F')
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); setColor(TEAL)
      doc.text(label, bx + 3, y + 4.2)
    }

    // ── HEADER BAND (28mm) ────────────────────────────────────────────────────
    const HEADER_H = 28
    doc.setFillColor(...TEAL); doc.rect(0, 0, W, HEADER_H, 'F')
    doc.addImage(logoImg, 'PNG', M + 2, 4, 44, 18)
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); setColor([190, 220, 235])
    doc.text('Location de matériel festif', M + 2, HEADER_H - 4)
    doc.setFontSize(22); doc.setFont('helvetica', 'bold'); setColor(WHITE)
    doc.text('DEVIS', W - M, 18, { align: 'right' })
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setColor([190, 220, 235])
    doc.text(`N° ${r.id}`, W - M, 24, { align: 'right' })
    doc.text(`Émis le ${now}`, W - M, HEADER_H - 2, { align: 'right' })
    y = HEADER_H + 6

    // ── INFO : 3 cards (CLIENT | PÉRIODE | LOGISTIQUE) ───────────────────────
    const GAP = 6
    const cW_c = 85, cW_p = 44, cW_l = INNER - cW_c - cW_p - GAP * 2
    const x_p  = M + cW_c + GAP
    const x_l  = x_p + cW_p + GAP

    const fullName = `${c?.first_name ?? ''} ${c?.last_name ?? ''}`.trim()
    const cLines = [
      c?.company_name ? { t: c.company_name, bold: true,  sz: 9 }   : null,
      fullName        ? { t: fullName, bold: !c?.company_name, sz: 8.5 } : null,
      c?.phone        ? { t: c.phone,  bold: false, sz: 8 }   : null,
      c?.email        ? { t: c.email,  bold: false, sz: 7.5 } : null,
      (c?.zip_code || c?.city) ? { t: [c?.zip_code, c?.city].filter(Boolean).join(' '), bold: false, sz: 8 } : null,
    ].filter(Boolean)
    const cardH = Math.max(32, 10 + cLines.length * 5)

    // CLIENT card
    doc.setFillColor(...MGREY); doc.setDrawColor(...LGREY); doc.setLineWidth(0.3)
    doc.roundedRect(M, y, cW_c, cardH, 1.5, 1.5, 'FD')
    drawCardHeader(M, cW_c, 'CLIENT')
    let cy = y + 11
    for (const l of cLines) {
      doc.setFontSize(l.sz); doc.setFont('helvetica', l.bold ? 'bold' : 'normal'); setColor(BLACK)
      doc.text(l.t, M + 3, cy); cy += 5
    }

    // PÉRIODE card
    doc.setFillColor(...MGREY); doc.setDrawColor(...LGREY)
    doc.roundedRect(x_p, y, cW_p, cardH, 1.5, 1.5, 'FD')
    drawCardHeader(x_p, cW_p, 'PÉRIODE')
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setColor(BLACK)
    doc.text('Début :', x_p + 3, y + 11)
    doc.setFont('helvetica', 'normal')
    doc.text(fmtDateLong(r.date_start), x_p + 3, y + 16)
    doc.setFont('helvetica', 'bold')
    doc.text('Fin :', x_p + 3, y + 22)
    doc.setFont('helvetica', 'normal')
    doc.text(fmtDateLong(r.date_end), x_p + 3, y + 27)

    // LOGISTIQUE card
    doc.setFillColor(...MGREY); doc.setDrawColor(...LGREY)
    doc.roundedRect(x_l, y, cW_l, cardH, 1.5, 1.5, 'FD')
    drawCardHeader(x_l, cW_l, 'LOGISTIQUE')
    let ly = y + 11
    if (livraison.value) {
      const zone = distanceKm.value <= 15 ? '0–15 km' : distanceKm.value <= 30 ? '15–30 km'
                 : distanceKm.value <= 50 ? '30–50 km' : distanceKm.value <= 80 ? '50–80 km'
                 : distanceKm.value <= 120 ? '80–120 km' : '> 120 km'
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setColor(TEAL)
      doc.text('Livraison & installation', x_l + 3, ly); ly += 5
      doc.setFont('helvetica', 'normal'); setColor(BLACK)
      doc.text(`Forfait ${zone}`, x_l + 3, ly); ly += 5
    } else {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); setColor(DGREY)
      doc.text('Livraison : non', x_l + 3, ly); ly += 5
    }
    if (r.delivery_address) {
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); setColor(TEAL)
      doc.text('Lieu :', x_l + 3, ly); ly += 4
      doc.setFont('helvetica', 'normal'); setColor(DGREY)
      for (const al of r.delivery_address.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 2)) {
        doc.text(al, x_l + 3, ly); ly += 3.5
      }
    }
    y += cardH + 6

    // ── 1. PRODUITS ───────────────────────────────────────────────────────────
    sectionHeader('Produits réservés')
    drawTable([
      { label: 'Désignation', x: M,       w: 88 },
      { label: 'Qté',         x: M + 88,  w: 14, align: 'right' },
      { label: 'P.U. HT',    x: M + 102, w: 29, align: 'right' },
      { label: 'P.U. TTC',   x: M + 131, w: 29, align: 'right' },
      { label: 'Total TTC',  x: M + 160, w: 30, align: 'right' },
    ], produits.value.map(p => {
      const qty = p.quantity ?? 1
      const ttc = p.unit_price ? Number(p.unit_price) : (p.produits_id?.prix_location ? Number(p.produits_id.prix_location) : null)
      const ht  = ttc != null ? ttc / (1 + TVA) : null
      const st  = ttc != null ? qty * ttc : null
      return [p.produits_id?.name ?? '—', qty, ht != null ? `${ht.toFixed(2)} €` : '—', ttc != null ? `${ttc.toFixed(2)} €` : '—', st != null ? `${st.toFixed(2)} €` : '—']
    }))

    // ── 2. LIVRAISON & INSTALLATION ───────────────────────────────────────────
    if (livraison.value) {
      sectionHeader('Livraison & Installation')
      const fee  = livraisonMontant.value
      const zone = distanceKm.value <= 15 ? '0–15 km' : distanceKm.value <= 30 ? '15–30 km'
                 : distanceKm.value <= 50 ? '30–50 km' : distanceKm.value <= 80 ? '50–80 km'
                 : distanceKm.value <= 120 ? '80–120 km' : '> 120 km'
      drawTable([
        { label: 'Prestation',  x: M,       w: 120 },
        { label: 'Forfait',     x: M + 120, w: 30, align: 'right' },
        { label: 'Montant TTC', x: M + 150, w: 40, align: 'right' },
      ], [['Livraison, installation & déinstallation', zone, `${fee.toFixed(2)} €`]])
    }

    // ── 3. RÉCAPITULATIF FINANCIER ────────────────────────────────────────────
    sectionHeader('Récapitulatif financier')

    let soustotalTTC = produits.value.reduce((acc, p) => {
      const qty = p.quantity ?? 1
      const ttc = p.unit_price ? Number(p.unit_price) : (p.produits_id?.prix_location ? Number(p.produits_id.prix_location) : 0)
      return acc + qty * ttc
    }, 0)
    if (livraison.value) soustotalTTC += livraisonMontant.value
    const remiseTTC = remiseMontantTTC.value
    const totalTTC  = soustotalTTC - remiseTTC
    const totalHT   = totalTTC / 1.2
    const soustHT   = soustotalTTC / 1.2
    const remiseHT  = remiseTTC / 1.2
    const tvaAmt    = totalTTC - totalHT

    checkPage(52)
    const sumX = W - M - 80, sumW = 80
    const summaryRows = [
      ['Sous-total HT', `${soustHT.toFixed(2)} €`, false],
      ...(remiseTTC > 0 ? [['Remise (HT)', `−${remiseHT.toFixed(2)} €`, false]] : []),
      ['Total HT',  `${totalHT.toFixed(2)} €`, false],
      ['TVA 20 %',  `${tvaAmt.toFixed(2)} €`,  false],
      ['TOTAL TTC', `${totalTTC.toFixed(2)} €`, true ],
    ]
    for (const [label, val, bold] of summaryRows) {
      const rH = bold ? 9 : 6.5
      if (bold) {
        doc.setFillColor(...TEAL); doc.rect(sumX, y, sumW, rH, 'F')
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); setColor(WHITE)
      } else {
        doc.setFillColor(...LTEAL); doc.rect(sumX, y, sumW, rH, 'F')
        doc.setDrawColor(...LGREY); doc.setLineWidth(0.1)
        doc.line(sumX, y + rH, sumX + sumW, y + rH)
        doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); setColor(BLACK)
      }
      doc.text(label, sumX + 3, y + (bold ? 6.5 : 4.5))
      doc.text(val,   sumX + sumW - 3, y + (bold ? 6.5 : 4.5), { align: 'right' })
      y += rH + 0.5
    }
    y += 4

    if (remiseTTC > 0) {
      checkPage(10)
      doc.setFillColor(...LTEAL); doc.roundedRect(M, y, INNER, 7, 1, 1, 'F')
      doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); setColor(TEAL)
      doc.text(`Remise appliquée : ${remiseDescription.value}`, M + 3, y + 4.8)
      y += 11
    }

    if (r.notes) {
      checkPage(14)
      doc.setFillColor(...LTEAL); doc.roundedRect(M, y, INNER, 5.5, 1, 1, 'F')
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); setColor(TEAL)
      doc.text('NOTES', M + 3, y + 4); y += 7
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); setColor([40, 40, 50])
      const noteLines = doc.splitTextToSize(r.notes, INNER - 4)
      checkPage(noteLines.length * 4.5 + 4); doc.text(noteLines, M + 2, y)
      y += noteLines.length * 4.5 + 4
    }

    // ── SIGNATURES (collées en bas de page) ───────────────────────────────────
    const colW = (INNER - 4) / 2
    const sigH = 28
    const sigY = pageH - FOOTER_H - sigH - 10
    if (y > sigY) addPage()
    doc.setFillColor(...MGREY); doc.setDrawColor(...LGREY); doc.setLineWidth(0.3)
    doc.roundedRect(M,            sigY, colW, sigH, 1.5, 1.5, 'FD')
    doc.roundedRect(M + colW + 4, sigY, colW, sigH, 1.5, 1.5, 'FD')
    doc.setFillColor(...LTEAL)
    doc.roundedRect(M,            sigY, colW, 6, 1.5, 1.5, 'F')
    doc.rect(M,            sigY + 3, colW, 3, 'F')
    doc.roundedRect(M + colW + 4, sigY, colW, 6, 1.5, 1.5, 'F')
    doc.rect(M + colW + 4, sigY + 3, colW, 3, 'F')
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); setColor(TEAL)
    doc.text('LE CLIENT', M + 3, sigY + 4.2)
    doc.text("FIESTALO'K", M + colW + 7, sigY + 4.2)
    doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setColor(DGREY)
    doc.text('Mention « Bon pour accord » + date + signature', M + 3, sigY + 10)
    doc.text('Cachet et signature', M + colW + 7, sigY + 10)

    // ── FOOTER SUR TOUTES LES PAGES DEVIS ─────────────────────────────────────
    const devisPageCount = doc.getNumberOfPages()
    for (let p = 1; p <= devisPageCount; p++) {
      doc.setPage(p)
      doc.setFillColor(...TEAL); doc.rect(0, pageH - FOOTER_H, W, FOOTER_H, 'F')
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setColor(WHITE)
      doc.text('06 61 00 50 39',   W * 0.2, pageH - 10, { align: 'center' })
      doc.text('www.fiestalok.fr', W * 0.5, pageH - 10, { align: 'center' })
      doc.text('@fiestalok',       W * 0.8, pageH - 10, { align: 'center' })
      doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); setColor([180, 210, 225])
      doc.text("Ce devis est valable 30 jours à compter de sa date d'émission", W / 2, pageH - 4, { align: 'center' })
    }

    // ── FUSION AVEC CGV ───────────────────────────────────────────────────────
    const { PDFDocument } = await import('pdf-lib')
    const devisBytes = doc.output('arraybuffer')
    const dPdf = await PDFDocument.load(devisBytes)

    let finalBytes
    try {
      const cgvResp  = await fetch(import.meta.env.BASE_URL + 'CGV_HopLaLok.pdf')
      if (!cgvResp.ok) throw new Error('CGV not found')
      const cgvBytes = await cgvResp.arrayBuffer()
      const cgvPdf   = await PDFDocument.load(cgvBytes)
      const merged   = await PDFDocument.create()
      const dPages   = await merged.copyPages(dPdf, dPdf.getPageIndices())
      dPages.forEach(pg => merged.addPage(pg))
      const cPages   = await merged.copyPages(cgvPdf, cgvPdf.getPageIndices())
      cPages.forEach(pg => merged.addPage(pg))
      finalBytes = await merged.save()
    } catch {
      finalBytes = await dPdf.save()
    }

    const blob = new Blob([finalBytes], { type: 'application/pdf' })
    const fd   = new FormData()
    fd.append('file', blob, `devis-reservation-${r.id}.pdf`)
    const uploaded = await uploadFile(fd)
    await patchReservation(r.id, { fichier_devis: uploaded.id })
    validatedBy.value = { ...validatedBy.value, fichier_devis: uploaded.id }
    showToast('Devis généré avec succès', 'success')
  } catch (err) {
    console.error(err)
    const apiMsg = err?.response?.data?.errors?.[0]?.message ?? ''
    const isAuth = err?.response?.status === 401 || apiMsg.toLowerCase().includes('token')
    showToast(isAuth ? 'Session expirée – reconnectez-vous' : (apiMsg || err?.message || 'Erreur génération devis'), 'error')
  } finally {
    loading.value = null
  }
}

// ── Sélection articles ────────────────────────────────────────────────────────
async function openArticleSelect() {
  step.value = 'article_select'
  articleLoading.value = true
  selectedArticleIds.value = {}
  try {
    const ids = produits.value.map(p => p.produits_id?.id).filter(Boolean)
    articles.value = ids.length ? await getArticlesByProduit(ids) : []
  } finally {
    articleLoading.value = false
  }
}

const articlesByProduit = computed(() => {
  const map = {}
  for (const a of articles.value) {
    const pid = a.produit_id?.id
    if (!pid) continue
    if (!map[pid]) map[pid] = []
    map[pid].push(a)
  }
  for (const pid in map) {
    map[pid].sort((a, b) => {
      if (a.etat === 'disponible' && b.etat !== 'disponible') return -1
      if (a.etat !== 'disponible' && b.etat === 'disponible') return 1
      return 0
    })
  }
  return map
})

const articlesByProduitGrouped = computed(() => {
  const out = {}
  for (const [pid, arts] of Object.entries(articlesByProduit.value)) {
    out[pid] = {
      dispos:  arts.filter(a => a.etat === 'disponible'),
      autres:  arts.filter(a => a.etat !== 'disponible'),
    }
  }
  return out
})

// Maps each produit in the reservation to its linked articles, filling in unmatched articles
// (articles without produit_id) under products that have no match.
const productArticleGroups = computed(() => {
  const groups = {}
  for (const p of produits.value) {
    const pid = p.produits_id?.id
    if (!pid) continue
    groups[pid] = {
      principal: linkedArticles.value.filter(la => la.article?.type !== 'secondaire' && la.article?.produit_id?.id === pid),
      materiel:  linkedArticles.value.filter(la => la.article?.type === 'secondaire'  && la.article?.produit_id?.id === pid),
      inferred: false,
    }
  }
  const unmatched = linkedArticles.value.filter(la => !la.article?.produit_id?.id && la.article?.type !== 'secondaire')
  if (unmatched.length) {
    const emptyPids = produits.value.map(p => p.produits_id?.id).filter(pid => pid && !groups[pid].principal.length)
    if (emptyPids.length === unmatched.length) {
      // One-to-one: pair each article with each product in order
      emptyPids.forEach((pid, i) => { groups[pid].principal = [unmatched[i]]; groups[pid].inferred = true })
    } else if (emptyPids.length > 0) {
      // Fallback: put all unmatched under first empty product
      groups[emptyPids[0]].principal = unmatched
      groups[emptyPids[0]].inferred = true
    }
  }
  return groups
})

async function confirmArticles() {
  loading.value = 'confirm_articles'
  try {
    const missing = produits.value.filter(p => !selectedArticleIds.value[p.produits_id?.id])
    if (missing.length) {
      showToast(`Article requis pour : ${missing.map(p => p.produits_id?.name).join(', ')}`, 'error')
      loading.value = null
      return
    }

    for (const jId of junctionIds.value) await deleteReservationArticle(jId).catch(() => {})
    junctionIds.value    = []
    linkedArticles.value = []

    for (const [, articleId] of Object.entries(selectedArticleIds.value)) {
      if (!articleId) continue
      await createReservationArticle({ reservations_id: props.reservation.id, articles_id: Number(articleId) })
    }

    await loadLinkedArticles(props.reservation.id)
    const targetProduit = postArticleSelectProduit.value
    postArticleSelectProduit.value = null
    if (targetProduit) {
      setupFromDetail.value = true
      await openSetupList()
      goToSetupArticle(targetProduit)
    } else {
      await openSetupList()
    }
  } catch (err) {
    showToast(err?.response?.data?.errors?.[0]?.message ?? err?.message ?? 'Erreur', 'error')
    loading.value = null
  }
}

// ── Setup par article ─────────────────────────────────────────────────────────
async function openSetupList() {
  loading.value = 'load_setup'
  try {
    const produitIds = produits.value.map(p => p.produits_id?.id).filter(Boolean)

    const artLibres = await getArticles().catch(() => [])
    allArticlesLibres.value = artLibres ?? []
    selectedExtraIds.value  = []
    extraSearch.value       = ''
    showCadeauAdd.value     = false
    setupExtraSearch.value  = ''

    if (!produitIds.length) {
      gammesByProduit.value = {}
      setupState.value      = {}
      if (!setupFromDetail.value) step.value = 'setup_list'
      return
    }

    const junctions = await getProduitGammes({ filter: { produit_id: { _in: produitIds } } })
    const gammeIdsByProduit = {}
    for (const j of junctions ?? []) {
      if (!gammeIdsByProduit[j.produit_id]) gammeIdsByProduit[j.produit_id] = []
      if (!gammeIdsByProduit[j.produit_id].includes(j.gamme_id)) {
        gammeIdsByProduit[j.produit_id].push(j.gamme_id)
      }
    }

    const allGammeIds = [...new Set(Object.values(gammeIdsByProduit).flat())]

    let gammeMap = {}; let consoByGamme = {}; let materielByGamme = {}; let allSecArt = []

    if (allGammeIds.length) {
      const [allGammes, consoItems, gammeArtsRows, secArts] = await Promise.all([
        getGammes().catch(() => []),
        getConsommablesByGammes(allGammeIds),
        getGammeArticlesMateriel(allGammeIds),
        getAllArticlesSecondaires(),
      ])

      gammeMap = Object.fromEntries((allGammes ?? []).map(g => [g.id, g]))

      for (const item of consoItems ?? []) {
        if (!consoByGamme[item.gamme_id]) consoByGamme[item.gamme_id] = []
        consoByGamme[item.gamme_id].push(item)
      }
      for (const ga of gammeArtsRows ?? []) {
        if (!ga.article_id || typeof ga.article_id !== 'object') continue
        if (!materielByGamme[ga.gamme_id]) materielByGamme[ga.gamme_id] = []
        materielByGamme[ga.gamme_id].push(ga.article_id)
      }

      const alreadyInGammes = new Set(
        (gammeArtsRows ?? []).map(r => r.article_id?.id ?? r.article_id).filter(Boolean)
      )
      allSecArt = (secArts ?? []).filter(a => !alreadyInGammes.has(a.id))
    }

    allSecondaryArticles.value = allSecArt
    pendingGammeArticles.value = []
    showAddForGamme.value      = {}

    const result = {}
    for (const produitId of produitIds) {
      const gammeIds = gammeIdsByProduit[produitId] ?? []
      result[produitId] = gammeIds
        .map(gid => ({
          gamme:       gammeMap[gid] ?? { id: gid, nom: `Gamme #${gid}` },
          consoItems:  consoByGamme[gid] ?? [],
          materielArts: materielByGamme[gid] ?? [],
        }))
        .filter(g => g.consoItems.length || g.materielArts.length)
    }
    gammesByProduit.value = result

    const existingConsoQty = {}
    for (const row of reservationConso.value) {
      const cid = row.consommable_id?.id ?? row.consommable_id
      if (cid) existingConsoQty[cid] = row.quantite
    }
    const existingMaterielIds = linkedArticles.value
      .filter(la => la.article?.type === 'secondaire')
      .map(la => la.article?.id)
      .filter(Boolean)

    const newSetupState = {}
    for (const produitId of produitIds) {
      const gammes = result[produitId] ?? []
      const consoQty = {}
      for (const g of gammes) {
        for (const item of g.consoItems) {
          const csId = item.consommable_id?.id
          if (csId) consoQty[csId] = existingConsoQty[csId] ?? item.quantite_defaut ?? 1
        }
      }
      const materielIds = existingMaterielIds.filter(id =>
        gammes.some(g => g.materielArts.some(a => a.id === id))
      )
      newSetupState[produitId] = {
        consoQty,
        materielIds,
        configured: false,
      }
    }
    setupState.value = newSetupState

    if (!setupFromDetail.value) step.value = 'setup_list'
  } catch (err) {
    showToast(err?.message ?? 'Erreur chargement', 'error')
  } finally {
    loading.value = null
  }
}

const setupFromDetail          = ref(false)
const postArticleSelectProduit = ref(null)

async function openSetupForProduct(produitId) {
  postArticleSelectProduit.value = produitId
  // Pre-populate article selection from already-linked articles
  const presel = {}
  for (const p of produits.value) {
    const pid = p.produits_id?.id
    if (!pid) continue
    const existing = linkedArticles.value.find(la => la.article?.produit_id?.id === pid && la.article?.type !== 'secondaire')
    if (existing?.article?.id) presel[pid] = existing.article.id
  }
  selectedArticleIds.value = presel
  step.value = 'article_select'
  articleLoading.value = true
  try {
    const ids = produits.value.map(p => p.produits_id?.id).filter(Boolean)
    articles.value = ids.length ? await getArticlesByProduit(ids) : []
  } finally {
    articleLoading.value = false
  }
}

function goToSetupArticle(produitId) {
  currentSetupProduitId.value = produitId
  setupExtraSearch.value = ''
  step.value = 'setup_article'
}

async function saveSetupArticle() {
  if (currentSetupProduitId.value) {
    setupState.value[currentSetupProduitId.value].configured = true
  }
  if (setupFromDetail.value) {
    setupFromDetail.value = false
    await confirmConsommables()
  } else {
    step.value = 'setup_list'
  }
}

function toggleMaterielForSetup(artId, checked) {
  const state = setupState.value[currentSetupProduitId.value]
  if (!state) return
  if (checked && !state.materielIds.includes(artId)) state.materielIds.push(artId)
  else if (!checked) state.materielIds = state.materielIds.filter(id => id !== artId)
}

async function confirmConsommables() {
  loading.value = 'confirm_conso'
  try {
    // 1. Supprimer consommables existants + restaurer stock
    for (const row of reservationConso.value) {
      const cid = row.consommable_id?.id ?? row.consommable_id
      if (cid && row.quantite) {
        const item = allConsoItemsFlat.value.find(c => c.consommable_id?.id === cid)
        if (item?.consommable_id) {
          const restoredStock = (item.consommable_id.stock ?? 0) + row.quantite
          await patchConsommable(cid, { stock: restoredStock }).catch(() => {})
          item.consommable_id.stock = restoredStock
        }
      }
      await deleteReservationConsommable(row.id).catch(() => {})
    }
    reservationConso.value = []; consoJunctionIds.value = []

    // 2. Supprimer articles secondaires existants
    const secondaryJunctions = linkedArticles.value.filter(la => la.article?.type === 'secondaire')
    for (const la of secondaryJunctions) {
      if (la.junctionId) {
        await deleteReservationArticle(la.junctionId).catch(() => {})
        junctionIds.value = junctionIds.value.filter(id => id !== la.junctionId)
      }
    }

    // 3. Agréger setup
    const allConsoQty = {}; const allMaterielIds = []
    for (const state of Object.values(setupState.value)) {
      for (const [cid, qty] of Object.entries(state.consoQty ?? {})) {
        if (Number(qty) > 0) allConsoQty[cid] = (allConsoQty[cid] ?? 0) + Number(qty)
      }
      for (const id of state.materielIds ?? []) {
        if (!allMaterielIds.includes(id)) allMaterielIds.push(id)
      }
    }

    // 4. Créer consommables + décrémenter stock
    for (const [cidStr, qty] of Object.entries(allConsoQty)) {
      const cid = Number(cidStr); const q = Number(qty)
      if (!cid || !q || q <= 0) continue
      await createReservationConsommable({ reservations_id: props.reservation.id, consommable_id: cid, quantite: q })
      const item = allConsoItemsFlat.value.find(c => c.consommable_id?.id === cid)
      if (item?.consommable_id) {
        const newStock = Math.max(0, (item.consommable_id.stock ?? 0) - q)
        await patchConsommable(cid, { stock: newStock }).catch(() => {})
        item.consommable_id.stock = newStock
      }
    }

    // 5. Persister nouveaux articles dans gamme_articles_materiel
    for (const pending of pendingGammeArticles.value) {
      await createGammeArticleMateriel({ gamme_id: pending.gamme_id, article_id: pending.article.id }).catch(() => {})
    }
    pendingGammeArticles.value = []

    // 6. Ajouter matériel de gamme à reservations_articles
    for (const artId of allMaterielIds) {
      if (!artId) continue
      const created = await createReservationArticle({ reservations_id: props.reservation.id, articles_id: Number(artId) })
      if (created?.id) junctionIds.value.push(created.id)
    }

    // 7. Articles supplémentaires libres
    for (const artId of selectedExtraIds.value) {
      if (!artId) continue
      const created = await createReservationArticle({ reservations_id: props.reservation.id, articles_id: Number(artId) })
      if (created?.id) junctionIds.value.push(created.id)
    }
    selectedExtraIds.value = []

    const refreshed = await getReservationConsommables(props.reservation.id)
    reservationConso.value = refreshed ?? []
    consoJunctionIds.value = (refreshed ?? []).map(r => r.id).filter(Boolean)
    await loadLinkedArticles(props.reservation.id)
    await finalizeDevisRealise()
  } catch (err) {
    showToast(err?.response?.data?.errors?.[0]?.message ?? err?.message ?? 'Erreur', 'error')
  } finally {
    loading.value = null
  }
}

function finalizeDevisRealise() {
  step.value = 'detail'
}

// ── Articles libres filtrés ───────────────────────────────────────────────────
const alreadyLinkedIds = computed(() => new Set([
  ...linkedArticles.value.map(la => la.article?.id).filter(Boolean),
  ...Object.values(setupState.value).flatMap(s => s.materielIds ?? []),
  ...Object.values(gammesByProduit.value).flatMap(gs => gs.flatMap(g => g.materielArts.map(a => a.id))),
]))

const filteredArticlesLibres = computed(() => {
  const q = extraSearch.value.toLowerCase().trim()
  return allArticlesLibres.value.filter(a =>
    !alreadyLinkedIds.value.has(a.id) &&
    (!q || a.reference?.toLowerCase().includes(q) || a.produit_id?.name?.toLowerCase().includes(q))
  )
})

const filteredExtrasForSetupArticle = computed(() => {
  const q = setupExtraSearch.value.toLowerCase().trim()
  return allArticlesLibres.value.filter(a =>
    !alreadyLinkedIds.value.has(a.id) &&
    (!q || a.reference?.toLowerCase().includes(q) || a.produit_id?.name?.toLowerCase().includes(q))
  )
})

const selectedExtraArticles = computed(() =>
  allArticlesLibres.value.filter(a => selectedExtraIds.value.includes(a.id))
)

function availableArticlesForGamme(gammeId) {
  const pid = currentSetupProduitId.value
  const gamme = (gammesByProduit.value[pid] ?? []).find(g => g.gamme.id === gammeId)
  const already = new Set([
    ...(gamme?.materielArts.map(a => a.id) ?? []),
    ...pendingGammeArticles.value.filter(p => p.gamme_id === gammeId).map(p => p.article.id),
  ])
  return allSecondaryArticles.value.filter(a => !already.has(a.id))
}

function addExtraArticleToGamme(gammeId, articleIdStr) {
  const articleId = Number(articleIdStr)
  if (!articleId) return
  const article = allSecondaryArticles.value.find(a => a.id === articleId)
  if (!article) return
  pendingGammeArticles.value.push({ gamme_id: gammeId, article })
  const pid = currentSetupProduitId.value
  if (pid) {
    const gamme = (gammesByProduit.value[pid] ?? []).find(g => g.gamme.id === gammeId)
    if (gamme) gamme.materielArts.push(article)
  }
  const state = setupState.value[pid]
  if (state && !state.materielIds.includes(articleId)) state.materielIds.push(articleId)
  showAddForGamme.value[gammeId] = false
}

// ── Aperçu article ────────────────────────────────────────────────────────────
function openArticlePreview(art) { previewArticle.value = art; step.value = 'article_preview' }
function goToArticlesView() { router.push('/articles') }

// ── Utils ─────────────────────────────────────────────────────────────────────
function showToast(msg, type) {
  toast.value = { msg, type }
  setTimeout(() => { toast.value = null }, 3000)
}

const ETAT_LABEL = { disponible: 'Disponible', loue: 'Loué', en_location: 'En location', en_maintenance: 'Maintenance', hors_service: 'Hors service' }
const ETAT_CLS   = { disponible: 'bg-blue-100 text-blue-700', loue: 'bg-blue-100 text-blue-700', en_location: 'bg-blue-100 text-blue-700', en_maintenance: 'bg-amber-100 text-amber-700', hors_service: 'bg-red-100 text-red-700' }

const STATUS_ORDER = ['en_attente', 'devis_realise', 'devis_confirme', 'terminee']
const statusIdx = computed(() => STATUS_ORDER.indexOf(props.reservation?.status ?? ''))

const validationSteps = computed(() =>
  [
    validatedBy.value.devis_realise_par  && { label: 'Devis envoyé par',  value: validatedBy.value.devis_realise_par },
    validatedBy.value.devis_confirme_par && { label: 'Confirmé par',      value: validatedBy.value.devis_confirme_par },
    validatedBy.value.terminee_par       && { label: 'Terminé par',       value: validatedBy.value.terminee_par },
  ].filter(Boolean)
)

// ── Navigation retour ─────────────────────────────────────────────────────────
const showBackWarning         = ref(false)
const showConfirmedBackWarning = ref(false)

function handleBack() {
  if (step.value === 'article_preview') { step.value = 'article_select'; return }
  if (step.value === 'article_select')  { postArticleSelectProduit.value = null; step.value = 'detail'; return }
  if (step.value === 'setup_article') {
    if (setupFromDetail.value) { setupFromDetail.value = false; step.value = 'detail'; return }
    step.value = 'setup_list'; return
  }
  if (step.value === 'setup_list') { showBackWarning.value = true; return }
}

function confirmBack() {
  showBackWarning.value = false
  gammesByProduit.value = {}
  setupState.value      = {}
  selectedExtraIds.value = []
  step.value = 'article_select'
}

async function confirmStepBack() {
  showConfirmedBackWarning.value = false
  loading.value = 'step_back'
  try {
    await store.updateStatus(props.reservation.id, 'devis_realise')
    await patchReservation(props.reservation.id, { devis_confirme_par: null }).catch(() => {})
    validatedBy.value = { ...validatedBy.value, devis_confirme_par: null }
    showToast('Réservation revenue au statut "Devis réalisé"', 'info')
  } catch (err) {
    showToast(err?.response?.data?.errors?.[0]?.message ?? err?.message ?? 'Erreur', 'error')
  } finally {
    loading.value = null
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="reservation" class="modal modal-open">
      <div class="modal-box w-11/12 max-w-5xl p-0 overflow-hidden flex flex-col" style="max-height: 92vh;">

        <!-- ── Warning retour config devis ────────────────────────────── -->
        <div v-if="showBackWarning" class="absolute inset-0 z-40 flex items-center justify-center bg-base-100/80 backdrop-blur-sm rounded-2xl">
          <div class="bg-base-100 border border-base-300 rounded-2xl shadow-xl p-6 mx-6 text-center space-y-4">
            <p class="text-2xl">🤔</p>
            <p class="font-bold text-base">T'es sûr cousin ?</p>
            <p class="text-sm text-base-content/60">La configuration du devis sera perdue si tu reviens en arrière.</p>
            <div class="flex gap-3 justify-center pt-1">
              <button class="btn btn-sm btn-ghost" @click="showBackWarning = false">Rester</button>
              <button class="btn btn-sm btn-error btn-outline" @click="confirmBack">Revenir quand même</button>
            </div>
          </div>
        </div>

        <!-- ── Warning retour step confirmée ───────────────────────────── -->
        <div v-if="showConfirmedBackWarning" class="absolute inset-0 z-40 flex items-center justify-center bg-base-100/80 backdrop-blur-sm rounded-2xl">
          <div class="bg-base-100 border border-base-300 rounded-2xl shadow-xl p-6 mx-6 text-center space-y-4">
            <p class="text-2xl">⚠️</p>
            <p class="font-bold text-base">Revenir à "Devis envoyé" ?</p>
            <p class="text-sm text-base-content/60">Le devis signé sera conservé. Cette action est réversible.</p>
            <div class="flex gap-3 justify-center pt-1">
              <button class="btn btn-sm btn-ghost" @click="showConfirmedBackWarning = false">Annuler</button>
              <button class="btn btn-sm btn-warning btn-outline" :disabled="loading === 'step_back'" @click="confirmStepBack">
                <span v-if="loading !== 'step_back'">Confirmer</span>
                <span v-else class="loading loading-spinner loading-xs"></span>
              </button>
            </div>
          </div>
        </div>

        <!-- ── Bouton fermer ─────────────────────────────────────────────── -->
        <button
          class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 z-30"
          @click="step === 'detail' ? $emit('close') : handleBack()"
        >{{ step === 'detail' ? '✕' : '←' }}</button>

        <!-- ── Stepper sticky ────────────────────────────────────────────── -->
        <div class="flex-shrink-0 bg-base-100 border-b border-base-200 px-6 pt-6">
          <!-- Titre réservation -->
          <div v-if="step === 'detail'" class="flex items-center gap-2 pb-[30px]">
            <span class="text-lg font-bold text-base-content/90 font-mono">Réservation n°{{ reservation.id }}</span>
            <span class="text-base-content/25 text-lg font-light">—</span>
            <span class="text-base font-semibold text-base-content/55 truncate">{{ client?.first_name }} {{ client?.last_name }}</span>
          </div>
          <div class="flex items-start pt-[15px] pb-[30px]">

            <!-- Étape 1 -->
            <div class="flex flex-col items-center w-14 flex-shrink-0">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                :class="statusIdx === 0 ? 'bg-primary text-primary-content ring-2 ring-primary ring-offset-2'
                  : statusIdx > 0 ? 'bg-primary text-primary-content'
                  : 'bg-base-200 text-base-content/30'">
                <svg v-if="statusIdx > 0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                  <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                </svg>
                <span v-else>1</span>
              </div>
              <span class="text-[10px] font-medium text-center leading-tight mt-1 w-14"
                :class="statusIdx === 0 ? 'text-primary font-semibold' : statusIdx > 0 ? 'text-primary/60' : 'text-base-content/30'">
                En attente
              </span>
            </div>

            <!-- Connecteur 1→2 : En préparation -->
            <div class="flex-1 flex flex-col items-center pt-3.5 mx-1">
              <div class="w-full h-px" :class="statusIdx > 0 ? 'bg-primary' : 'bg-base-300'"/>
              <span class="text-[9px] mt-1 px-1.5 py-0.5 rounded-full border whitespace-nowrap font-medium transition-all"
                :class="statusIdx === 0
                  ? 'bg-primary/10 border-primary/40 text-primary/90'
                  : statusIdx > 0 ? 'bg-base-200 border-base-300 text-base-content/40'
                  : 'bg-base-200 border-base-300 text-base-content/20'">
                En préparation
              </span>
            </div>

            <!-- Étape 2 -->
            <div class="flex flex-col items-center w-16 flex-shrink-0">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                :class="statusIdx === 1 ? 'bg-primary text-primary-content ring-2 ring-primary ring-offset-2'
                  : statusIdx > 1 ? 'bg-primary text-primary-content'
                  : 'bg-base-200 text-base-content/30'">
                <svg v-if="statusIdx > 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                  <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                </svg>
                <span v-else>2</span>
              </div>
              <span class="text-[10px] font-medium text-center leading-tight mt-1 w-16"
                :class="statusIdx === 1 ? 'text-primary font-semibold' : statusIdx > 1 ? 'text-primary/60' : 'text-base-content/30'">
                Devis envoyé
              </span>
              <span v-if="validatedBy.devis_realise_par" class="text-[9px] text-base-content/35 mt-0.5 text-center leading-tight w-16 truncate">
                {{ validatedBy.devis_realise_par }}
              </span>
            </div>

            <!-- Connecteur 2→3 : En attente de signature -->
            <div class="flex-1 flex flex-col items-center pt-3.5 mx-1">
              <div class="w-full h-px" :class="statusIdx > 1 ? 'bg-primary' : 'bg-base-300'"/>
              <span class="text-[9px] mt-1 px-1.5 py-0.5 rounded-full border whitespace-nowrap font-medium transition-all"
                :class="statusIdx === 1
                  ? 'bg-primary/10 border-primary/40 text-primary/90'
                  : statusIdx > 1 ? 'bg-base-200 border-base-300 text-base-content/40'
                  : 'bg-base-200 border-base-300 text-base-content/20'">
                Signature
              </span>
            </div>

            <!-- Étape 3 -->
            <div class="flex flex-col items-center w-14 flex-shrink-0">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                :class="statusIdx === 2 ? 'bg-primary text-primary-content ring-2 ring-primary ring-offset-2'
                  : statusIdx > 2 ? 'bg-primary text-primary-content'
                  : 'bg-base-200 text-base-content/30'">
                <svg v-if="statusIdx > 2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                  <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                </svg>
                <span v-else>3</span>
              </div>
              <span class="text-[10px] font-medium text-center leading-tight mt-1 w-14"
                :class="statusIdx === 2 ? 'text-primary font-semibold' : statusIdx > 2 ? 'text-primary/60' : 'text-base-content/30'">
                Devis signé
              </span>
              <span v-if="validatedBy.devis_confirme_par" class="text-[9px] text-base-content/35 mt-0.5 text-center leading-tight w-14 truncate">
                {{ validatedBy.devis_confirme_par }}
              </span>
            </div>

            <!-- Connecteur 3→4 : En attente de la fiesta -->
            <div class="flex-1 flex flex-col items-center pt-3.5 mx-1">
              <div class="w-full h-px" :class="statusIdx > 2 ? 'bg-primary' : 'bg-base-300'"/>
              <span class="text-[9px] mt-1 px-1.5 py-0.5 rounded-full border whitespace-nowrap font-medium transition-all"
                :class="statusIdx === 2
                  ? 'bg-primary/10 border-primary/40 text-primary/90'
                  : statusIdx > 2 ? 'bg-base-200 border-base-300 text-base-content/40'
                  : 'bg-base-200 border-base-300 text-base-content/20'">
                Att. de la fiesta
              </span>
            </div>

            <!-- Étape 4 -->
            <div class="flex flex-col items-center w-12 flex-shrink-0">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                :class="statusIdx === 3 ? 'bg-primary text-primary-content ring-2 ring-primary ring-offset-2'
                  : statusIdx > 3 ? 'bg-primary text-primary-content'
                  : 'bg-base-200 text-base-content/30'">
                <svg v-if="statusIdx > 3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                  <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                </svg>
                <span v-else>4</span>
              </div>
              <span class="text-[10px] font-medium text-center leading-tight mt-1 w-12"
                :class="statusIdx === 3 ? 'text-primary font-semibold' : statusIdx > 3 ? 'text-primary/60' : 'text-base-content/30'">
                Terminé
              </span>
              <span v-if="validatedBy.terminee_par" class="text-[9px] text-base-content/35 mt-0.5 text-center leading-tight w-12 truncate">
                {{ validatedBy.terminee_par }}
              </span>
            </div>

          </div>
        </div>

        <!-- ── Corps scrollable ──────────────────────────────────────────── -->
        <div class="flex-1 overflow-y-auto px-6 pt-6 pb-4">

          <!-- ── Détail ──────────────────────────────────────────────────── -->
          <template v-if="step === 'detail'">
          <div class="space-y-4">

            <!-- ── Client + Dates ─────────────────────────────────────── -->
            <div class="grid grid-cols-2 gap-4 items-start">
            <!-- ── Client ───────────────────────────────────────────────── -->
            <div v-if="client" class="rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
              <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</span>
              </div>
              <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  :class="client.typeClient === 'entreprise' ? 'bg-blue-100 text-blue-700' : 'bg-blue-100 text-blue-700'">
                  {{ clientInitials }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-semibold text-gray-900 text-sm leading-tight">{{ client.first_name }} {{ client.last_name }}</p>
                  <p v-if="client.company_name" class="text-xs text-gray-400 truncate">{{ client.company_name }}</p>
                  <p v-else class="text-xs text-gray-400 capitalize">{{ client.typeClient }}</p>
                </div>
                <button class="flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:text-blue-700 transition-colors shrink-0"
                  @click="$emit('close'); router.push({ path: '/clients', query: { id: client.id, fromReservation: reservation.id } })">
                  Ouvrir la fiche
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                    <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72ZM3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z"/>
                  </svg>
                </button>
              </div>
              <div class="px-4 py-3 grid grid-cols-2 gap-x-8 gap-y-3">
                <div v-if="client.phone">
                  <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Téléphone</div>
                  <a :href="`tel:${client.phone}`" class="text-sm text-blue-600 hover:underline font-medium">{{ client.phone }}</a>
                </div>
                <div v-if="client.email">
                  <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Email</div>
                  <a :href="`mailto:${client.email}`" class="text-sm text-blue-600 hover:underline truncate block">{{ client.email }}</a>
                </div>
                <div v-if="client.city || client.zip_code">
                  <div class="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Ville</div>
                  <div class="text-gray-700 text-sm">{{ [client.zip_code, client.city].filter(Boolean).join(' ') }}</div>
                </div>
              </div>
            </div>

            <!-- ── Période ───────────────────────────────────────────────── -->
            <div class="rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
              <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Période</span>
              </div>
              <div class="flex items-stretch divide-x divide-blue-100">
                <div class="flex-1 px-4 py-3">
                  <p class="text-[10px] font-semibold text-base-content/40 uppercase mb-0.5">Début</p>
                  <p class="text-sm font-semibold capitalize">{{ fmtDate(reservation.date_start) }}</p>
                  <p v-if="fmtTime(reservation.date_start)" class="text-xs text-blue-500 font-semibold mt-0.5">{{ fmtTime(reservation.date_start) }}</p>
                </div>
                <div class="flex items-center justify-center w-8 shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3 text-base-content/20">
                    <path fill-rule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z" clip-rule="evenodd"/>
                  </svg>
                </div>
                <div class="flex-1 px-4 py-3">
                  <p class="text-[10px] font-semibold text-base-content/40 uppercase mb-0.5">Fin</p>
                  <p class="text-sm font-semibold capitalize">{{ fmtDate(reservation.date_end) }}</p>
                  <p v-if="fmtTime(reservation.date_end)" class="text-xs text-blue-500 font-semibold mt-0.5">{{ fmtTime(reservation.date_end) }}</p>
                </div>
              </div>
            </div>

            </div><!-- end grid client+dates -->

            <!-- ── Produits + Articles ───────────────────────────────────── -->
            <div v-if="produits.length || reservation.status === 'en_attente' || reservation.status === 'devis_realise'" class="rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
              <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Produits réservés</span>
                <button v-if="reservation.status === 'en_attente' || reservation.status === 'devis_realise'"
                  class="btn btn-xs btn-ghost ml-auto gap-1 text-base-content/50"
                  @click="openArticleSelect()">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                    <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                  </svg>
                  Modifier
                </button>
              </div>
              <div class="p-3 space-y-0">
              <div v-if="!produits.length && (reservation.status === 'en_attente' || reservation.status === 'devis_realise')"
                class="flex flex-col items-center gap-2 py-6 text-center">
                <div class="w-10 h-10 rounded-xl bg-base-200 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-5 h-5 text-base-content/30">
                    <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                  </svg>
                </div>
                <p class="text-sm text-base-content/40">Aucun article sélectionné</p>
                <button class="btn btn-sm btn-primary mt-1" @click="openArticleSelect()">
                  Sélectionner les articles
                </button>
              </div>
              <div v-if="articlesError" class="alert alert-warning text-xs py-2 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
                </svg>
                Permission Directus manquante — <strong>reservations_articles → *</strong>
              </div>
              <div class="space-y-2">
                <div v-for="item in produits" :key="item.produits_id?.id"
                  class="rounded-xl border border-base-200 overflow-hidden">
                  <div class="flex items-center gap-3 bg-base-200/60 px-3 py-2.5">
                    <img
                      v-if="item.produits_id?.image || item.produits_id?.images_urls?.[0]"
                      :src="item.produits_id.image ? assetUrl(item.produits_id.image) : item.produits_id.images_urls[0]"
                      class="w-9 h-9 object-cover rounded-lg shrink-0" alt="" />
                    <div v-else class="w-9 h-9 bg-base-300 rounded-lg flex items-center justify-center shrink-0 text-base-content/30 text-xs font-bold">?</div>
                    <div class="flex-1 min-w-0">
                      <p class="font-semibold text-sm truncate">{{ item.produits_id?.name || 'Produit' }}</p>
                      <p class="text-xs text-base-content/40">
                        Qté {{ item.quantity || 1 }}<span v-if="item.unit_price"> · {{ item.unit_price }} €</span>
                      </p>
                    </div>
                    <div class="shrink-0 flex items-center gap-2">
                      <span v-if="productArticleGroups[item.produits_id?.id]?.principal?.length"
                        class="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3 text-success">
                          <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                        </svg>
                      </span>
                      <span v-else class="w-5 h-5 rounded-full bg-warning/20 flex items-center justify-center text-warning text-xs font-bold">!</span>
                      <button v-if="reservation.status === 'en_attente' || reservation.status === 'devis_realise'"
                        class="btn btn-xs"
                        :class="productArticleGroups[item.produits_id?.id]?.principal?.length ? 'btn-ghost text-base-content/50' : 'btn-warning btn-outline'"
                        :disabled="loading === 'load_setup'"
                        @click="openSetupForProduct(item.produits_id?.id)">
                        {{ productArticleGroups[item.produits_id?.id]?.principal?.length ? 'Modifier' : 'Configurer' }}
                      </button>
                    </div>
                  </div>

                  <template>
                    <div v-for="(la, i) in productArticleGroups[item.produits_id?.id]?.principal ?? []"
                      :key="`p-${i}`"
                      class="flex border-t border-blue-100 bg-blue-50/30">
                      <!-- Tree connector -->
                      <div class="w-9 flex-shrink-0 flex flex-col items-center">
                        <div class="w-px flex-1 bg-blue-200/60"></div>
                        <div class="flex items-center w-full">
                          <div class="flex-1 h-px bg-blue-200/60"></div>
                        </div>
                        <div class="flex-1"></div>
                      </div>
                      <!-- Content -->
                      <div class="flex items-center gap-3 py-2.5 pr-3 flex-1 min-w-0">
                        <div class="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-blue-100">
                          <img v-if="item.produits_id?.image || item.produits_id?.images_urls?.[0]"
                            :src="item.produits_id.image ? assetUrl(item.produits_id.image) : item.produits_id.images_urls[0]"
                            class="w-full h-full object-cover" alt="" />
                          <div v-else class="w-full h-full flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-blue-400">
                              <path d="M3.75 2a.75.75 0 0 0-.75.75v10.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75V6.56a.75.75 0 0 0-.22-.53L9.22 2.22A.75.75 0 0 0 8.69 2H3.75Z"/>
                            </svg>
                          </div>
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="font-semibold text-sm text-blue-900">{{ la.article?.name || la.article?.produit_id?.name || la.article?.reference }}</p>
                          <div class="flex gap-1.5 mt-0.5 flex-wrap items-center">
                            <span class="font-mono text-[10px] text-base-content/40">{{ la.article?.reference }}</span>
                            <span v-if="la.article?.entrepot_id?.nom" class="text-xs text-base-content/50">· {{ la.article.entrepot_id.nom }}</span>
                            <span v-if="la.article?.entrepot_id?.nom && la.article?.notes" class="text-xs text-base-content/30">·</span>
                            <span v-if="la.article?.notes" class="text-xs text-base-content/55 truncate">{{ la.article.notes }}</span>
                          </div>
                        </div>
                        <span v-if="la.article?.etat" class="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0" :class="ETAT_CLS[la.article.etat]">
                          {{ ETAT_LABEL[la.article.etat] ?? la.article.etat }}
                        </span>
                      </div>
                    </div>

                    <details v-if="productArticleGroups[item.produits_id?.id]?.materiel?.length"
                      class="group border-t border-amber-100 bg-amber-50/20">
                      <summary class="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-amber-600/70 uppercase tracking-wide cursor-pointer hover:text-amber-700 select-none list-none">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3 transition-transform group-open:rotate-90 shrink-0">
                          <path fill-rule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L9.19 8 6.22 5.03a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
                        </svg>
                        Matériel ({{ productArticleGroups[item.produits_id?.id].materiel.length }})
                      </summary>
                      <div class="divide-y divide-amber-100/60 px-3 pb-2">
                        <div v-for="(la, i) in productArticleGroups[item.produits_id?.id].materiel"
                          :key="`s-${i}`"
                          class="flex items-center gap-2 py-2">
                          <div class="flex-1 min-w-0">
                            <span class="text-xs font-semibold text-base-content/70">{{ la.article?.name || la.article?.reference }}</span>
                            <span class="font-mono text-[10px] text-base-content/30 ml-1.5">{{ la.article?.reference }}</span>
                            <p v-if="la.article?.notes" class="text-xs text-base-content/30 truncate mt-0.5">{{ la.article.notes }}</p>
                          </div>
                          <span class="text-xs text-base-content/30 shrink-0">{{ la.article?.entrepot_id?.nom }}</span>
                          <span v-if="la.article?.etat" class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0" :class="ETAT_CLS[la.article.etat]">
                            {{ ETAT_LABEL[la.article.etat] ?? la.article.etat }}
                          </span>
                        </div>
                      </div>
                    </details>

                    <div v-if="!productArticleGroups[item.produits_id?.id]?.principal?.length"
                      class="flex items-center gap-2 px-3 py-2.5 border-t border-dashed border-base-200">
                      <div class="w-7 h-7 rounded-lg bg-base-200 flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-base-content/20">
                          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                        </svg>
                      </div>
                      <p class="text-xs text-base-content/30 italic">Aucun article affecté</p>
                    </div>
                  </template>
                </div>
              </div>
              </div>
            </div>

            <!-- ── Notes ────────────────────────────────────────────────── -->
            <div v-if="reservation.notes" class="rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
              <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</span>
              </div>
              <p class="text-sm px-4 py-3 text-base-content/70 leading-relaxed">{{ reservation.notes }}</p>
            </div>

            <!-- ── Livraison + Remise ────────────────────────────────────── -->
            <div class="grid grid-cols-2 gap-4 items-start">
            <div class="rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
              <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Livraison & Installation</span>
              </div>
                <!-- Livraison + Installation (liées) -->
                <label class="flex items-center justify-between px-4 py-2.5 cursor-pointer">
                  <div class="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-base-content/30 shrink-0">
                      <path d="M8.5 3.5A1.5 1.5 0 0 1 10 2h1.5A1.5 1.5 0 0 1 13 3.5V5h1a.75.75 0 0 1 .649.373l1.25 2.25a.75.75 0 0 1 .101.374V10a.75.75 0 0 1-.75.75h-.5a2.25 2.25 0 0 1-4.5 0h-2.5a2.25 2.25 0 0 1-4.5 0H2.25A.75.75 0 0 1 1.5 10V3.5A1.5 1.5 0 0 1 3 2h5a.5.5 0 0 1 0 1H3a.5.5 0 0 0-.5.5v6.213a2.251 2.251 0 0 1 3.36.787H9.14a2.252 2.252 0 0 1 3.712-.506V5h-1.5A1.5 1.5 0 0 1 9.5 3.5v-1h-1v1Z"/>
                    </svg>
                    <span class="text-sm font-medium">Livraison & installation</span>
                  </div>
                  <input type="checkbox" class="toggle toggle-xs toggle-primary" :checked="livraison" :disabled="reservation.status === 'devis_confirme'" @change="toggleLivraison($event.target.checked)" />
                </label>
                <div v-if="livraison" class="px-4 py-2.5 border-t border-base-200 flex items-center gap-2">
                  <span class="text-xs text-base-content/60 font-medium">Distance :</span>
                  <input type="number" v-model.number="distanceKm" min="0" max="999" @change="saveDistance"
                    :disabled="reservation.status === 'devis_confirme'"
                    class="w-20 text-sm px-2 py-1 border border-base-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-center font-semibold bg-base-100" />
                  <span class="text-xs text-base-content/60">km</span>
                  <!-- Bouton barème livraison -->
                  <div class="relative group">
                    <button type="button"
                      class="w-5 h-5 rounded-full bg-base-200 hover:bg-base-300 text-base-content/40 hover:text-base-content text-[10px] font-bold flex items-center justify-center transition-colors">
                      ?
                    </button>
                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                      <div class="bg-base-100 border border-base-300 rounded-xl shadow-xl p-3 w-52 text-xs whitespace-nowrap">
                        <p class="font-semibold text-base-content/70 mb-2 text-[11px] uppercase tracking-wide">Barème livraison</p>
                        <table class="w-full">
                          <tbody class="divide-y divide-base-200">
                            <tr v-for="(row, i) in [
                              ['0 – 15 km',    '20 €'],
                              ['15 – 30 km',   '40 €'],
                              ['30 – 50 km',   '65 €'],
                              ['50 – 80 km',   '100 €'],
                              ['80 – 120 km',  '150 €'],
                              ['> 120 km',     '150 € + 1 €/km'],
                            ]" :key="row[0]"
                              :class="distanceKm > 0 && i === livraisonZoneIdx ? 'text-primary' : 'text-base-content/60'">
                              <td class="py-0.5 pr-3">{{ row[0] }}</td>
                              <td class="py-0.5 text-right font-semibold">{{ row[1] }}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <!-- Flèche -->
                      <div class="w-2 h-2 bg-base-100 border-r border-b border-base-300 rotate-45 mx-auto -mt-1"></div>
                    </div>
                  </div>
                  <span class="ml-auto text-sm font-bold text-primary">{{ livraisonMontant }} €</span>
                </div>
                <div v-if="reservation.delivery_address && livraison" class="px-4 py-2.5 border-t border-base-200 bg-base-200/30">
                  <p class="text-[10px] font-semibold text-base-content/40 uppercase mb-0.5">Adresse de livraison</p>
                  <p class="text-sm text-base-content/70">{{ reservation.delivery_address }}</p>
                </div>
                <div v-if="reservation.status === 'en_attente'" class="px-4 py-3 border-t border-base-200">
                  <label class="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" v-model="clientContacte" class="checkbox checkbox-sm checkbox-primary" />
                    <span class="text-sm" :class="clientContacte ? 'text-base-content' : 'text-base-content/60'">
                      Client contacté et accord oral confirmé
                    </span>
                  </label>
                </div>
            </div>

            <!-- ── Remise ──────────────────────────────────────────────────── -->
            <div class="rounded-xl border border-blue-100 bg-base-100 overflow-hidden shadow-sm">
              <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
                <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Remise</span>
                <span class="text-[10px] text-gray-400 font-normal normal-case tracking-normal">(optionnelle)</span>
              </div>
                <div class="flex items-center justify-between px-4 py-2.5">
                  <span class="text-sm font-medium">Remise auto</span>
                  <div class="flex items-center gap-2">
                    <!-- Tooltip barème remise -->
                    <div class="relative group">
                      <button type="button"
                        class="w-5 h-5 rounded-full bg-base-200 hover:bg-base-300 text-base-content/40 hover:text-base-content text-[10px] font-bold flex items-center justify-center transition-colors">
                        ?
                      </button>
                      <div class="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50 pointer-events-none">
                        <div class="bg-base-100 border border-base-300 rounded-xl shadow-xl p-3 w-64 text-xs">
                          <p class="font-semibold text-base-content/70 mb-2 text-[11px] uppercase tracking-wide">Règle de remise</p>
                          <p class="text-base-content/60 mb-2">Frais de livraison & installation offerts, plafonnés à <span class="font-semibold text-base-content/80">50 €</span>.</p>
                          <div v-if="livraison" class="mt-2 pt-2 border-t border-base-200 flex items-center justify-between">
                            <span class="text-base-content/50">Remise appliquée</span>
                            <span class="font-semibold text-primary">− {{ Math.min(livraisonMontant, 50).toFixed(2) }} €</span>
                          </div>
                          <p v-else class="text-base-content/40 italic mt-1">Activer la livraison d'abord</p>
                        </div>
                        <div class="w-2 h-2 bg-base-100 border-r border-b border-base-300 rotate-45 ml-auto mr-2 -mt-1"></div>
                      </div>
                    </div>
                    <input type="checkbox" class="toggle toggle-xs toggle-primary" :checked="remise" :disabled="reservation.status === 'devis_confirme'" @change="toggleRemise($event.target.checked)" />
                  </div>
                </div>
                <div v-if="remise" class="px-4 py-2.5 border-t border-base-200 flex items-center gap-2">
                  <span class="text-sm text-base-content/60 italic">{{ remiseDescription }}</span>
                  <span class="ml-auto text-sm font-bold text-red-500">− {{ remiseMontantTTC.toFixed(2) }} €</span>
                </div>
            </div>
            </div><!-- end grid livraison+remise -->

            <!-- ── Consommables ──────────────────────────────────────────── -->
            <div v-if="reservationConso.length" class="rounded-xl border border-blue-100 overflow-hidden shadow-sm">
              <div class="px-4 py-2.5 border-b border-blue-100 bg-blue-50/50 flex items-center gap-2">
                <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                <span class="text-xs font-semibold text-blue-600/70 uppercase tracking-wide">Consommables</span>
              </div>
              <div class="divide-y divide-blue-50">
                <div v-for="row in reservationConso" :key="row.id"
                  class="flex items-center gap-3 px-3 py-2.5 bg-blue-50/30">
                  <div class="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-blue-500">
                      <path fill-rule="evenodd" d="M8 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.75v4.25a.75.75 0 0 1-1.5 0V8.5H3a.75.75 0 0 1 0-1.5h4.25V2.75A.75.75 0 0 1 8 2Z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">{{ row.consommable_id?.nom ?? '—' }}</p>
                    <p class="text-xs text-base-content/40">{{ row.consommable_id?.unite }}</p>
                  </div>
                  <span class="text-xs font-semibold text-base-content/50 shrink-0">× {{ row.quantite }}</span>
                  <span v-if="row.consommable_id?.prix_unitaire != null" class="text-xs font-bold text-blue-600 shrink-0">
                    {{ (row.consommable_id.prix_unitaire * row.quantite).toFixed(2) }} €
                  </span>
                </div>
              </div>
            </div>

            <!-- ── Devis (2 colonnes) ────────────────────────────────────── -->
            <div v-if="reservation.status !== 'annulee' && reservation.status !== 'terminee' || devisGenereUrl" class="rounded-xl border border-base-200 overflow-hidden shadow-sm">
              <div class="px-4 py-2.5 border-b border-base-200 bg-blue-50 flex items-center gap-2">
                <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documents</span>
              </div>
              <div class="grid grid-cols-2 divide-x divide-base-200">
                <!-- Gauche : Devis à signer -->
                <div class="flex flex-col">
                  <div class="px-3 py-2 bg-base-50 border-b border-base-200">
                    <p class="text-xs font-semibold text-base-content/60">Devis à signer</p>
                  </div>
                  <a v-if="devisGenereUrl" :href="devisGenereUrl" target="_blank" rel="noopener"
                    class="flex items-center gap-2 px-3 py-3 hover:bg-base-200/40 transition-colors group border-b border-base-200">
                    <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-primary">
                        <path d="M2 3a1 1 0 0 1 1-1h7.586a1 1 0 0 1 .707.293l2.414 2.414A1 1 0 0 1 14 5.414V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Z"/>
                      </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-primary group-hover:underline truncate">Voir le devis</p>
                      <p class="text-xs text-base-content/40">PDF</p>
                    </div>
                  </a>
                  <div v-else class="flex items-center justify-center px-3 py-5 text-xs text-base-content/30">Non généré</div>
                  <div v-if="reservation.status === 'en_attente' || reservation.status === 'devis_realise'" class="px-3 py-2.5">
                    <button class="btn btn-xs gap-1 w-full" :class="devisGenereUrl ? 'btn-ghost' : 'btn-primary'"
                      :disabled="loading === 'generate_devis'" @click="generateDevis">
                      <span v-if="loading !== 'generate_devis'">{{ devisGenereUrl ? 'Regénérer' : 'Générer le devis' }}</span>
                      <span v-else class="loading loading-spinner loading-xs"></span>
                    </button>
                  </div>
                </div>
                <!-- Droite : Devis signé -->
                <div class="flex flex-col">
                  <div class="px-3 py-2 bg-base-50 border-b border-base-200 flex items-center gap-1.5">
                    <p class="text-xs font-semibold text-base-content/60">Devis signé</p>
                    <span v-if="reservation.status === 'devis_realise'"
                      class="text-[9px] font-bold text-orange-500 uppercase">{{ signedDevisUrl ? '' : 'Requis' }}</span>
                    <svg v-if="signedDevisUrl" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3 text-success">
                      <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                  <a v-if="signedDevisUrl" :href="signedDevisUrl" target="_blank" rel="noopener"
                    class="flex items-center gap-2 px-3 py-3 hover:bg-base-200/40 transition-colors group border-b border-base-200">
                    <div class="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-success">
                        <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                      </svg>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold text-success group-hover:underline truncate">Voir signé</p>
                      <p class="text-xs text-base-content/40">PDF signé</p>
                    </div>
                  </a>
                  <div v-else class="flex items-center justify-center px-3 py-5 text-xs text-base-content/30">En attente</div>
                  <div v-if="reservation.status === 'devis_realise' || reservation.status === 'devis_confirme'" class="px-3 py-2.5">
                    <input ref="devisSigneInput" type="file" accept=".pdf,.jpg,.jpeg,.png" class="hidden" @change="onDevisSigneChange" />
                    <button class="btn btn-xs gap-1 w-full" :class="signedDevisUrl ? 'btn-ghost' : 'btn-outline btn-warning'"
                      @click="devisSigneInput.click()">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                        <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                      </svg>
                      {{ signedDevisUrl ? 'Remplacer' : 'Ajouter' }}
                    </button>
                    <div v-if="devisSigneFile" class="flex items-center gap-1.5 mt-1.5">
                      <span class="text-xs text-success truncate flex-1">{{ devisSigneFile.name }}</span>
                      <button class="btn btn-xs btn-success" :disabled="loading === 'upload_devis_signe'" @click="uploadDevisSigne">
                        <span v-if="loading !== 'upload_devis_signe'">OK</span>
                        <span v-else class="loading loading-spinner loading-xs"></span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Facture ────────────────────────────────────────────────── -->
            <div v-if="reservation.status === 'devis_confirme' || (factureUrl && reservation.status === 'terminee')" class="rounded-xl border border-base-200 overflow-hidden shadow-sm">
              <div class="px-4 py-2.5 border-b border-base-200 bg-blue-50 flex items-center gap-2">
                <div class="w-0.5 h-3.5 bg-blue-400 rounded-full shrink-0"></div>
                <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Facture</span>
              </div>
              <a v-if="factureUrl" :href="factureUrl" target="_blank" rel="noopener"
                class="flex items-center gap-4 px-4 py-4 hover:bg-base-200/40 transition-colors group border-b border-base-200">
                <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-5 h-5 text-primary">
                    <path d="M2 3a1 1 0 0 1 1-1h7.586a1 1 0 0 1 .707.293l2.414 2.414A1 1 0 0 1 14 5.414V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Z"/>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-primary group-hover:underline">Voir la facture</p>
                  <p class="text-xs text-base-content/40">PDF</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-base-content/20 shrink-0">
                  <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72ZM3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z"/>
                </svg>
              </a>
              <div v-else class="flex items-center justify-center px-4 py-5 text-sm text-base-content/30">Aucune facture</div>
              <div v-if="reservation.status === 'devis_confirme'" class="flex items-center gap-2 flex-wrap px-4 py-3.5 bg-base-50">
                <input ref="factureInput" type="file" accept=".pdf,.jpg,.jpeg,.png" class="hidden" @change="onFactureChange" />
                <button class="btn btn-sm gap-1.5" :class="factureUrl ? 'btn-ghost' : 'btn-outline'"
                  @click="factureInput.click()">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                    <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                  </svg>
                  {{ factureUrl ? 'Remplacer la facture' : 'Joindre la facture' }}
                </button>
                <span v-if="factureFile" class="text-sm text-success truncate max-w-[140px]">{{ factureFile.name }}</span>
                <button v-if="factureFile" class="btn btn-sm btn-success ml-auto" :disabled="loading === 'upload_facture'" @click="uploadFacture">
                  <span v-if="loading !== 'upload_facture'">Enregistrer</span>
                  <span v-else class="loading loading-spinner loading-xs"></span>
                </button>
              </div>
            </div>

          </div><!-- /space-y-4 -->

            <!-- ── Actions ──────────────────────────────────────────────── -->
            <div class="pt-4 mt-4 border-t border-base-200">
              <div class="flex gap-2">
                <template v-for="a in actions" :key="a.key">
                  <button class="btn btn-sm flex-1" :class="a.cls"
                    :disabled="loading !== null || ((a.key === 'send' || a.key === 'confirm') && confirmBlocked)"
                    @click="act(a)">
                    <span v-if="loading !== a.key">{{ a.label }}</span>
                    <span v-else class="loading loading-spinner loading-xs"></span>
                  </button>
                </template>
              </div>
              <p v-if="confirmBlocked" class="text-xs text-base-content/40 text-center mt-1.5">
                {{ confirmBlockedReason }} pour continuer
              </p>
            </div>
          </template>

          <!-- ── Sélection articles ────────────────────────────────────── -->
          <template v-else-if="step === 'article_select'">
            <div class="pr-8 mb-4">
              <h3 class="font-bold text-xl">Sélectionner les articles</h3>
              <p class="text-sm text-base-content/60 mt-1">Choisissez l'unité physique pour chaque produit</p>
            </div>

            <div v-if="articleLoading" class="flex justify-center py-8">
              <span class="loading loading-spinner loading-md"></span>
            </div>
            <div v-else-if="!produits.length" class="text-sm text-base-content/50 text-center py-8">
              Aucun produit lié à cette réservation
            </div>
            <div v-else class="space-y-3 mb-4">
              <div v-for="item in produits" :key="item.produits_id?.id"
                class="border rounded-xl overflow-hidden transition-colors"
                :class="selectedArticleIds[item.produits_id?.id] ? 'border-primary/30' : 'border-base-300'">
                <div class="px-4 py-2.5 border-b flex items-center gap-2"
                  :class="selectedArticleIds[item.produits_id?.id] ? 'bg-primary/5 border-primary/20' : 'bg-base-200/60 border-base-300'">
                  <p class="font-semibold text-sm flex-1">{{ item.produits_id?.name }}</p>
                  <span v-if="!selectedArticleIds[item.produits_id?.id]" class="text-[10px] text-error font-semibold">Requis</span>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-primary shrink-0">
                    <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                  </svg>
                </div>
                <div v-if="articlesByProduit[item.produits_id?.id]?.length">
                  <!-- Disponibles -->
                  <div class="divide-y divide-base-100">
                    <div v-for="art in articlesByProduitGrouped[item.produits_id?.id]?.dispos" :key="art.id"
                      class="flex items-center gap-3 px-4 py-3 hover:bg-base-50 transition-colors">
                      <label class="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                        <input type="radio" class="radio radio-sm radio-primary shrink-0"
                          :name="`produit-${item.produits_id?.id}`" :value="art.id"
                          v-model="selectedArticleIds[item.produits_id?.id]" />
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-mono font-semibold text-sm">{{ art.reference }}</span>
                            <span class="text-base-content/30">—</span>
                            <span class="text-sm text-base-content/60 truncate">{{ art.produit_id?.name }}</span>
                          </div>
                          <p class="text-xs text-base-content/40 mt-0.5">{{ art.entrepot_id?.nom }}</p>
                        </div>
                      </label>
                      <span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0" :class="ETAT_CLS[art.etat]">
                        {{ ETAT_LABEL[art.etat] ?? art.etat }}
                      </span>
                      <button type="button" class="btn btn-xs btn-ghost btn-circle shrink-0 text-base-content/30 hover:text-base-content"
                        title="Voir les détails" @click.stop="openArticlePreview(art)">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                          <path fill-rule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clip-rule="evenodd"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <!-- Indisponibles (max 3, scrollable) -->
                  <div v-if="articlesByProduitGrouped[item.produits_id?.id]?.autres?.length"
                    class="border-t border-base-200 bg-base-50/50">
                    <div class="max-h-[168px] overflow-y-auto divide-y divide-base-100">
                      <div v-for="art in articlesByProduitGrouped[item.produits_id?.id]?.autres.slice(0, 3)" :key="art.id"
                        class="flex items-center gap-3 px-4 py-3 opacity-60 hover:opacity-80 transition-opacity">
                        <label class="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                          <input type="radio" class="radio radio-sm radio-primary shrink-0"
                            :name="`produit-${item.produits_id?.id}`" :value="art.id"
                            v-model="selectedArticleIds[item.produits_id?.id]" />
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="font-mono font-semibold text-sm">{{ art.reference }}</span>
                              <span class="text-base-content/30">—</span>
                              <span class="text-sm text-base-content/60 truncate">{{ art.produit_id?.name }}</span>
                            </div>
                            <p class="text-xs text-base-content/40 mt-0.5">{{ art.entrepot_id?.nom }}</p>
                          </div>
                        </label>
                        <span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0" :class="ETAT_CLS[art.etat]">
                          {{ ETAT_LABEL[art.etat] ?? art.etat }}
                        </span>
                      </div>
                    </div>
                    <p v-if="articlesByProduitGrouped[item.produits_id?.id]?.autres.length > 3"
                      class="text-xs text-base-content/30 italic px-4 py-1.5 border-t border-base-200">
                      +{{ articlesByProduitGrouped[item.produits_id?.id].autres.length - 3 }} autres indisponibles
                    </p>
                  </div>
                </div>
                <p v-else class="text-xs text-base-content/40 italic px-4 py-3">Aucun article pour ce produit</p>
              </div>
            </div>

            <div class="flex gap-2 justify-end pt-4 border-t border-base-200">
              <button class="btn btn-sm btn-ghost" @click="step = 'detail'">Retour</button>
              <button class="btn btn-sm btn-primary" :disabled="loading === 'confirm_articles'" @click="confirmArticles">
                <span v-if="loading !== 'confirm_articles'">Suivant →</span>
                <span v-else class="loading loading-spinner loading-xs"></span>
              </button>
            </div>
          </template>

          <!-- ── Liste de setup ─────────────────────────────────────────── -->
          <template v-else-if="step === 'setup_list'">
            <div class="pr-8 mb-4">
              <h3 class="font-bold text-xl">Configuration du devis</h3>
              <p class="text-sm text-base-content/60 mt-1">Configurez chaque article puis validez</p>
            </div>

            <div v-if="loading === 'load_setup'" class="flex justify-center py-8">
              <span class="loading loading-spinner loading-md"></span>
            </div>
            <div v-else class="space-y-2 mb-4">

              <!-- Articles principaux -->
              <div v-for="item in setupListItems" :key="item.produitId"
                class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors"
                :class="item.configured
                  ? 'border-success/30 bg-success/5 hover:bg-success/10'
                  : 'border-base-300 hover:bg-base-200'"
                @click="goToSetupArticle(item.produitId)">
                <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                  :class="item.configured ? 'bg-success text-success-content' : 'bg-base-200 text-base-content/30'">
                  <svg v-if="item.configured" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                    <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                  </svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                    <path d="M7.25 10.25a.75.75 0 0 0 1.5 0V8h2a.75.75 0 0 0 0-1.5h-2V4.25a.75.75 0 0 0-1.5 0V6.5h-2a.75.75 0 0 0 0 1.5h2v2.25Z"/>
                    <path fill-rule="evenodd" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM2.5 8a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z" clip-rule="evenodd"/>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-mono font-semibold text-sm">{{ item.articleRef }}</span>
                    <span class="text-base-content/30 text-xs">—</span>
                    <span class="text-sm text-base-content/70 truncate">{{ item.produitNom }}</span>
                  </div>
                  <div class="text-xs text-base-content/40 mt-0.5">
                    <template v-if="item.consoCount || item.matCount">
                      <span v-if="item.consoCount" class="text-blue-500">{{ item.consoCount }} conso.</span>
                      <span v-if="item.consoCount && item.matCount" class="mx-1">·</span>
                      <span v-if="item.matCount" class="text-amber-500">{{ item.matCount }} matériel</span>
                    </template>
                    <span v-else>Aucune gamme</span>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span v-if="item.configured" class="text-xs text-success font-medium">Configuré</span>
                  <span v-else class="text-xs text-base-content/40">À configurer</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-base-content/30">
                    <path fill-rule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L9.19 8 6.22 5.03a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd"/>
                  </svg>
                </div>
              </div>

              <!-- Cadeaux (articles supplémentaires) -->
              <div v-for="art in selectedExtraArticles" :key="`extra-${art.id}`"
                class="flex items-center gap-3 p-3 border border-orange-200 bg-orange-50/40 rounded-xl">
                <div class="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-orange-500">
                    <path d="M4.5 3A1.5 1.5 0 0 0 3 4.5v.75h4.5V3H4.5ZM8.5 3v2.25H13V4.5A1.5 1.5 0 0 0 11.5 3H8.5ZM13 6.25H3v5.25A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5V6.25Z"/>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-mono font-semibold text-sm">{{ art.reference }}</span>
                    <span class="text-base-content/30 text-xs">—</span>
                    <span class="text-sm text-base-content/60 truncate">{{ art.produit_id?.name }}</span>
                  </div>
                  <p class="text-xs text-orange-400 font-medium mt-0.5">Supplémentaire</p>
                </div>
                <button type="button" class="btn btn-xs btn-ghost btn-circle text-base-content/30 hover:text-error shrink-0"
                  @click="selectedExtraIds = selectedExtraIds.filter(id => id !== art.id)">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                    <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"/>
                  </svg>
                </button>
              </div>

              <!-- Bouton ajouter cadeau -->
              <div class="border border-dashed border-base-300 rounded-xl overflow-hidden">
                <button v-if="!showCadeauAdd" type="button"
                  class="w-full flex items-center gap-3 px-4 py-3 hover:bg-base-100 transition-colors text-left"
                  @click="showCadeauAdd = true; extraSearch = ''">
                  <div class="w-8 h-8 rounded-full bg-base-200 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-base-content/40">
                      <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                    </svg>
                  </div>
                  <span class="text-sm text-base-content/40">Ajouter un cadeau</span>
                </button>
                <div v-else class="p-3">
                  <div class="flex items-center gap-2 mb-2">
                    <input v-model="extraSearch" type="text" placeholder="Rechercher…"
                      class="input input-bordered input-xs flex-1" autofocus />
                    <button type="button" class="btn btn-xs btn-ghost text-base-content/40" @click="showCadeauAdd = false; extraSearch = ''">✕</button>
                  </div>
                  <div v-if="!filteredArticlesLibres.length" class="text-xs text-base-content/40 italic text-center py-2">
                    {{ extraSearch ? 'Aucun résultat' : 'Aucun article disponible' }}
                  </div>
                  <div v-else class="space-y-0.5 max-h-40 overflow-y-auto">
                    <label v-for="art in filteredArticlesLibres" :key="art.id"
                      class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-orange-50 cursor-pointer">
                      <input type="checkbox" class="checkbox checkbox-sm shrink-0" style="accent-color: #f97316"
                        :value="art.id" v-model="selectedExtraIds" />
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="font-mono font-semibold text-sm">{{ art.reference }}</span>
                          <span class="text-base-content/30 text-xs">—</span>
                          <span class="text-sm text-base-content/60">{{ art.produit_id?.name }}</span>
                        </div>
                        <p class="text-xs text-base-content/40">{{ art.entrepot_id?.nom }}</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex gap-2 justify-end pt-4 border-t border-base-200">
              <button class="btn btn-sm btn-ghost" @click="step = 'article_select'">← Retour</button>
              <button class="btn btn-sm btn-primary" :disabled="loading === 'confirm_conso'" @click="confirmConsommables">
                <span v-if="loading !== 'confirm_conso'">Valider le devis</span>
                <span v-else class="loading loading-spinner loading-xs"></span>
              </button>
            </div>
          </template>

          <!-- ── Setup article ───────────────────────────────────────────── -->
          <template v-else-if="step === 'setup_article' && currentSetupProduitId">
            <div class="pr-8 mb-5">
              <p class="text-xs font-semibold text-base-content/40 uppercase mb-1">Configuration</p>
              <h3 class="font-bold text-xl font-mono">{{ currentArticleInfo.ref }} — {{ currentArticleInfo.nom }}</h3>
            </div>

            <div class="space-y-3 mb-4">

              <!-- ① Gamme + matériel d'exploitation ──────────────────────── -->
              <div class="border border-blue-200 rounded-xl overflow-hidden">
                <div class="bg-blue-50 px-4 py-2.5 border-b border-blue-200 flex items-center gap-2">
                  <div class="w-5 h-5 rounded bg-blue-600 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="white" class="w-3 h-3">
                      <path fill-rule="evenodd" d="M6.955 1.45A.5.5 0 0 1 7.452 1h1.096a.5.5 0 0 1 .497.45l.11 1.09a5.021 5.021 0 0 1 1.19.482l.875-.611a.5.5 0 0 1 .637.065l.774.775a.5.5 0 0 1 .065.636l-.611.875c.2.37.357.763.482 1.19l1.09.11a.5.5 0 0 1 .45.497v1.096a.5.5 0 0 1-.45.497l-1.09.11a5.02 5.02 0 0 1-.482 1.19l.611.875a.5.5 0 0 1-.065.637l-.775.774a.5.5 0 0 1-.636.065l-.875-.611a5.02 5.02 0 0 1-1.19.482l-.11 1.09a.5.5 0 0 1-.497.45H7.452a.5.5 0 0 1-.497-.45l-.11-1.09a5.021 5.021 0 0 1-1.19-.482l-.875.611a.5.5 0 0 1-.637-.065l-.774-.775a.5.5 0 0 1-.065-.636l.611-.875a5.021 5.021 0 0 1-.482-1.19l-1.09-.11A.5.5 0 0 1 1 8.548V7.452a.5.5 0 0 1 .45-.497l1.09-.11a5.02 5.02 0 0 1 .482-1.19l-.611-.875a.5.5 0 0 1 .065-.637l.775-.774a.5.5 0 0 1 .636-.065l.875.611a5.021 5.021 0 0 1 1.19-.482l.11-1.09ZM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                  <p class="font-semibold text-sm text-blue-900">Gamme</p>
                </div>
                <div v-if="!currentGammes.length"
                  class="text-sm text-base-content/40 italic text-center py-6">
                  Aucune gamme associée à ce produit
                </div>
                <div v-else>
                  <template v-for="group in currentGammes" :key="group.gamme.id">
                    <div class="px-4 py-1.5 bg-blue-50/60 border-b border-blue-100">
                      <span class="text-[10px] font-bold text-blue-400 uppercase tracking-wider">{{ group.gamme.nom }}</span>
                    </div>
                    <div v-if="!group.materielArts.length && !pendingGammeArticles.some(p => p.gamme_id === group.gamme.id)"
                      class="px-4 py-3 text-xs text-base-content/30 italic border-b border-base-100">
                      Aucun matériel lié
                    </div>
                    <div v-else class="divide-y divide-base-100">
                      <label v-for="art in group.materielArts" :key="art.id"
                        class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-base-50 transition-colors"
                        :class="(art.etat === 'hors_service' || art.etat === 'en_maintenance') ? 'opacity-50' : ''">
                        <input type="checkbox" class="checkbox checkbox-sm checkbox-warning shrink-0"
                          :checked="setupState[currentSetupProduitId]?.materielIds?.includes(art.id)"
                          :disabled="art.etat === 'hors_service' || art.etat === 'en_maintenance'"
                          @change="toggleMaterielForSetup(art.id, $event.target.checked)" />
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-mono font-semibold text-sm">{{ art.reference }}</span>
                            <span v-if="art.name" class="text-base-content/30 text-xs">—</span>
                            <span v-if="art.name" class="text-sm text-base-content/70">{{ art.name }}</span>
                            <span class="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" :class="ETAT_CLS[art.etat]">{{ ETAT_LABEL[art.etat] ?? art.etat }}</span>
                          </div>
                          <p class="text-xs text-base-content/40 mt-0.5">{{ art.entrepot_id?.nom }}</p>
                        </div>
                      </label>
                    </div>
                  </template>
                </div>
              </div>

              <!-- ② Consommables ────────────────────────────────────────── -->
              <div class="border border-blue-200 rounded-xl overflow-hidden">
                <div class="bg-blue-50 px-4 py-2.5 border-b border-blue-200 flex items-center gap-2">
                  <div class="w-5 h-5 rounded bg-blue-500 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="white" class="w-3 h-3">
                      <path d="M2.5 6a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 13.5 6v1.293a2.5 2.5 0 0 1 0 4.414V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-1.293a2.5 2.5 0 0 1 0-4.414V6Z"/>
                    </svg>
                  </div>
                  <p class="font-semibold text-sm text-blue-900">Consommables</p>
                </div>
                <div v-if="!currentGammes.some(g => g.consoItems.length)"
                  class="text-sm text-base-content/40 italic text-center py-5">
                  Aucun consommable associé
                </div>
                <div v-else class="divide-y divide-blue-50/80">
                  <template v-for="group in currentGammes" :key="group.gamme.id">
                    <div v-for="item in group.consoItems" :key="item.id" class="flex items-center gap-3 px-4 py-3">
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold">{{ item.consommable_id?.nom }}</p>
                        <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span v-if="item.consommable_id?.unite" class="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">{{ item.consommable_id?.unite }}</span>
                          <span v-if="item.consommable_id?.prix_unitaire != null" class="text-xs text-blue-600 font-medium">{{ item.consommable_id?.prix_unitaire }} €/u</span>
                          <span class="text-xs font-medium"
                            :class="(item.consommable_id?.stock ?? 0) <= 0 ? 'text-error' : (item.consommable_id?.stock ?? 0) <= 3 ? 'text-warning' : 'text-base-content/40'">
                            Stock : {{ item.consommable_id?.stock ?? 0 }}
                          </span>
                        </div>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button type="button" class="btn btn-xs btn-ghost btn-circle text-blue-500"
                          @click="setupState[currentSetupProduitId].consoQty[item.consommable_id?.id] = Math.max(0, (setupState[currentSetupProduitId].consoQty[item.consommable_id?.id] ?? 0) - 1)">−</button>
                        <input type="number" min="0" :max="item.consommable_id?.stock ?? 999"
                          :value="setupState[currentSetupProduitId]?.consoQty[item.consommable_id?.id] ?? 0"
                          @change="setupState[currentSetupProduitId].consoQty[item.consommable_id?.id] = Math.max(0, Math.min(item.consommable_id?.stock ?? 999, Number($event.target.value)))"
                          class="input input-bordered input-xs w-14 text-center font-bold" />
                        <button type="button" class="btn btn-xs btn-ghost btn-circle text-blue-500"
                          @click="setupState[currentSetupProduitId].consoQty[item.consommable_id?.id] = Math.min(item.consommable_id?.stock ?? 999, (setupState[currentSetupProduitId].consoQty[item.consommable_id?.id] ?? 0) + 1)">+</button>
                      </div>
                      <div class="w-16 text-right shrink-0 text-xs font-bold text-blue-700">
                        <span v-if="item.consommable_id?.prix_unitaire != null && setupState[currentSetupProduitId]?.consoQty[item.consommable_id?.id]">
                          {{ (item.consommable_id?.prix_unitaire * (setupState[currentSetupProduitId].consoQty[item.consommable_id?.id] ?? 0)).toFixed(2) }} €
                        </span>
                      </div>
                    </div>
                  </template>
                </div>
              </div>

              <!-- ③ Articles supplémentaires ───────────────────────────── -->
              <div class="border border-orange-200 rounded-xl overflow-hidden">
                <div class="bg-orange-50 px-4 py-2.5 border-b border-orange-200 flex items-center gap-2">
                  <div class="w-5 h-5 rounded bg-orange-500 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="white" class="w-3 h-3">
                      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v.765a3.5 3.5 0 0 0-1.628 6.36A3.5 3.5 0 0 0 14 13.5v.75a.75.75 0 0 1-.75.75h-11.5A.75.75 0 0 1 1 14.25V3.5A1.5 1.5 0 0 1 2 3.5ZM3.5 6.5a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Zm0 2.5a.75.75 0 0 0 0 1.5H6a.75.75 0 0 0 0-1.5H3.5Z"/>
                      <path d="M11.5 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/>
                    </svg>
                  </div>
                  <p class="font-semibold text-sm text-orange-900">Articles supplémentaires</p>
                </div>
                <div v-if="selectedExtraArticles.length" class="divide-y divide-orange-50">
                  <div v-for="art in selectedExtraArticles" :key="`s-${art.id}`" class="flex items-center gap-3 px-4 py-3">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-mono font-semibold text-sm">{{ art.reference }}</span>
                        <span class="text-base-content/30 text-xs">—</span>
                        <span class="text-sm text-base-content/60">{{ art.produit_id?.name }}</span>
                      </div>
                      <p class="text-xs text-base-content/40">{{ art.entrepot_id?.nom }}</p>
                    </div>
                    <button type="button" class="btn btn-xs btn-ghost btn-circle text-base-content/30 hover:text-error shrink-0"
                      @click="selectedExtraIds = selectedExtraIds.filter(id => id !== art.id)">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                        <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="px-4 py-2.5 bg-orange-50/40" :class="selectedExtraArticles.length ? 'border-t border-orange-100' : ''">
                  <input v-model="setupExtraSearch" type="text" placeholder="Rechercher un article à ajouter…"
                    class="input input-bordered input-xs w-full mb-2" />
                  <div v-if="setupExtraSearch && !filteredExtrasForSetupArticle.length"
                    class="text-xs text-base-content/40 italic text-center py-1">Aucun résultat</div>
                  <div v-else-if="setupExtraSearch" class="space-y-0.5 max-h-36 overflow-y-auto">
                    <label v-for="art in filteredExtrasForSetupArticle" :key="art.id"
                      class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-orange-50 cursor-pointer">
                      <input type="checkbox" class="checkbox checkbox-sm shrink-0" style="accent-color: #f97316"
                        :value="art.id" v-model="selectedExtraIds" />
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="font-mono font-semibold text-sm">{{ art.reference }}</span>
                          <span class="text-base-content/30 text-xs">—</span>
                          <span class="text-sm text-base-content/60">{{ art.produit_id?.name }}</span>
                        </div>
                      </div>
                    </label>
                  </div>
                  <p v-else class="text-xs text-base-content/40 italic text-center py-1">Tapez pour rechercher</p>
                </div>
              </div>

            </div>

            <div class="flex gap-2 justify-end pt-4 border-t border-base-200">
              <button class="btn btn-sm btn-ghost" @click="step = 'setup_list'">← Retour</button>
              <button class="btn btn-sm btn-success gap-1.5" @click="saveSetupArticle">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                  <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                </svg>
                Terminé
              </button>
            </div>
          </template>

          <!-- ── Aperçu article ─────────────────────────────────────────── -->
          <template v-if="step === 'article_preview' && previewArticle">
            <div class="pr-8 mb-5">
              <p class="text-xs font-semibold text-base-content/40 uppercase mb-1">Article</p>
              <h3 class="font-bold text-xl font-mono">{{ previewArticle.reference }}</h3>
              <div class="mt-2">
                <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold" :class="ETAT_CLS[previewArticle.etat]">
                  {{ ETAT_LABEL[previewArticle.etat] ?? previewArticle.etat ?? 'Inconnu' }}
                </span>
              </div>
            </div>

            <div class="space-y-3 mb-6">
              <div class="grid grid-cols-2 gap-3 bg-base-200 rounded-box p-4">
                <div>
                  <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Produit</p>
                  <p class="text-sm font-medium">{{ previewArticle.produit_id?.name ?? '—' }}</p>
                </div>
                <div>
                  <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Entrepôt</p>
                  <p class="text-sm font-medium">{{ previewArticle.entrepot_id?.nom ?? '—' }}</p>
                </div>
                <div v-if="previewArticle.emplacement">
                  <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Emplacement</p>
                  <p class="text-sm font-medium">{{ previewArticle.emplacement }}</p>
                </div>
                <div v-if="previewArticle.date_achat">
                  <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Date d'achat</p>
                  <p class="text-sm font-medium">{{ fmtDate(previewArticle.date_achat) }}</p>
                </div>
                <div v-if="previewArticle.valeur_achat != null">
                  <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Valeur d'achat</p>
                  <p class="text-sm font-medium">{{ previewArticle.valeur_achat }} €</p>
                </div>
              </div>
              <div v-if="previewArticle.notes" class="bg-base-200 rounded-box p-4">
                <p class="text-xs font-semibold text-base-content/50 uppercase mb-1">Notes</p>
                <p class="text-sm whitespace-pre-wrap">{{ previewArticle.notes }}</p>
              </div>
            </div>

            <div class="flex gap-2 justify-between pt-4 border-t border-base-200">
              <button class="btn btn-sm btn-ghost" @click="step = 'article_select'">← Retour à la sélection</button>
              <button class="btn btn-sm btn-outline gap-1.5" @click="goToArticlesView">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                  <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z"/>
                  <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z"/>
                </svg>
                Voir l'article en détail
              </button>
            </div>
          </template>

        </div><!-- fin corps scrollable -->
      </div>

      <div class="modal-backdrop" @click="$emit('close')"></div>

      <div v-if="toast" class="toast toast-end z-[200]">
        <div class="alert text-sm" :class="toast.type === 'success' ? 'alert-success' : 'alert-error'">
          {{ toast.msg }}
        </div>
      </div>
    </div>
  </Teleport>
</template>
