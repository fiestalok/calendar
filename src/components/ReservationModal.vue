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
  reservationConso.value = rawConso ?? []
  consoJunctionIds.value = (rawConso ?? []).map(r => r.id).filter(Boolean)
  await loadLinkedArticles(id)
}, { immediate: true })

watch(() => props.reservation?.status, () => { clientContacte.value = false; devisSigneFile.value = null })

// ── Helpers ───────────────────────────────────────────────────────────────────
const client  = computed(() => props.reservation?.client)
const fmtDate = (d) => d ? format(parseISO(d), "EEEE d MMMM yyyy", { locale: fr }) : '—'

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
    { key: 'quote',  label: 'Préparer un devis', status: 'devis_realise', cls: 'btn-primary' },
    { key: 'cancel', label: 'Annuler',            status: 'annulee',       cls: 'btn-error btn-outline' },
  ]
  if (s === 'devis_realise') return [
    { key: 'confirm', label: 'Confirmer la réservation', status: 'devis_confirme', cls: 'btn-success' },
    { key: 'reset',   label: 'Remettre en attente',      status: 'en_attente',     cls: 'btn-ghost' },
    { key: 'cancel',  label: 'Annuler',                  status: 'annulee',        cls: 'btn-error btn-outline' },
  ]
  if (s === 'devis_confirme') return [
    { key: 'step_back', label: 'Revenir au devis réalisé', status: 'devis_realise', cls: 'btn-ghost btn-outline' },
  ]
  return [{ key: 'reset', label: 'Remettre en attente', status: 'en_attente', cls: 'btn-ghost' }]
})

const VALIDATED_FIELD = {
  devis_realise:  'devis_realise_par',
  devis_confirme: 'devis_confirme_par',
  terminee:       'terminee_par',
}

const confirmBlocked = computed(() => {
  if (props.reservation?.status !== 'devis_realise') return false
  return !clientContacte.value || !devisGenereUrl.value
})

const confirmBlockedReason = computed(() => {
  if (!clientContacte.value) return 'Cochez la confirmation client'
  if (!devisGenereUrl.value) return 'Générez le devis'
  return ''
})

async function act(action) {
  if (action.key === 'quote') { await openArticleSelect(); return }
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

    if (action.status === 'en_attente' && props.reservation?.status === 'devis_realise') {
      for (const jId of junctionIds.value) await deleteReservationArticle(jId).catch(() => {})
      junctionIds.value    = []
      linkedArticles.value = []

      for (const row of reservationConso.value) {
        const cid = row.consommable_id?.id ?? row.consommable_id
        if (cid && row.quantite) {
          const item = allConsoItemsFlat.value.find(c => c.id === cid)
          const currentStock = item?.stock ?? 0
          await patchConsommable(cid, { stock: currentStock + row.quantite }).catch(() => {})
        }
        await deleteReservationConsommable(row.id).catch(() => {})
      }
      reservationConso.value = []
      consoJunctionIds.value = []
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

async function toggleLivraison(val) {
  livraison.value = val
  if (!val) installation.value = false
  await patchReservation(props.reservation.id, { livraison: val, installation: val ? installation.value : false }).catch(() => {})
}

async function toggleInstallation(val) {
  installation.value = val
  await patchReservation(props.reservation.id, { installation: val }).catch(() => {})
}

async function generateDevis() {
  loading.value = 'generate_devis'
  try {
    const { jsPDF } = await import('jspdf')
    const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
    const r      = props.reservation
    const c      = client.value
    const now    = format(new Date(), 'dd/MM/yyyy')
    const W      = 210
    const M      = 14
    const INNER  = W - M * 2
    const PURPLE = [5, 150, 105]
    const LPURPLE= [209, 250, 229]
    const GREY   = [248, 248, 252]
    const DGREY  = [100, 100, 110]
    const pageH  = 297
    let y        = 0

    const addPage    = () => { doc.addPage(); y = 20 }
    const checkPage  = (needed = 10) => { if (y + needed > pageH - 18) addPage() }
    const setColor   = (rgb) => doc.setTextColor(...rgb)

    const sectionTitle = (title) => {
      checkPage(14)
      y += 6
      doc.setFillColor(...PURPLE)
      doc.rect(M, y, INNER, 8, 'F')
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
      doc.text(title.toUpperCase(), M + 4, y + 5.5)
      setColor([0, 0, 0])
      y += 12
    }

    const drawTable = (cols, rows) => {
      const rowH = 7; const headerH = 7
      checkPage(headerH + rowH)
      doc.setFillColor(...LPURPLE)
      doc.rect(M, y, INNER, headerH, 'F')
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); setColor([50, 30, 100])
      for (const col of cols) {
        const align = col.align ?? 'left'
        const tx = align === 'right' ? col.x + col.w - 2 : col.x + 2
        doc.text(col.label, tx, y + 5, { align })
      }
      y += headerH
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5)
      let odd = false
      for (const row of rows) {
        checkPage(rowH + 2)
        if (odd) { doc.setFillColor(...GREY); doc.rect(M, y, INNER, rowH, 'F') }
        odd = !odd
        doc.setDrawColor(220, 220, 230); doc.line(M, y + rowH, M + INNER, y + rowH)
        setColor([30, 30, 40])
        for (let i = 0; i < cols.length; i++) {
          const col   = cols[i]
          const cell  = String(row[i] ?? '—')
          const align = col.align ?? 'left'
          const tx    = align === 'right' ? col.x + col.w - 2 : col.x + 2
          const maxW  = col.w - 4
          const fitted  = doc.splitTextToSize(cell, maxW)[0] ?? cell
          const clipped = fitted.length < cell.length ? fitted.slice(0, -1) + '…' : fitted
          doc.text(clipped, tx, y + 5, { align })
        }
        y += rowH
      }
      y += 2
    }

    doc.setFillColor(...PURPLE); doc.rect(0, 0, W, 32, 'F')
    doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
    doc.text('FIESTALOK', M, 14)
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('Location de structures gonflables', M, 21)
    doc.setFontSize(18); doc.setFont('helvetica', 'bold')
    doc.text('DEVIS', W - M, 13, { align: 'right' })
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text(`N° ${r.id}  •  Émis le ${now}`, W - M, 20, { align: 'right' })
    y = 38

    const clientLines = []
    const fullName = `${c?.first_name ?? ''} ${c?.last_name ?? ''}`.trim()
    if (c?.company_name) clientLines.push(c.company_name)
    if (fullName)        clientLines.push(fullName)
    if (c?.email)        clientLines.push(c.email)
    if (c?.phone)        clientLines.push(c.phone)
    if (c?.city)         clientLines.push(c.city)
    const cardH = Math.max(28, 10 + clientLines.length * 5.5)

    doc.setFillColor(...GREY); doc.roundedRect(M, y, 85, cardH, 2, 2, 'F')
    doc.setDrawColor(...LPURPLE); doc.roundedRect(M, y, 85, cardH, 2, 2, 'S')
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setColor([...PURPLE])
    doc.text('CLIENT', M + 4, y + 5.5)
    let cy = y + 11
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); setColor([20, 20, 30])
    doc.text(clientLines[0] ?? '—', M + 4, cy); cy += 5.5
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); setColor([60, 60, 70])
    for (const l of clientLines.slice(1)) { doc.text(l, M + 4, cy); cy += 5 }

    doc.setFillColor(...GREY); doc.roundedRect(106, y, 45, cardH, 2, 2, 'F')
    doc.setDrawColor(...LPURPLE); doc.roundedRect(106, y, 45, cardH, 2, 2, 'S')
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setColor([...PURPLE])
    doc.text('PÉRIODE', 110, y + 5.5)
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); setColor([20, 20, 30])
    doc.text(`Du  ${fmtDate(r.date_start)}`, 110, y + 13)
    doc.text(`Au  ${fmtDate(r.date_end)}`, 110, y + 20)

    doc.setFillColor(...GREY); doc.roundedRect(157, y, 39, cardH, 2, 2, 'F')
    doc.setDrawColor(...LPURPLE); doc.roundedRect(157, y, 39, cardH, 2, 2, 'S')
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); setColor([...PURPLE])
    doc.text('LOGISTIQUE', 161, y + 5.5)
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); setColor([20, 20, 30])
    doc.text(`Livraison :    ${livraison.value ? 'Oui' : 'Non'}`, 161, y + 13)
    doc.text(`Installation : ${installation.value ? 'Oui' : 'Non'}`, 161, y + 20)
    y += cardH + 6

    if (r.total_price) {
      doc.setFillColor(...PURPLE); doc.roundedRect(M, y, INNER, 12, 2, 2, 'F')
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); setColor([255, 255, 255])
      doc.text('TOTAL', M + 6, y + 8)
      doc.setFontSize(12)
      doc.text(`${r.total_price} €`, W - M - 4, y + 8, { align: 'right' })
      setColor([0, 0, 0]); y += 16
    }

    sectionTitle('1. Produits réservés')
    drawTable(
      [{ label: 'Produit', x: M, w: 100 }, { label: 'Qté', x: M+100, w: 20, align: 'right' }, { label: 'Prix unitaire', x: M+120, w: 35, align: 'right' }, { label: 'Sous-total', x: M+155, w: 27, align: 'right' }],
      produits.value.map(p => {
        const qty = p.quantity ?? 1; const unit = p.unit_price ? Number(p.unit_price) : null
        return [p.produits_id?.name ?? '—', qty, unit ? `${unit} €` : '—', unit ? `${(qty * unit).toFixed(2)} €` : '—']
      })
    )

    const principalArticles = linkedArticles.value.filter(la => la.article?.type !== 'secondaire')
    if (principalArticles.length) {
      sectionTitle('2. Matériel principal')
      drawTable(
        [{ label: 'Référence', x: M, w: 60 }, { label: 'Description', x: M+60, w: 82 }, { label: 'Entrepôt', x: M+142, w: 40 }],
        principalArticles.map(la => {
          const art = la.article
          return [art?.reference ?? '—', art?.notes ?? art?.produit_id?.name ?? '', art?.entrepot_id?.nom ?? '—']
        })
      )
    }

    sectionTitle('3. Consommables')
    if (reservationConso.value.length) {
      drawTable(
        [{ label: 'Consommable', x: M, w: 80 }, { label: 'Type', x: M+80, w: 35 }, { label: 'Qté', x: M+115, w: 22, align: 'right' }, { label: 'Unité', x: M+137, w: 22, align: 'right' }, { label: 'Prix unit.', x: M+159, w: 23, align: 'right' }],
        reservationConso.value.map(rc => [rc.consommable_id?.nom ?? '—', rc.consommable_id?.type ?? '—', rc.quantite ?? 1, rc.consommable_id?.unite ?? '—', rc.consommable_id?.prix_unitaire ? `${rc.consommable_id.prix_unitaire} €` : '—'])
      )
    } else {
      checkPage(8); doc.setFontSize(8.5); doc.setFont('helvetica', 'italic'); setColor([...DGREY])
      doc.text('Aucun consommable associé à cette réservation.', M + 4, y + 5); y += 10
    }

    const annexeArticles = linkedArticles.value.filter(la => la.article?.type === 'secondaire')
    if (annexeArticles.length) {
      sectionTitle('4. Matériel annexe')
      drawTable(
        [{ label: 'Référence', x: M, w: 70 }, { label: 'Description', x: M+70, w: 112 }],
        annexeArticles.map(la => [la.article?.reference ?? '—', la.article?.notes ?? la.article?.produit_id?.name ?? ''])
      )
    }

    if (r.notes) {
      checkPage(20); y += 4
      doc.setFillColor(...GREY); doc.roundedRect(M, y, INNER, 6, 1, 1, 'F')
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); setColor([...PURPLE])
      doc.text('NOTES', M + 4, y + 4.5); y += 9
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); setColor([40, 40, 50])
      const noteLines = doc.splitTextToSize(r.notes, INNER - 4)
      checkPage(noteLines.length * 5 + 4); doc.text(noteLines, M + 2, y); y += noteLines.length * 5 + 4
    }

    const totalPages = doc.getNumberOfPages()
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p); doc.setFillColor(...PURPLE); doc.rect(0, pageH - 12, W, 12, 'F')
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); setColor([200, 190, 240])
      doc.text('Ce devis est valable 30 jours à compter de sa date d\'émission — fiestalok.fr', W / 2, pageH - 5.5, { align: 'center' })
      doc.text(`Page ${p} / ${totalPages}`, W - M, pageH - 5.5, { align: 'right' })
    }

    const blob = doc.output('blob'); const fd = new FormData()
    fd.append('file', blob, `devis-reservation-${r.id}.pdf`)
    const uploaded = await uploadFile(fd)
    await patchReservation(r.id, { fichier_devis: uploaded.id })
    validatedBy.value = { ...validatedBy.value, fichier_devis: uploaded.id }
    showToast('Devis généré avec succès', 'success')
  } catch (err) {
    console.error(err); showToast(err?.message ?? 'Erreur génération devis', 'error')
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
    await openSetupList()
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
      step.value = 'setup_list'
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
          consoQty[item.id] = existingConsoQty[item.id] ?? item.quantite_defaut ?? 1
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

    step.value = 'setup_list'
  } catch (err) {
    showToast(err?.message ?? 'Erreur chargement', 'error')
  } finally {
    loading.value = null
  }
}

function goToSetupArticle(produitId) {
  currentSetupProduitId.value = produitId
  setupExtraSearch.value = ''
  step.value = 'setup_article'
}

function saveSetupArticle() {
  if (currentSetupProduitId.value) {
    setupState.value[currentSetupProduitId.value].configured = true
  }
  step.value = 'setup_list'
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
        const item = allConsoItemsFlat.value.find(c => c.id === cid)
        if (item) { await patchConsommable(cid, { stock: (item.stock ?? 0) + row.quantite }).catch(() => {}); item.stock = (item.stock ?? 0) + row.quantite }
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
      const item = allConsoItemsFlat.value.find(c => c.id === cid)
      if (item) { const newStock = Math.max(0, (item.stock ?? 0) - q); await patchConsommable(cid, { stock: newStock }).catch(() => {}); item.stock = newStock }
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

async function finalizeDevisRealise() {
  await store.updateStatus(props.reservation.id, 'devis_realise')
  patchReservation(props.reservation.id, { devis_realise_par: auth.user.name }).catch(() => {})
  step.value = 'detail'
  showToast('Devis préparé', 'success')
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
const ETAT_CLS   = { disponible: 'bg-emerald-100 text-emerald-700', loue: 'bg-blue-100 text-blue-700', en_location: 'bg-blue-100 text-blue-700', en_maintenance: 'bg-amber-100 text-amber-700', hors_service: 'bg-red-100 text-red-700' }

const STATUS_ORDER = ['en_attente', 'devis_realise', 'devis_confirme', 'terminee']
const statusIdx = computed(() => STATUS_ORDER.indexOf(props.reservation?.status ?? ''))

const validationSteps = computed(() =>
  [
    validatedBy.value.devis_realise_par  && { label: 'Devis réalisé par', value: validatedBy.value.devis_realise_par },
    validatedBy.value.devis_confirme_par && { label: 'Confirmé par',      value: validatedBy.value.devis_confirme_par },
    validatedBy.value.terminee_par       && { label: 'Terminé par',       value: validatedBy.value.terminee_par },
  ].filter(Boolean)
)

// ── Navigation retour ─────────────────────────────────────────────────────────
const showBackWarning         = ref(false)
const showConfirmedBackWarning = ref(false)

function handleBack() {
  if (step.value === 'article_preview') { step.value = 'article_select'; return }
  if (step.value === 'article_select')  { step.value = 'detail'; return }
  if (step.value === 'setup_article')   { step.value = 'setup_list'; return }
  if (step.value === 'setup_list')      { showBackWarning.value = true; return }
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
      <div class="modal-box w-11/12 max-w-2xl p-0 overflow-hidden flex flex-col" style="max-height: 90vh;">

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
            <p class="font-bold text-base">Revenir au statut "Devis réalisé" ?</p>
            <p class="text-sm text-base-content/60">La réservation ne sera plus confirmée. Cette action est réversible.</p>
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
                Devis réalisé
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
                Att. de signature
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
                Confirmé
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

            <!-- ── Dates ────────────────────────────────────────────────── -->
            <div class="rounded-xl border border-base-200 bg-base-100 mb-3 overflow-hidden">
              <div class="flex items-center divide-x divide-base-200">
                <div class="flex-1 px-4 py-3">
                  <p class="text-[10px] font-semibold text-base-content/40 uppercase mb-0.5">Début</p>
                  <p class="text-sm font-semibold capitalize">{{ fmtDate(reservation.date_start) }}</p>
                </div>
                <div class="flex items-center justify-center w-8 shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3 text-base-content/20">
                    <path fill-rule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z" clip-rule="evenodd"/>
                  </svg>
                </div>
                <div class="flex-1 px-4 py-3">
                  <p class="text-[10px] font-semibold text-base-content/40 uppercase mb-0.5">Fin</p>
                  <p class="text-sm font-semibold capitalize">{{ fmtDate(reservation.date_end) }}</p>
                </div>
              </div>
            </div>

            <!-- ── Client (lookup card, style CRM) ─────────────────────── -->
            <hr v-if="client" class="border-t border-base-200 mb-4">
            <div v-if="client" class="bg-white rounded-xl shadow-sm border border-gray-100 mb-3 overflow-hidden">
              <div class="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  :class="client.typeClient === 'entreprise' ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-100 text-emerald-700'">
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

            <!-- ── Produits + Articles ───────────────────────────────────── -->
            <div v-if="produits.length" class="mb-3">
              <hr class="border-t border-base-200 mb-4">
              <p class="text-[11px] font-bold text-base-content/40 uppercase tracking-wide mb-2">Produits réservés</p>
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
                    <img v-if="item.produits_id?.images_urls?.[0]" :src="item.produits_id.images_urls[0]" class="w-9 h-9 object-cover rounded-lg shrink-0" alt="" />
                    <div v-else class="w-9 h-9 bg-base-300 rounded-lg flex items-center justify-center shrink-0 text-base-content/30 text-xs font-bold">?</div>
                    <div class="flex-1 min-w-0">
                      <p class="font-semibold text-sm truncate">{{ item.produits_id?.name || 'Produit' }}</p>
                      <p class="text-xs text-base-content/40">
                        Qté {{ item.quantity || 1 }}<span v-if="item.unit_price"> · {{ item.unit_price }} €</span>
                      </p>
                    </div>
                    <div v-if="reservation.status !== 'en_attente'" class="shrink-0">
                      <span v-if="productArticleGroups[item.produits_id?.id]?.principal?.length"
                        class="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3 text-success">
                          <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                        </svg>
                      </span>
                      <span v-else class="w-5 h-5 rounded-full bg-base-300 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3 text-base-content/30">
                          <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                        </svg>
                      </span>
                    </div>
                  </div>

                  <template v-if="reservation.status !== 'en_attente'">
                    <div v-for="(la, i) in productArticleGroups[item.produits_id?.id]?.principal ?? []"
                      :key="`p-${i}`"
                      class="flex border-t border-emerald-100 bg-emerald-50/30">
                      <!-- Tree connector -->
                      <div class="w-9 flex-shrink-0 flex flex-col items-center">
                        <div class="w-px flex-1 bg-emerald-200/60"></div>
                        <div class="flex items-center w-full">
                          <div class="flex-1 h-px bg-emerald-200/60"></div>
                        </div>
                        <div class="flex-1"></div>
                      </div>
                      <!-- Content -->
                      <div class="flex items-center gap-3 py-2.5 pr-3 flex-1 min-w-0">
                        <div class="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-emerald-500">
                            <path d="M3.75 2a.75.75 0 0 0-.75.75v10.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75V6.56a.75.75 0 0 0-.22-.53L9.22 2.22A.75.75 0 0 0 8.69 2H3.75Z"/>
                          </svg>
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="font-mono font-bold text-sm text-emerald-900">{{ la.article?.reference ?? '—' }}</p>
                          <div class="flex gap-1.5 mt-0.5 flex-wrap items-center">
                            <span v-if="la.article?.entrepot_id?.nom" class="text-xs text-base-content/50">{{ la.article.entrepot_id.nom }}</span>
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
                            <span class="font-mono text-xs font-semibold text-base-content/70">{{ la.article?.reference ?? '—' }}</span>
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

            <!-- ── Notes ────────────────────────────────────────────────── -->
            <div v-if="reservation.notes" class="mb-3">
              <hr class="border-t border-base-200 mb-4">
              <p class="text-[11px] font-bold text-base-content/40 uppercase tracking-wide mb-1.5">Notes</p>
              <p class="text-sm bg-base-200/60 border border-base-200 rounded-xl px-4 py-3 text-base-content/70 leading-relaxed">{{ reservation.notes }}</p>
            </div>

            <!-- ── Setup ──────────────────────────────────────────────────── -->
            <div v-if="reservation.status !== 'en_attente'" class="mb-3">
              <hr class="border-t border-base-200 mb-4">
              <p class="text-[11px] font-bold text-base-content/40 uppercase tracking-wide mb-2">Setup</p>
              <div class="rounded-xl border border-base-200 bg-base-100 overflow-hidden">
                <!-- Livraison / Installation -->
                <div class="flex items-center divide-x divide-base-200">
                  <label class="flex-1 flex items-center justify-between px-4 py-2.5 cursor-pointer">
                    <div class="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-base-content/30 shrink-0">
                        <path d="M8.5 3.5A1.5 1.5 0 0 1 10 2h1.5A1.5 1.5 0 0 1 13 3.5V5h1a.75.75 0 0 1 .649.373l1.25 2.25a.75.75 0 0 1 .101.374V10a.75.75 0 0 1-.75.75h-.5a2.25 2.25 0 0 1-4.5 0h-2.5a2.25 2.25 0 0 1-4.5 0H2.25A.75.75 0 0 1 1.5 10V3.5A1.5 1.5 0 0 1 3 2h5a.5.5 0 0 1 0 1H3a.5.5 0 0 0-.5.5v6.213a2.251 2.251 0 0 1 3.36.787H9.14a2.252 2.252 0 0 1 3.712-.506V5h-1.5A1.5 1.5 0 0 1 9.5 3.5v-1h-1v1Z"/>
                      </svg>
                      <span class="text-sm font-medium">Livraison</span>
                    </div>
                    <input type="checkbox" class="toggle toggle-xs toggle-primary" :checked="livraison" :disabled="reservation.status === 'devis_confirme'" @change="toggleLivraison($event.target.checked)" />
                  </label>
                  <label class="flex-1 flex items-center justify-between px-4 py-2.5"
                    :class="livraison ? 'cursor-pointer' : 'opacity-30 cursor-not-allowed'">
                    <div class="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-base-content/30 shrink-0">
                        <path fill-rule="evenodd" d="M7.455 1.52a.75.75 0 0 1 1.09 0l6.25 6.75a.75.75 0 0 1 0 1.018l-6.25 6.75a.75.75 0 0 1-1.09 0l-6.25-6.75a.75.75 0 0 1 0-1.017l6.25-6.75Zm1.818 2.395L13 8l-3.727 4.085V7.25a.25.25 0 0 0-.25-.25H7.25a.25.25 0 0 0-.25.25v4.835L3 8l4.273-4.085A1.75 1.75 0 0 1 9.273 3.915Z" clip-rule="evenodd"/>
                      </svg>
                      <span class="text-sm font-medium">Installation</span>
                    </div>
                    <input type="checkbox" class="toggle toggle-xs toggle-secondary" :checked="installation" :disabled="!livraison || reservation.status === 'devis_confirme'" @change="toggleInstallation($event.target.checked)" />
                  </label>
                </div>
                <div v-if="reservation.delivery_address && livraison" class="px-4 py-2.5 border-t border-base-200 bg-base-200/30">
                  <p class="text-[10px] font-semibold text-base-content/40 uppercase mb-0.5">Adresse de livraison</p>
                  <p class="text-sm text-base-content/70">{{ reservation.delivery_address }}</p>
                </div>
                <!-- Accord oral (devis_realise seulement) -->
                <div v-if="reservation.status === 'devis_realise'" class="px-4 py-3 border-t border-base-200">
                  <label class="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" v-model="clientContacte" class="checkbox checkbox-sm checkbox-success" />
                    <span class="text-sm" :class="clientContacte ? 'text-base-content' : 'text-base-content/60'">
                      Client contacté et accord oral confirmé
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <!-- ── Consommables ──────────────────────────────────────────── -->
            <div v-if="reservationConso.length && reservation.status !== 'en_attente'" class="mb-3">
              <hr class="border-t border-base-200 mb-4">
              <p class="text-[11px] font-bold text-base-content/40 uppercase tracking-wide mb-2">Consommables</p>
              <div class="rounded-xl border border-emerald-100 overflow-hidden divide-y divide-emerald-50">
                <div v-for="row in reservationConso" :key="row.id"
                  class="flex items-center gap-3 px-3 py-2.5 bg-emerald-50/30">
                  <div class="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5 text-emerald-500">
                      <path fill-rule="evenodd" d="M8 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.75v4.25a.75.75 0 0 1-1.5 0V8.5H3a.75.75 0 0 1 0-1.5h4.25V2.75A.75.75 0 0 1 8 2Z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">{{ row.consommable_id?.nom ?? '—' }}</p>
                    <p class="text-xs text-base-content/40">{{ row.consommable_id?.unite }}</p>
                  </div>
                  <span class="text-xs font-semibold text-base-content/50 shrink-0">× {{ row.quantite }}</span>
                  <span v-if="row.consommable_id?.prix_unitaire != null" class="text-xs font-bold text-emerald-600 shrink-0">
                    {{ (row.consommable_id.prix_unitaire * row.quantite).toFixed(2) }} €
                  </span>
                </div>
              </div>
            </div>

            <!-- ── Devis généré ──────────────────────────────────────────── -->
            <div v-if="reservation.status === 'devis_realise' || (devisGenereUrl && reservation.status !== 'en_attente')" class="mb-3">
              <hr class="border-t border-base-200 mb-4">
              <p class="text-[11px] font-bold text-base-content/40 uppercase tracking-wide mb-1.5">Devis</p>
              <div class="rounded-xl border border-base-200 overflow-hidden">
                <a v-if="devisGenereUrl" :href="devisGenereUrl" target="_blank" rel="noopener"
                  class="flex items-center gap-4 px-4 py-4 hover:bg-base-200/40 transition-colors group border-b-2 border-base-200">
                  <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-5 h-5 text-primary">
                      <path d="M2 3a1 1 0 0 1 1-1h7.586a1 1 0 0 1 .707.293l2.414 2.414A1 1 0 0 1 14 5.414V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Z"/>
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-primary group-hover:underline">Voir le devis</p>
                    <p class="text-xs text-base-content/40">PDF</p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-base-content/20 shrink-0">
                    <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72ZM3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z"/>
                  </svg>
                </a>
                <div class="flex items-center gap-2 px-4 py-3.5 bg-base-50">
                  <button class="btn btn-sm gap-1.5" :class="devisGenereUrl ? 'btn-ghost' : 'btn-primary'"
                    :disabled="loading === 'generate_devis'" @click="generateDevis">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                      <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                    </svg>
                    <span v-if="loading !== 'generate_devis'">{{ devisGenereUrl ? 'Regénérer' : 'Générer le devis' }}</span>
                    <span v-else class="loading loading-spinner loading-xs"></span>
                  </button>
                </div>
              </div>
            </div>

            <!-- ── Devis signé ───────────────────────────────────────────── -->
            <div v-if="reservation.status === 'devis_confirme'" class="mb-3">
              <hr class="border-t border-base-200 mb-4">
              <p class="text-[11px] font-bold text-base-content/40 uppercase tracking-wide mb-1.5">Devis signé</p>
              <div class="rounded-xl border border-base-200 overflow-hidden">
                <a v-if="signedDevisUrl" :href="signedDevisUrl" target="_blank" rel="noopener"
                  class="flex items-center gap-3 px-3 py-2.5 hover:bg-base-200/40 transition-colors group border-b border-base-200">
                  <div class="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-success">
                      <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                  <div class="flex-1">
                    <p class="text-sm font-semibold text-success group-hover:underline">Devis signé</p>
                    <p class="text-xs text-base-content/40">Signé · PDF</p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-base-content/20 shrink-0">
                    <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72ZM3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z"/>
                  </svg>
                </a>
                <div v-if="reservation.status !== 'devis_confirme'" class="flex items-center gap-2 flex-wrap px-3 py-2.5">
                  <input ref="devisSigneInput" type="file" accept=".pdf,.jpg,.jpeg,.png" class="hidden" @change="onDevisSigneChange" />
                  <button class="btn btn-sm btn-ghost gap-1.5 text-base-content/60" @click="devisSigneInput.click()">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
                      <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z"/>
                    </svg>
                    {{ signedDevisUrl ? 'Remplacer' : 'Joindre le devis signé' }}
                  </button>
                  <span v-if="devisSigneFile" class="text-sm text-success truncate max-w-[140px]">{{ devisSigneFile.name }}</span>
                  <button v-if="devisSigneFile" class="btn btn-sm btn-success ml-auto" :disabled="loading === 'upload_devis_signe'" @click="uploadDevisSigne">
                    <span v-if="loading !== 'upload_devis_signe'">Enregistrer</span>
                    <span v-else class="loading loading-spinner loading-xs"></span>
                  </button>
                </div>
              </div>
            </div>

            <!-- ── Actions ──────────────────────────────────────────────── -->
            <div class="flex items-center gap-2 pt-4 border-t border-base-200">
              <!-- Annuler → left -->
              <template v-for="a in actions" :key="a.key">
                <button v-if="a.key === 'cancel'" class="btn btn-sm" :class="a.cls"
                  :disabled="loading !== null"
                  @click="act(a)">
                  <span v-if="loading !== a.key">{{ a.label }}</span>
                  <span v-else class="loading loading-spinner loading-xs"></span>
                </button>
              </template>
              <!-- Middle spacer + secondary actions -->
              <div class="flex-1 flex items-center gap-2 justify-center flex-wrap">
                <template v-for="a in actions" :key="a.key">
                  <button v-if="a.key !== 'cancel' && a.key !== 'confirm' && a.key !== 'done' && a.key !== 'quote'"
                    class="btn btn-sm" :class="a.cls"
                    :disabled="loading !== null"
                    @click="act(a)">
                    <span v-if="loading !== a.key">{{ a.label }}</span>
                    <span v-else class="loading loading-spinner loading-xs"></span>
                  </button>
                </template>
              </div>
              <!-- Valider → right -->
              <template v-for="a in actions" :key="a.key">
                <button v-if="a.key === 'confirm' || a.key === 'done' || a.key === 'quote'"
                  class="btn btn-sm" :class="a.cls"
                  :disabled="loading !== null || (a.key === 'confirm' && confirmBlocked)"
                  @click="act(a)">
                  <span v-if="loading !== a.key">{{ a.label }}</span>
                  <span v-else class="loading loading-spinner loading-xs"></span>
                </button>
              </template>
            </div>
            <p v-if="confirmBlocked" class="text-xs text-base-content/40 text-right mt-1">
              {{ confirmBlockedReason }} pour continuer
            </p>
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
                      <span v-if="item.consoCount" class="text-emerald-500">{{ item.consoCount }} conso.</span>
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
              <div class="border border-emerald-200 rounded-xl overflow-hidden">
                <div class="bg-emerald-50 px-4 py-2.5 border-b border-emerald-200 flex items-center gap-2">
                  <div class="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="white" class="w-3 h-3">
                      <path fill-rule="evenodd" d="M6.955 1.45A.5.5 0 0 1 7.452 1h1.096a.5.5 0 0 1 .497.45l.11 1.09a5.021 5.021 0 0 1 1.19.482l.875-.611a.5.5 0 0 1 .637.065l.774.775a.5.5 0 0 1 .065.636l-.611.875c.2.37.357.763.482 1.19l1.09.11a.5.5 0 0 1 .45.497v1.096a.5.5 0 0 1-.45.497l-1.09.11a5.02 5.02 0 0 1-.482 1.19l.611.875a.5.5 0 0 1-.065.637l-.775.774a.5.5 0 0 1-.636.065l-.875-.611a5.02 5.02 0 0 1-1.19.482l-.11 1.09a.5.5 0 0 1-.497.45H7.452a.5.5 0 0 1-.497-.45l-.11-1.09a5.021 5.021 0 0 1-1.19-.482l-.875.611a.5.5 0 0 1-.637-.065l-.774-.775a.5.5 0 0 1-.065-.636l.611-.875a5.021 5.021 0 0 1-.482-1.19l-1.09-.11A.5.5 0 0 1 1 8.548V7.452a.5.5 0 0 1 .45-.497l1.09-.11a5.02 5.02 0 0 1 .482-1.19l-.611-.875a.5.5 0 0 1 .065-.637l.775-.774a.5.5 0 0 1 .636-.065l.875.611a5.021 5.021 0 0 1 1.19-.482l.11-1.09ZM8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" clip-rule="evenodd"/>
                    </svg>
                  </div>
                  <p class="font-semibold text-sm text-emerald-900">Gamme</p>
                </div>
                <div v-if="!currentGammes.length"
                  class="text-sm text-base-content/40 italic text-center py-6">
                  Aucune gamme associée à ce produit
                </div>
                <div v-else>
                  <template v-for="group in currentGammes" :key="group.gamme.id">
                    <div class="px-4 py-1.5 bg-emerald-50/60 border-b border-emerald-100">
                      <span class="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">{{ group.gamme.nom }}</span>
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
                            <span class="text-base-content/30 text-xs">—</span>
                            <span class="text-sm text-base-content/70">{{ art.produit_id?.name }}</span>
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
              <div class="border border-emerald-200 rounded-xl overflow-hidden">
                <div class="bg-emerald-50 px-4 py-2.5 border-b border-emerald-200 flex items-center gap-2">
                  <div class="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="white" class="w-3 h-3">
                      <path d="M2.5 6a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 13.5 6v1.293a2.5 2.5 0 0 1 0 4.414V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-1.293a2.5 2.5 0 0 1 0-4.414V6Z"/>
                    </svg>
                  </div>
                  <p class="font-semibold text-sm text-emerald-900">Consommables</p>
                </div>
                <div v-if="!currentGammes.some(g => g.consoItems.length)"
                  class="text-sm text-base-content/40 italic text-center py-5">
                  Aucun consommable associé
                </div>
                <div v-else class="divide-y divide-emerald-50/80">
                  <template v-for="group in currentGammes" :key="group.gamme.id">
                    <div v-for="item in group.consoItems" :key="item.id" class="flex items-center gap-3 px-4 py-3">
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold">{{ item.nom }}</p>
                        <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span v-if="item.unite" class="text-xs bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded">{{ item.unite }}</span>
                          <span v-if="item.prix_unitaire != null" class="text-xs text-emerald-600 font-medium">{{ item.prix_unitaire }} €/u</span>
                          <span class="text-xs font-medium"
                            :class="(item.stock ?? 0) <= 0 ? 'text-error' : (item.stock ?? 0) <= 3 ? 'text-warning' : 'text-base-content/40'">
                            Stock : {{ item.stock ?? 0 }}
                          </span>
                        </div>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button type="button" class="btn btn-xs btn-ghost btn-circle text-emerald-500"
                          @click="setupState[currentSetupProduitId].consoQty[item.id] = Math.max(0, (setupState[currentSetupProduitId].consoQty[item.id] ?? 0) - 1)">−</button>
                        <input type="number" min="0" :max="item.stock ?? 999"
                          :value="setupState[currentSetupProduitId]?.consoQty[item.id] ?? 0"
                          @change="setupState[currentSetupProduitId].consoQty[item.id] = Math.max(0, Math.min(item.stock ?? 999, Number($event.target.value)))"
                          class="input input-bordered input-xs w-14 text-center font-bold" />
                        <button type="button" class="btn btn-xs btn-ghost btn-circle text-emerald-500"
                          @click="setupState[currentSetupProduitId].consoQty[item.id] = Math.min(item.stock ?? 999, (setupState[currentSetupProduitId].consoQty[item.id] ?? 0) + 1)">+</button>
                      </div>
                      <div class="w-16 text-right shrink-0 text-xs font-bold text-emerald-700">
                        <span v-if="item.prix_unitaire != null && setupState[currentSetupProduitId]?.consoQty[item.id]">
                          {{ (item.prix_unitaire * (setupState[currentSetupProduitId].consoQty[item.id] ?? 0)).toFixed(2) }} €
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
