import axios from 'axios'

const BASE_URL = import.meta.env.VITE_DIRECTUS_URL

const REFRESH_MARGIN = 60_000   // renouvelle l'access token 1 min avant son expiration
const RETRY_OFFLINE  = 30_000   // nouvel essai si le serveur est injoignable

let accessToken = null
let refreshToken = null
let expiresAt = 0               // échéance de l'access token (ms), 0 = inconnue
let refreshing = null           // renouvellement en cours, partagé par toutes les requêtes
let refreshTimer = null
let onExpiredCallback = null
let onRefreshCallback = null
let loadStoredTokens = () => null

export function setTokens(access, refresh, expires = 0) {
  accessToken = access
  refreshToken = refresh ?? null
  expiresAt = expires ?? 0
  scheduleRefresh()
}

export function clearTokens() {
  accessToken = null
  refreshToken = null
  expiresAt = 0
  clearTimeout(refreshTimer)
}

export function assetUrl(fileId) {
  if (!fileId) return null
  const base = BASE_URL.replace(/\/$/, '')
  const token = accessToken ? `?access_token=${accessToken}` : ''
  return `${base}/assets/${fileId}${token}`
}

export function setOnExpired(cb) { onExpiredCallback = cb }
export function setOnRefresh(cb) { onRefreshCallback = cb }
// Lecture des jetons enregistrés, éventuellement renouvelés par un autre onglet
export function setTokenLoader(fn) { loadStoredTokens = fn }

// Directus n'accepte chaque refresh token qu'une fois : un seul renouvellement à la fois
// dans l'onglet, et entre onglets grâce au verrou du navigateur.
// Résultat : 'ok' | 'expired' (session vraiment terminée) | 'offline' (serveur injoignable)
function tryRefresh() {
  const locks = globalThis.navigator?.locks
  refreshing ??= (locks ? locks.request('hoplalok-token-refresh', refresh) : refresh())
    .finally(() => { refreshing = null })
  return refreshing
}

async function refresh() {
  if (adoptStoredTokens() && expiresAt - Date.now() > REFRESH_MARGIN) return 'ok'
  if (!refreshToken) return 'expired'
  const sent = refreshToken
  try {
    const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: sent, mode: 'json' })
    const { access_token, refresh_token, expires } = data.data
    setTokens(access_token, refresh_token, Date.now() + expires)
    onRefreshCallback?.(accessToken, refreshToken, expiresAt)
    return 'ok'
  } catch (err) {
    if (!err.response) return 'offline'
    return adoptStoredTokens() ? 'ok' : 'expired'
  }
}

// Reprend les jetons enregistrés s'ils sont plus récents que les nôtres
function adoptStoredTokens() {
  const stored = loadStoredTokens()
  if (!stored?.refresh || stored.refresh === refreshToken) return false
  setTokens(stored.access, stored.refresh, stored.expires)
  return true
}

function scheduleRefresh(delay = expiresAt ? expiresAt - Date.now() - REFRESH_MARGIN : null) {
  clearTimeout(refreshTimer)
  if (!refreshToken || delay == null) return
  refreshTimer = setTimeout(async () => {
    const result = await tryRefresh()
    if (result === 'expired') onExpiredCallback?.()
    if (result === 'offline') scheduleRefresh(RETRY_OFFLINE)
  }, Math.max(delay, 0))
}

// Les minuteurs sont ralentis quand l'onglet est en arrière-plan : on vérifie au retour
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && expiresAt && expiresAt - Date.now() < REFRESH_MARGIN) scheduleRefresh(0)
  })
}

async function renewSession() {
  const result = await tryRefresh()
  if (result === 'expired') onExpiredCallback?.()
  return result === 'ok'
}

const authHeaders = () => accessToken ? { Authorization: `Bearer ${accessToken}` } : {}

// Envoie la requête ; sur 401, renouvelle la session (sauf si c'est déjà fait) puis réessaie une fois
async function withAuth(send) {
  const sentWith = accessToken
  try {
    return (await send()).data.data
  } catch (err) {
    if (err.response?.status !== 401) throw err
    if (accessToken === sentWith && !(await renewSession())) throw err
    return (await send()).data.data
  }
}

export async function loginDirectus(email, password) {
  const { data } = await axios.post(`${BASE_URL}/auth/login`, { email, password, mode: 'json' })
  return data.data // { access_token, refresh_token, expires }
}

export async function getMe(token) {
  const { data } = await axios.get(`${BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return data.data
}

function request(method, path, body = null, params = null) {
  return withAuth(() => axios({
    method,
    url: `${BASE_URL}${path}`,
    headers: authHeaders(),
    data: body,
    params
  }))
}

export const getReservations = (params = {}) =>
  request('GET', '/items/reservations', null, {
    fields: [
      'id', 'date_start', 'date_end', 'status', 'delivery',
      'delivery_address', 'total_price', 'notes',
      'client.id', 'client.first_name', 'client.last_name', 'client.company_name',
      'client.email', 'client.phone', 'client.address', 'client.zip_code', 'client.city',
    ].join(','),
    sort: 'date_start',
    limit: -1,
    ...params
  })

export const getReservationsByClient = (clientId) =>
  request('GET', '/items/reservations', null, {
    fields: ['id', 'date_start', 'date_end', 'status', 'delivery', 'delivery_address', 'total_price', 'notes',
             'fichier_devis', 'fichier_devis_signe', 'fichier_facture'].join(','),
    filter: { client: { _eq: clientId } },
    sort: '-date_start',
    limit: -1,
  }).catch(() => [])

export const getReservationProduits = (reservationId) =>
  request('GET', '/items/reservations_produits', null, {
    filter: { reservations_id: { _eq: reservationId } },
    fields: 'id,produits_id.id,produits_id.name,produits_id.images_urls,produits_id.image,produits_id.price,quantity,unit_price',
    limit: -1,
  }).catch(err => { console.warn('[getReservationProduits]', err.message); return [] })

export const getReservationArticles = (reservationId) =>
  request('GET', '/items/reservations_articles', null, {
    filter: { reservations_id: { _eq: reservationId } },
    fields: 'id,articles_id.id,articles_id.type,articles_id.name,articles_id.reference,articles_id.notes,articles_id.etat,articles_id.produit_id.id,articles_id.produit_id.name,articles_id.entrepot_id.nom',
    limit: -1,
  }).catch(() => [])

// Fetch only the FK integer values from the junction (works even if relation expansion is blocked)
export const getReservationArticleIds = (reservationId) =>
  request('GET', '/items/reservations_articles', null, {
    filter: { reservations_id: { _eq: reservationId } },
    fields: 'id,articles_id',
    limit: -1,
  }).catch(() => [])

// Query articles directly via implied O2M — bypasses reservations_articles field permissions
export const getArticlesForReservation = (reservationId) =>
  request('GET', '/items/articles', null, {
    filter: { reservations_articles: { reservations_id: { _eq: reservationId } } },
    fields: 'id,name,reference,notes,etat,produit_id.id,produit_id.name,entrepot_id.id,entrepot_id.nom',
    limit: -1,
  }).catch(() => [])

export const getArticlesByIds = (ids) =>
  request('GET', '/items/articles', null, {
    filter: { id: { _in: ids } },
    fields: 'id,type,name,reference,notes,etat,produit_id.id,produit_id.name,entrepot_id.id,entrepot_id.nom',
    limit: -1,
  }).catch(() => [])

export const deleteReservationArticle = (id) =>
  request('DELETE', `/items/reservations_articles/${id}`)

export const getReservationValidation = (id) =>
  request('GET', `/items/reservations/${id}`, null, {
    fields: 'devis_realise_par,devis_confirme_par,terminee_par,fichier_devis_signe,fichier_devis,fichier_facture,livraison,installation',
  }).catch(() => ({}))

// Paramètres du devis enregistrés sur la réservation. Requête à part : tant que ces champs
// n'existent pas dans Directus (voir update-directus-v5.mjs), elle échoue sans gêner le reste.
export const getReservationDevisOptions = (id) =>
  request('GET', `/items/reservations/${id}`, null, {
    fields: 'distance_km,remise,remise_libelle,remise_montant',
  }).catch(() => null)

export const patchReservation = (id, data) =>
  request('PATCH', `/items/reservations/${id}`, data)

export const createReservation = (data) => request('POST', '/items/reservations', data)
export const createReservationProduit = (data) => request('POST', '/items/reservations_produits', data)
export const deleteReservationProduit = (id) => request('DELETE', `/items/reservations_produits/${id}`)

export const getClients = (params = {}) =>
  request('GET', '/items/clients', null, {
    fields: [
      'id', 'date_created', 'typeClient',
      'first_name', 'last_name', 'company_name',
      'email', 'phone', 'address', 'city', 'zip_code',
      'siret', 'secteur', 'notes',
    ].join(','),
    limit: -1,
    sort: 'last_name,company_name',
    ...params,
  })

export const getAllDevis = (params = {}) =>
  request('GET', '/items/devis', null, {
    fields: [
      'id', 'date_created', 'client',
      'numero', 'statut', 'montant', 'description', 'valid_until', 'facture_ref',
      'facture.id', 'facture.numero',
      'fichier',
      'reservation',
    ].join(','),
    limit: -1,
    sort: '-date_created',
    ...params,
  })

export const getAllReservationsProduits = () =>
  request('GET', '/items/reservations_produits', null, {
    fields: 'reservations_id,produits_id.id,produits_id.name,produits_id.jours_avant,produits_id.jours_apres',
    limit: -1,
  }).catch(err => { console.warn('[reservations_produits]', err.message); return [] })

export const getFactures = () =>
  request('GET', '/items/factures', null, {
    fields: ['id', 'numero', 'date_created', 'montant'].join(','),
    limit: -1,
    sort: '-date_created',
  }).catch(() => [])

export function getFileUrl(fileId) {
  if (!fileId) return null
  const params = accessToken ? `?access_token=${accessToken}` : ''
  return `${BASE_URL}/assets/${fileId}${params}`
}

export const getContacts = () =>
  request('GET', '/items/contacts', null, { limit: -1, sort: 'nom' })

export const getProspects = () =>
  request('GET', '/items/prospects', null, { limit: -1, sort: '-date_created' })

export const getEntrepots = () =>
  request('GET', '/items/entrepots', null, { limit: -1 })

export const getProduits = (params = {}) =>
  request('GET', '/items/produits', null, {
    fields: [
      'id', 'status', 'name', 'slug', 'price', 'badge',
      'short_description', 'long_description', 'images_urls', 'image', 'specs',
      'jours_avant', 'jours_apres',
      'category.id', 'category.name',
    ].join(','),
    limit: -1,
    sort: 'name',
    ...params,
  })

export const patchProduit = (id, data) =>
  request('PATCH', `/items/produits/${id}`, data)

export const getReservationsByProduit = (produitId) =>
  request('GET', '/items/reservations_produits', null, {
    filter: { produits_id: { _eq: produitId } },
    fields: 'reservations_id.id,reservations_id.date_start,reservations_id.date_end,reservations_id.status',
    limit: -1,
  })

export const getReservationsByArticle = (articleId) =>
  request('GET', '/items/reservations_articles', null, {
    filter: { articles_id: { _eq: articleId } },
    fields: 'reservations_id.id,reservations_id.date_start,reservations_id.date_end,reservations_id.status',
    limit: -1,
  }).catch(() => [])

export const getArticles = (params = {}) =>
  request('GET', '/items/articles', null, {
    fields: [
      'id', 'type', 'name', 'reference', 'etat', 'emplacement', 'date_achat', 'valeur_achat', 'notes',
      'produit_id.id', 'produit_id.name',
      'entrepot_id.id', 'entrepot_id.nom',
    ].join(','),
    limit: -1,
    sort: 'reference',
    ...params,
  })

export const getFaq = () =>
  request('GET', '/items/faq', null, { limit: -1, sort: 'sort' })

export const createArticle = (data) =>
  request('POST', '/items/articles', data)

export const patchArticle = (id, data) =>
  request('PATCH', `/items/articles/${id}`, data)

export const deleteArticle = (id) =>
  request('DELETE', `/items/articles/${id}`)

// ── Clients CRUD ───────────────────────────────────────────────────────────────
export const createClient = (data) => request('POST', '/items/clients', data)
export const patchClient  = (id, data) => request('PATCH', `/items/clients/${id}`, data)
export const deleteClient = (id) => request('DELETE', `/items/clients/${id}`)

// ── Contacts CRUD ──────────────────────────────────────────────────────────────
export const createContact = (data) => request('POST', '/items/contacts', data)
export const patchContact  = (id, data) => request('PATCH', `/items/contacts/${id}`, data)
export const deleteContact = (id) => request('DELETE', `/items/contacts/${id}`)

// ── Prospects CRUD ─────────────────────────────────────────────────────────────
export const createProspect = (data) => request('POST', '/items/prospects', data)
export const patchProspect  = (id, data) => request('PATCH', `/items/prospects/${id}`, data)
export const deleteProspect = (id) => request('DELETE', `/items/prospects/${id}`)

// ── Produits CRUD (patchProduit déjà défini) ───────────────────────────────────
export const createProduit = (data) => request('POST', '/items/produits', data)
export const deleteProduit = (id) => request('DELETE', `/items/produits/${id}`)

// ── Commentaires CRUD ──────────────────────────────────────────────────────────
export const getCommentaires = (recordType, recordId) =>
  request('GET', '/items/commentaires', null, {
    filter: { _and: [{ record_type: { _eq: recordType } }, { record_id: { _eq: String(recordId) } }] },
    fields: 'id,date_created,author,text',
    sort: 'date_created',
    limit: -1,
  })
export const createCommentaire = (data) => request('POST', '/items/commentaires', data)
export const deleteCommentaire = (id) => request('DELETE', `/items/commentaires/${id}`)

// ── Devis CRUD ─────────────────────────────────────────────────────────────────
export const createDevis = (data) => request('POST', '/items/devis', data)
export const patchDevis  = (id, data) => request('PATCH', `/items/devis/${id}`, data)
export const deleteDevis = (id) => request('DELETE', `/items/devis/${id}`)

// ── Articles par produit + lien réservation_articles ───────────────────────────
export const getArticlesByProduit = (produitIds) =>
  request('GET', '/items/articles', null, {
    filter: { produit_id: { _in: Array.isArray(produitIds) ? produitIds : [produitIds] } },
    fields: 'id,name,reference,etat,emplacement,date_achat,valeur_achat,notes,produit_id.id,produit_id.name,entrepot_id.id,entrepot_id.nom',
    limit: -1,
    sort: 'reference',
  }).catch(() => [])

export const createReservationArticle = (data) =>
  request('POST', '/items/reservations_articles', data)

// Retourne les IDs d'articles déjà liés à une autre réservation sur la même plage de dates
export const getReservedArticleIdsForDates = (articleIds, dateStart, dateEnd, excludeResaId) =>
  request('GET', '/items/reservations_articles', null, {
    filter: {
      _and: [
        { articles_id: { _in: articleIds } },
        { reservations_id: { status: { _neq: 'annulee' } } },
        { reservations_id: { date_start: { _lte: dateEnd } } },
        { reservations_id: { date_end: { _gte: dateStart } } },
        ...(excludeResaId ? [{ reservations_id: { _neq: excludeResaId } }] : []),
      ],
    },
    fields: 'articles_id',
    limit: -1,
  }).then(rows => rows.map(r => r.articles_id))
  .catch(() => [])

// ── Gammes ─────────────────────────────────────────────────────────────────
export const getGammes = () =>
  request('GET', '/items/gammes', null, {
    fields: 'id,nom,description',
    sort: 'nom',
    limit: -1,
  }).catch(() => [])

export const createGamme = (data) => request('POST', '/items/gammes', data)
export const patchGamme  = (id, data) => request('PATCH', `/items/gammes/${id}`, data)
export const deleteGamme = (id) => request('DELETE', `/items/gammes/${id}`)

// ── Consommables (catalogue stock) ──────────────────────────────────────────
const CONSO_FIELDS       = 'id,nom,unite,stock,seuil_alerte,prix_unitaire,description'
const GAMME_CONSO_FIELDS = 'id,gamme_id,quantite_defaut,consommable_id.id,consommable_id.nom,consommable_id.unite,consommable_id.stock,consommable_id.seuil_alerte,consommable_id.prix_unitaire'

export const getConsommables = (filter = {}) =>
  request('GET', '/items/consommables', null, {
    fields: CONSO_FIELDS,
    sort: 'nom',
    limit: -1,
    ...(Object.keys(filter).length ? { filter } : {}),
  }).catch(() => [])

export const getAllGammeConsommables = () =>
  request('GET', '/items/gamme_consommables', null, {
    fields: GAMME_CONSO_FIELDS,
    sort: 'consommable_id.nom',
    limit: -1,
  }).catch(() => [])

export const getConsommablesByGammes = (gammeIds) =>
  request('GET', '/items/gamme_consommables', null, {
    filter: { gamme_id: { _in: gammeIds } },
    fields: GAMME_CONSO_FIELDS,
    sort: 'consommable_id.nom',
    limit: -1,
  }).catch(() => [])

export const createConsommable      = (data) => request('POST', '/items/consommables', data)
export const patchConsommable       = (id, data) => request('PATCH', `/items/consommables/${id}`, data)
export const deleteConsommable      = (id) => request('DELETE', `/items/consommables/${id}`)

export const createGammeConsommable = (data) => request('POST', '/items/gamme_consommables', data)
export const patchGammeConsommable  = (id, data) => request('PATCH', `/items/gamme_consommables/${id}`, data)
export const deleteGammeConsommable = (id) => request('DELETE', `/items/gamme_consommables/${id}`)

// ── Gammes ↔ Articles secondaires (matériel d'exploitation) ────────────────
export const getGammeArticlesMateriel = (gammeIds) =>
  request('GET', '/items/gamme_articles_materiel', null, {
    filter: { gamme_id: { _in: Array.isArray(gammeIds) ? gammeIds : [gammeIds] } },
    fields: 'id,gamme_id,article_id.id,article_id.type,article_id.name,article_id.reference,article_id.etat,article_id.produit_id.name,article_id.entrepot_id.nom',
    limit: -1,
  }).catch(() => [])

export const getAllGammeArticlesMateriel = () =>
  request('GET', '/items/gamme_articles_materiel', null, {
    fields: 'id,gamme_id,article_id',
    limit: -1,
  }).catch(() => [])

export const createGammeArticleMateriel = (data) => request('POST', '/items/gamme_articles_materiel', data)
export const deleteGammeArticleMateriel = (id)    => request('DELETE', `/items/gamme_articles_materiel/${id}`)

export const getAllArticlesSecondaires = () =>
  request('GET', '/items/articles', null, {
    filter: { type: { _eq: 'secondaire' } },
    fields: 'id,name,reference,etat,produit_id.id,produit_id.name,entrepot_id.id,entrepot_id.nom',
    sort: 'reference',
    limit: -1,
  }).catch(() => [])

// ── Produits ↔ Gammes (M2M) ─────────────────────────────────────────────────
export const getProduitGammes = (params = {}) =>
  request('GET', '/items/produits_gammes', null, {
    fields: 'id,produit_id,gamme_id',
    limit: -1,
    ...params,
  }).catch(() => [])

export const createProduitGamme = (data) => request('POST', '/items/produits_gammes', data)
export const deleteProduitGamme = (id)    => request('DELETE', `/items/produits_gammes/${id}`)

// ── Réservations ↔ Consommables ─────────────────────────────────────────────
export const getReservationConsommables = (reservationId) =>
  request('GET', '/items/reservations_consommables', null, {
    filter: { reservations_id: { _eq: reservationId } },
    fields: 'id,quantite,quantite_confirmee,consommable_id.id,consommable_id.nom,consommable_id.unite,consommable_id.stock,consommable_id.prix_unitaire',
    limit: -1,
  }).catch(() => [])

export const createReservationConsommable = (data) =>
  request('POST', '/items/reservations_consommables', data)

export const deleteReservationConsommable = (id) =>
  request('DELETE', `/items/reservations_consommables/${id}`)

// ── Produits images (M2M) ─────────────────────────────────────────────────────
export const getProductImages = (produitId) =>
  request('GET', '/items/produits_images', null, {
    filter: { produit_id: { _eq: produitId } },
    fields: 'id,produit_id,directus_files_id,sort',
    sort: 'sort',
    limit: -1,
  })

export const addProductImage = (produitId, fileId) =>
  request('POST', '/items/produits_images', { produit_id: produitId, directus_files_id: fileId })

export const removeProductImage = (id) =>
  request('DELETE', `/items/produits_images/${id}`)

// ── File upload ────────────────────────────────────────────────────────────────
export function uploadFile(formData) {
  return withAuth(() => axios.post(`${BASE_URL}/files`, formData, { headers: authHeaders() }))
}
