/**
 * Migration : articles (catalogue) → produits + création articles physiques
 *
 * Ce script :
 *   1. Crée la collection `produits` (ex-catalogue articles)
 *   2. Migre les données articles → produits (IDs conservés)
 *   3. Crée la junction reservations ↔ produits (M2M)
 *   4. Supprime l'ancien champ M2M `articles` sur reservations
 *   5. Supprime l'ancienne collection `articles`
 *   6. Crée la nouvelle collection `articles` (exemplaires physiques)
 *
 * Usage : node scripts/migrate-produits.js
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Charge le .env sans dépendance externe ────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const raw = readFileSync(resolve(__dirname, '../.env'), 'utf-8')
  for (const line of raw.split('\n')) {
    const idx = line.indexOf('=')
    if (idx < 1 || line.startsWith('#')) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    process.env[key] ??= val
  }
} catch { /* .env absent, on utilise les variables d'environnement système */ }

const BASE  = process.env.VITE_DIRECTUS_URL
const EMAIL = process.env.VITE_DIRECTUS_EMAIL
const PASS  = process.env.VITE_DIRECTUS_PASSWORD

if (!BASE || !EMAIL || !PASS) {
  console.error('❌  Variables manquantes : VITE_DIRECTUS_URL, VITE_DIRECTUS_EMAIL, VITE_DIRECTUS_PASSWORD')
  process.exit(1)
}

let token = null

// ── Helpers ───────────────────────────────────────────────────────────────────

async function auth() {
  const res  = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  })
  const json = await res.json()
  token = json.data?.access_token
  if (!token) throw new Error(`Auth échouée : ${JSON.stringify(json)}`)
  console.log('✓ Authentifié')
}

async function api(method, path, body) {
  const res  = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (method === 'DELETE' && res.status === 204) return null

  const json = await res.json()

  if (json.errors?.length) {
    const msg = json.errors[0]?.message ?? ''
    // Idempotent — on ignore les doublons
    if (/already exists|duplicate|Unique|already has an associated/i.test(msg)) return null
    throw new Error(msg)
  }
  return json.data ?? null
}

async function field(collection, name, type, meta = {}, schema = {}) {
  const res = await api('POST', `/fields/${collection}`, { field: name, type, meta, schema })
  console.log(res === null ? `  ~ ${name} existe déjà` : `  + ${name} (${type})`)
}

async function relation(body) {
  const res = await api('POST', '/relations', body)
  if (res !== null) console.log(`  ↔ relation ${body.collection}.${body.field} → ${body.related_collection}`)
}

// ── Étapes ────────────────────────────────────────────────────────────────────

async function step1_creer_produits() {
  console.log('\n[1/6] Création de la collection produits')
  await api('POST', '/collections', {
    collection: 'produits',
    meta: { icon: 'inventory_2', translations: [{ language: 'fr-FR', translation: 'Produits' }] },
    schema: {},
  })
  await field('produits', 'status',            'string',  {}, { default_value: 'draft' })
  await field('produits', 'name',              'string')
  await field('produits', 'slug',              'string',  {}, { is_unique: true })
  await field('produits', 'price',             'decimal')
  await field('produits', 'badge',             'string')
  await field('produits', 'short_description', 'text')
  await field('produits', 'long_description',  'text')
  await field('produits', 'images_urls',       'json')
  await field('produits', 'specs',             'json')
  await field('produits', 'category',          'integer', { interface: 'select-dropdown-m2o', special: ['m2o'] })
  console.log('✓ Collection produits prête')
}

async function step2_migrer_donnees() {
  console.log('\n[2/6] Migration articles → produits')
  const items = await api('GET', '/items/articles?limit=-1&fields=*')
  if (!items?.length) { console.log('~ Aucune donnée à migrer'); return }

  let ok = 0
  for (const a of items) {
    await api('POST', '/items/produits', {
      id:                a.id,
      status:            a.status,
      name:              a.name,
      slug:              a.slug,
      price:             a.price,
      badge:             a.badge,
      short_description: a.short_description,
      long_description:  a.long_description,
      images_urls:       a.images_urls,
      specs:             a.specs,
      category:          a.category,
    })
    ok++
  }
  console.log(`✓ ${ok} produits migrés`)
}

async function step3_junction_reservations_produits() {
  console.log('\n[3/6] Junction reservations ↔ produits (M2M)')
  await api('POST', '/collections', {
    collection: 'reservations_produits',
    meta: { hidden: true, icon: 'import_export' },
    schema: {},
  })
  await field('reservations_produits', 'reservations_id', 'integer', { hidden: true })
  await field('reservations_produits', 'produits_id',     'integer', { hidden: true })
  await field('reservations_produits', 'quantity',        'integer', {}, { default_value: 1 })
  await field('reservations_produits', 'unit_price',      'decimal')

  await relation({
    collection: 'reservations_produits',
    field: 'reservations_id',
    related_collection: 'reservations',
    meta: { one_field: 'produits', junction_field: 'produits_id' },
  })
  await relation({
    collection: 'reservations_produits',
    field: 'produits_id',
    related_collection: 'produits',
    meta: { junction_field: 'reservations_id' },
  })
  console.log('✓ Junction créée')
}

async function step4_supprimer_ancien_m2m() {
  console.log('\n[4/6] Suppression ancien champ M2M articles sur reservations')
  await api('DELETE', '/fields/reservations/articles')
  console.log('✓ Ancien M2M supprimé')
}

async function step5_supprimer_ancienne_collection() {
  console.log('\n[5/6] Suppression ancienne collection articles')
  await api('DELETE', '/collections/articles')
  console.log('✓ Ancienne collection supprimée')
}

async function step6_creer_articles_physiques() {
  console.log('\n[6/6] Création de la collection articles (exemplaires physiques)')
  await api('POST', '/collections', {
    collection: 'articles',
    meta: { icon: 'barcode', translations: [{ language: 'fr-FR', translation: 'Articles' }] },
    schema: {},
  })
  await field('articles', 'produit_id',    'integer', { interface: 'select-dropdown-m2o', special: ['m2o'] })
  await field('articles', 'reference',     'string',  {}, { is_unique: true })
  await field('articles', 'etat',          'string',  {}, { default_value: 'disponible' })
  await field('articles', 'entrepot_id',   'integer', { interface: 'select-dropdown-m2o', special: ['m2o'] })
  await field('articles', 'emplacement',   'string')
  await field('articles', 'date_achat',    'date')
  await field('articles', 'valeur_achat',  'decimal')
  await field('articles', 'notes',         'text')

  await relation({ collection: 'articles', field: 'produit_id',  related_collection: 'produits'  })
  await relation({ collection: 'articles', field: 'entrepot_id', related_collection: 'entrepots' })
  console.log('✓ Collection articles (physiques) créée')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await auth()
  await step1_creer_produits()
  await step2_migrer_donnees()
  await step3_junction_reservations_produits()
  await step4_supprimer_ancien_m2m()
  await step5_supprimer_ancienne_collection()
  await step6_creer_articles_physiques()

  console.log('\n✅  Migration terminée !')
  console.log('\nProchaines étapes frontend :')
  console.log('  • getArticles() → getProduits()  dans directus.js')
  console.log('  • Nouveau getArticles() pour les exemplaires physiques')
  console.log('  • Vue Produits (catalogue) + Vue Articles (inventaire)')
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1) })
