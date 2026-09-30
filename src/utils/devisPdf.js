import { addDays, format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

// ── Identité (mentions légales de hoplalok.fr) ───────────────────────────────
export const ENTREPRISE = {
  nom:       "Hoplalo'K",
  adresse:   '5 rue du maire Sorgus, 67300 Schiltigheim',
  siret:     '108 736 497 00018',
  telephone: '06 79 51 59 25',
  email:     'contact@fiestalok.fr',
  site:      'hoplalok.fr',
  instagram: '@hoplalok',
}

// ── Charte graphique de hoplalok.fr ──────────────────────────────────────────
const INK      = [45, 52, 54]     // --color-ink      #2d3436
const INK_SOFT = [91, 98, 102]    // --color-ink-soft #5b6266
const CORAL    = [255, 107, 107]  // --color-primary  #ff6b6b
const ORANGE   = [255, 142, 83]   //                  #ff8e53
const YELLOW   = [255, 230, 109]  // --color-accent   #ffe66d
const BG       = [248, 249, 250]  // --color-bg       #f8f9fa
const BORDER   = [230, 232, 235]  // --color-border   #e6e8eb
const WHITE    = [255, 255, 255]
// Bandeau d'accueil du site : linear-gradient(135deg, #ff6b6b 0%, #ff8e53 55%, #ffe66d 100%)
const GRADIENT = [[0, CORAL], [0.55, ORANGE], [1, YELLOW]]

const FONT_FILES = {
  bangers:    'Bangers-Regular.ttf',
  nunito:     'Nunito-Regular.ttf',
  nunitoBold: 'Nunito-Bold.ttf',
}

// ── Mise en page A4 (mm) ─────────────────────────────────────────────────────
const W = 210, H = 297, M = 14, INNER = W - 2 * M
const HEADER_H       = 42
const FOOTER_TOP     = H - 22
const CONTENT_BOTTOM = FOOTER_TOP - 6
const SIG_H          = 28
const TVA            = 0.20
const VALIDITE_JOURS = 30
const NOTES_BESIDE_MAX = 8   // au-delà, les notes passent en pleine largeur sous les totaux
// Bulles décoratives du bandeau (x, y, rayon), comme sur le site
const BULLES = [[104, 10, 3.2], [119, 31, 5.4], [96, 38, 1.8], [126, 5, 1.5], [4, 37, 2.8], [205, 39, 2]]

// Charge les polices de public/fonts en base64 pour jsPDF.
// Une police introuvable est ignorée : le devis retombe alors sur Helvetica.
export async function loadDevisFonts(baseUrl) {
  const entries = await Promise.all(Object.entries(FONT_FILES).map(async ([key, file]) => {
    try {
      const resp = await fetch(baseUrl + file)
      if (!resp.ok) return [key, null]
      return [key, toBase64(new Uint8Array(await resp.arrayBuffer()))]
    } catch {
      return [key, null]
    }
  }))
  return Object.fromEntries(entries)
}

/**
 * Génère les pages du devis (sans les CGV) et renvoie un ArrayBuffer.
 *
 * devis = {
 *   numero, dateEmission,
 *   client: { societe, prenom, nom, adresse, codePostal, ville, telephone, email },
 *   debut, fin, lieu, livraison,
 *   lignes: [{ designation, detail?, quantite, prixTTC }],  // prixTTC null = prix inconnu
 *   avecTVA, notes, cgvJointes,
 * }
 * fonts = { bangers, nunito, nunitoBold } en base64 (voir loadDevisFonts)
 */
export async function buildDevisPdf(devis, fonts = {}) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const F   = registerFonts(doc, fonts)
  const avecTVA = devis.avecTVA !== false

  const emission = devis.dateEmission ?? new Date()
  const validite = format(addDays(emission, VALIDITE_JOURS), 'dd/MM/yyyy')

  let y = 0

  // ── Helpers ───────────────────────────────────────────────────────────────
  const text = (str, x, ty, { font = 'body', size = 9, color = INK, align = 'left' } = {}) => {
    doc.setFont(...F[font]); doc.setFontSize(size); doc.setTextColor(...color)
    doc.text(String(str), x, ty, { align })
  }
  const wrap = (str, width, font, size) => {
    doc.setFont(...F[font]); doc.setFontSize(size)
    return doc.splitTextToSize(String(str), width)
  }
  // Garde au plus `max` lignes, avec « … » si le texte est tronqué
  const clampLines = (rows, max) => {
    if (rows.length <= max) return rows
    const kept = rows.slice(0, max)
    kept[max - 1] = kept[max - 1].replace(/[\s,.;:—–-]+$/, '') + '…'
    return kept
  }
  const label = (str, x, ty, size = 12) => text(str, x, ty, { font: 'display', size, color: CORAL })

  const withOpacity = (opacity, draw) => {
    doc.saveGraphicsState()
    doc.setGState(new doc.GState({ opacity }))
    draw()
    doc.restoreGraphicsState()
  }

  // Dégradé à 135° sur toute la largeur de la page : bandes à 45° de couleur constante
  const gradient = (top, height) => {
    const span = W + height, STEP = 1.2
    for (let s = 0; s < span; s += STEP) {
      doc.setFillColor(...gradientColor((s + STEP / 2) / span))
      doc.lines([[STEP + 0.3, 0], [-height, height], [-(STEP + 0.3), 0]], s, top, [1, 1], 'F', true)
    }
  }

  // Carte « sticker » du site : bordure encre + ombre portée franche
  const sticker = (x, sy, w, h, fill) => {
    doc.setFillColor(...INK)
    doc.roundedRect(x + 1.4, sy + 1.4, w, h, 3, 3, 'F')
    doc.setFillColor(...fill); doc.setDrawColor(...INK); doc.setLineWidth(0.5)
    doc.roundedRect(x, sy, w, h, 3, 3, 'FD')
  }
  const card = (x, cy, w, h, fill = BG) => {
    doc.setFillColor(...fill); doc.setDrawColor(...BORDER); doc.setLineWidth(0.3)
    doc.roundedRect(x, cy, w, h, 3, 3, 'FD')
  }

  // Logotype texte du site : HOPLALO + 'K d'une autre couleur
  const wordmark = (x, wy, size, color, colorK) => {
    text('HOPLALO', x, wy, { font: 'display', size, color })
    text("'K", x + doc.getTextWidth('HOPLALO'), wy, { font: 'display', size, color: colorK })
  }

  const newPage = () => {
    doc.addPage()
    gradient(0, 5)
    text(`Devis n° ${devis.numero} (suite)`, W - M, 12, { font: 'bold', size: 8, color: INK_SOFT, align: 'right' })
    y = 19
  }
  const ensureSpace = (h, onNewPage) => {
    if (y + h <= CONTENT_BOTTOM) return
    newPage()
    onNewPage?.()
  }

  // ── EN-TÊTE ───────────────────────────────────────────────────────────────
  gradient(0, HEADER_H)
  withOpacity(0.22, () => {
    doc.setFillColor(...WHITE)
    for (const [cx, cy, r] of BULLES) doc.circle(cx, cy, r, 'F')
  })
  withOpacity(0.2, () => wordmark(M + 0.7, 24.4, 40, INK, INK))
  wordmark(M, 23, 40, WHITE, YELLOW)
  text('Location de matériel festif en Alsace', M, 30.5, { font: 'bold', size: 10, color: WHITE })
  text('On livre, vous profitez.', M, 35.5, { size: 9, color: WHITE })

  const cardW = 66, cardX = W - M - cardW - 1.4, cardY = 7, cardH = 28
  sticker(cardX, cardY, cardW, cardH, WHITE)
  text('DEVIS', cardX + 6, cardY + 12, { font: 'display', size: 24 })
  text(`N° ${devis.numero}`, cardX + cardW - 6, cardY + 12, { font: 'display', size: 15, color: CORAL, align: 'right' })
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.3)
  doc.line(cardX + 6, cardY + 15.5, cardX + cardW - 6, cardY + 15.5)
  text('Émis le', cardX + 6, cardY + 20.5, { size: 8, color: INK_SOFT })
  text(format(emission, 'dd/MM/yyyy'), cardX + cardW - 6, cardY + 20.5, { font: 'bold', size: 8, align: 'right' })
  text("Valable jusqu'au", cardX + 6, cardY + 25, { size: 8, color: INK_SOFT })
  text(validite, cardX + cardW - 6, cardY + 25, { font: 'bold', size: 8, align: 'right' })

  y = HEADER_H + 8

  // ── CLIENT + ÉVÉNEMENT ────────────────────────────────────────────────────
  const colW = (INNER - 6) / 2
  const c    = devis.client ?? {}
  const nomComplet = [c.prenom, c.nom].filter(Boolean).join(' ')
  const clientRows = [
    c.societe  && { t: c.societe, font: 'bold', size: 10 },
    nomComplet && { t: nomComplet, font: c.societe ? 'body' : 'bold', size: c.societe ? 9 : 10 },
    c.adresse  && { t: c.adresse },
    (c.codePostal || c.ville) && { t: [c.codePostal, c.ville].filter(Boolean).join(' ') },
    c.telephone && { t: c.telephone },
    c.email     && { t: c.email },
  ].filter(Boolean).flatMap(row =>
    wrap(row.t, colW - 12, row.font ?? 'body', row.size ?? 9).map(t => ({ ...row, t }))
  )
  if (!clientRows.length) clientRows.push({ t: '—' })

  const EV_LABEL_W = 24
  const eventRows = [
    ['Début',     fmtDateHeure(devis.debut), 1],
    ['Fin',       fmtDateHeure(devis.fin), 1],
    ['Lieu',      oneLine(devis.lieu) || '—', 3],
    ['Livraison', devis.livraison ? 'Oui, avec installation' : 'Non', 1],
  ].map(([lab, val, max]) => ({ lab, vals: clampLines(wrap(val, colW - 12 - EV_LABEL_W, 'bold', 9), max) }))

  const LH      = 4.8
  const clientH = 14 + (clientRows.length - 1) * LH + 5.5
  const eventH  = 14 + (eventRows.reduce((n, r) => n + r.vals.length, 0) - 1) * LH + 5.5
  const infoH   = Math.max(32, clientH, eventH)

  card(M, y, colW, infoH)
  label('CLIENT', M + 6, y + 8)
  clientRows.forEach((row, i) => text(row.t, M + 6, y + 14 + i * LH, { font: row.font ?? 'body', size: row.size ?? 9 }))

  const evX = M + colW + 6
  card(evX, y, colW, infoH)
  label('VOTRE ÉVÉNEMENT', evX + 6, y + 8)
  let ey = y + 14
  for (const row of eventRows) {
    text(row.lab, evX + 6, ey, { size: 8.5, color: INK_SOFT })
    row.vals.forEach((v, i) => text(v, evX + 6 + EV_LABEL_W, ey + i * LH, { font: 'bold', size: 9 }))
    ey += row.vals.length * LH
  }
  y += infoH + 10

  // ── DÉTAIL ────────────────────────────────────────────────────────────────
  text('DÉTAIL DE LA PRESTATION', M, y, { font: 'display', size: 16 })
  y += 3.5

  const cols = avecTVA ? [
    { label: 'Désignation', x: M,       w: 86 },
    { label: 'Qté',         x: M + 86,  w: 14, align: 'center' },
    { label: 'PU HT',       x: M + 100, w: 26, align: 'right' },
    { label: 'PU TTC',      x: M + 126, w: 26, align: 'right' },
    { label: 'Total TTC',   x: M + 152, w: 30, align: 'right' },
  ] : [
    { label: 'Désignation',  x: M,       w: 112 },
    { label: 'Qté',          x: M + 112, w: 16, align: 'center' },
    { label: 'Prix unitaire', x: M + 128, w: 26, align: 'right' },
    { label: 'Total',        x: M + 154, w: 28, align: 'right' },
  ]
  const cellX = (col) => col.align === 'right' ? col.x + col.w - 5 : col.align === 'center' ? col.x + col.w / 2 : col.x + 5

  const drawTableHeader = () => {
    doc.setFillColor(...INK)
    doc.roundedRect(M, y, INNER, 9, 2.5, 2.5, 'F')
    doc.rect(M, y + 4, INNER, 5, 'F')
    for (const col of cols) {
      text(col.label.toUpperCase(), cellX(col), y + 5.9, { font: 'bold', size: 7.5, color: WHITE, align: col.align ?? 'left' })
    }
    y += 9
  }

  ensureSpace(9 + 14)
  drawTableHeader()
  for (const l of devis.lignes ?? []) {
    const qty     = l.quantite ?? 1
    const ttc     = l.prixTTC ?? null
    const titre   = clampLines(wrap(l.designation ?? '—', cols[0].w - 8, 'bold', 9.5), 2)
    const details = l.detail ? clampLines(wrap(l.detail, cols[0].w - 8, 'body', 7.8), 2) : []
    const rowH    = 6 + (titre.length - 1) * 4.2 + (details.length ? 3.8 + (details.length - 1) * 3.4 : 0) + 3
    ensureSpace(rowH, drawTableHeader)

    const base = y + 6
    titre.forEach((t, i) => text(t, cellX(cols[0]), base + i * 4.2, { font: 'bold', size: 9.5 }))
    const detailY = base + (titre.length - 1) * 4.2 + 3.8
    details.forEach((d, i) => text(d, cellX(cols[0]), detailY + i * 3.4, { size: 7.8, color: INK_SOFT }))

    // Montants négatifs (remise) en corail
    const amountColor = ttc != null && ttc < 0 ? CORAL : INK
    const cells = avecTVA
      ? [qty, ttc != null ? eur(ttc / (1 + TVA)) : '—', ttc != null ? eur(ttc) : '—', ttc != null ? eur(ttc * qty) : '—']
      : [qty, ttc != null ? eur(ttc) : '—', ttc != null ? eur(ttc * qty) : '—']
    cells.forEach((v, i) => {
      const col    = cols[i + 1]
      const isLast = i === cells.length - 1
      text(v, cellX(col), base, { font: isLast ? 'bold' : 'body', size: isLast ? 9.5 : 9, color: i === 0 ? INK : amountColor, align: col.align })
    })

    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3)
    doc.line(M, y + rowH, W - M, y + rowH)
    y += rowH
  }

  // ── TOTAUX (droite) + BON À SAVOIR / NOTES COURTES (gauche) ───────────────
  const totalTTC   = (devis.lignes ?? []).reduce((s, l) => s + (l.prixTTC ?? 0) * (l.quantite ?? 1), 0)
  const totalHT    = totalTTC / (1 + TVA)
  const montantTVA = totalTTC - totalHT

  const totW  = 82, totX = W - M - totW - 1.4
  const leftW = totX - M - 10
  const totRows = avecTVA ? [['Total HT', eur(totalHT)], ['TVA 20 %', eur(montantTVA)]] : []
  const totH    = totRows.length * 7 + (totRows.length ? 3 : 0) + 14 + 1.4

  const conditions = [
    `Devis valable ${VALIDITE_JOURS} jours, jusqu'au ${validite}.`,
    devis.cgvJointes && 'Nos conditions générales de location sont jointes à ce devis.',
  ].filter(Boolean).map(cond => wrap(cond, leftW - 4, 'body', 8.5))
  const notes       = (devis.notes ?? '').replace(/→/g, '->').replace(/←/g, '<-').trim()
  const shortNotes  = notes ? wrap(notes, leftW, 'body', 8.5) : []
  const notesBeside = shortNotes.length > 0 && shortNotes.length <= NOTES_BESIDE_MAX
  const leftH = 11 + conditions.reduce((h, rows) => h + rows.length * 4.2 + 1, 0)
              + (notesBeside ? 10 + shortNotes.length * 4.2 : 0)

  ensureSpace(6 + Math.max(totH, leftH))
  y += 6
  const top = y

  let ty = top
  for (const [lab, val] of totRows) {
    text(lab, totX + 2, ty + 4.8, { size: 9, color: INK_SOFT })
    text(val, W - M - 5, ty + 4.8, { font: 'bold', size: 9.5, align: 'right' })
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3)
    doc.line(totX, ty + 7, totX + totW, ty + 7)
    ty += 7
  }
  if (totRows.length) ty += 3
  sticker(totX, ty, totW, 14, YELLOW)
  text(avecTVA ? 'TOTAL TTC' : 'TOTAL', totX + 6, ty + 9.5, { font: 'display', size: 16 })
  text(eur(totalTTC), totX + totW - 6, ty + 10, { font: 'display', size: 20, align: 'right' })
  ty += 14 + 1.4

  let ly = top + 5
  label('BON À SAVOIR', M, ly, 11)
  ly += 6
  for (const rows of conditions) {
    doc.setFillColor(...CORAL); doc.circle(M + 1, ly - 1.1, 0.8, 'F')
    rows.forEach(l => { text(l, M + 4, ly, { size: 8.5, color: INK_SOFT }); ly += 4.2 })
    ly += 1
  }
  if (notesBeside) {
    ly += 4
    label('NOTES', M, ly, 11)
    ly += 6
    shortNotes.forEach(l => { text(l, M, ly, { size: 8.5, color: INK_SOFT }); ly += 4.2 })
  }
  y = Math.max(ty, ly) + 7

  // ── NOTES LONGUES (pleine largeur, sur plusieurs pages si besoin) ─────────
  if (notes && !notesBeside) {
    const noteLines = wrap(notes, INNER - 12, 'body', 9)
    let i = 0
    while (i < noteLines.length) {
      ensureSpace(15 + 3 * 4.4)
      const n = Math.max(1, Math.min(noteLines.length - i, Math.floor((CONTENT_BOTTOM - y - 15) / 4.4)))
      const h = 15 + n * 4.4
      card(M, y, INNER, h)
      label(i === 0 ? 'NOTES' : 'NOTES (SUITE)', M + 6, y + 8, 11)
      noteLines.slice(i, i + n).forEach((l, k) => text(l, M + 6, y + 14 + k * 4.4, { size: 9, color: INK_SOFT }))
      i += n
      y += h + 6
      if (i < noteLines.length) newPage()
    }
  }

  // ── SIGNATURES (collées en bas de page) ───────────────────────────────────
  const sigY = CONTENT_BOTTOM - SIG_H
  if (y > sigY - 4) newPage()
  const sigW = (INNER - 6) / 2
  const signatures = [
    ['LE CLIENT', 'Date, signature et mention « Bon pour accord »'],
    [ENTREPRISE.nom.toUpperCase(), 'Cachet et signature'],
  ]
  signatures.forEach(([titre, consigne], i) => {
    const x = M + i * (sigW + 6)
    card(x, sigY, sigW, SIG_H, WHITE)
    label(titre, x + 6, sigY + 8)
    text(consigne, x + 6, sigY + 13, { size: 7.8, color: INK_SOFT })
  })

  // ── PIED DE PAGE SUR TOUTES LES PAGES ─────────────────────────────────────
  const contact = [ENTREPRISE.telephone, ENTREPRISE.email, ENTREPRISE.site, ENTREPRISE.instagram].join('  ·  ')
  const legal   = `${ENTREPRISE.nom}  ·  ${ENTREPRISE.adresse}  ·  SIRET ${ENTREPRISE.siret}`
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.3)
    doc.line(M, FOOTER_TOP + 2, W - M, FOOTER_TOP + 2)
    wordmark(M, FOOTER_TOP + 11.5, 16, INK, CORAL)
    text(contact, W - M, FOOTER_TOP + 9, { font: 'bold', size: 8, align: 'right' })
    text(legal, W - M, FOOTER_TOP + 13.5, { size: 6.8, color: INK_SOFT, align: 'right' })
    if (pageCount > 1) text(`Page ${p}/${pageCount}`, M, FOOTER_TOP + 16, { size: 6.8, color: INK_SOFT })
    gradient(H - 3.5, 3.5)
  }

  return doc.output('arraybuffer')
}

// ── Utilitaires ──────────────────────────────────────────────────────────────
function registerFonts(doc, fonts) {
  const add = (key, family, style) => {
    if (!fonts?.[key]) return false
    doc.addFileToVFS(FONT_FILES[key], fonts[key])
    doc.addFont(FONT_FILES[key], family, style)
    return true
  }
  const bangers    = add('bangers', 'Bangers', 'normal')
  const nunito     = add('nunito', 'Nunito', 'normal')
  const nunitoBold = add('nunitoBold', 'Nunito', 'bold')
  return {
    display: bangers    ? ['Bangers', 'normal'] : ['helvetica', 'bold'],
    body:    nunito     ? ['Nunito', 'normal']  : ['helvetica', 'normal'],
    bold:    nunitoBold ? ['Nunito', 'bold']    : ['helvetica', 'bold'],
  }
}

function gradientColor(t) {
  const k = Math.min(Math.max(t, 0), 1)
  for (let i = 1; i < GRADIENT.length; i++) {
    const [p1, c1] = GRADIENT[i]
    if (k <= p1) {
      const [p0, c0] = GRADIENT[i - 1]
      const f = (k - p0) / (p1 - p0)
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * f))
    }
  }
  return GRADIENT[GRADIENT.length - 1][1]
}

function eur(n) {
  const [ent, dec] = Math.abs(n).toFixed(2).split('.')
  return `${n < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${dec} €`
}

function fmtDateHeure(d) {
  if (!d) return '—'
  const dt   = parseISO(d)
  const jour = format(dt, 'EEE d MMM yyyy', { locale: fr })
  const cap  = jour.charAt(0).toUpperCase() + jour.slice(1)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return cap
  const h = dt.getHours(), m = dt.getMinutes()
  if (!h && !m) return cap
  return `${cap} · ${h}h${m ? String(m).padStart(2, '0') : ''}`
}

function oneLine(str) {
  return (str ?? '').split('\n').map(l => l.trim()).filter(Boolean).join(', ')
}

function toBase64(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
