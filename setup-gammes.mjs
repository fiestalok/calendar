#!/usr/bin/env node
/**
 * setup-gammes.mjs
 * Crée les collections gammes, gamme_consommables, produits_gammes, reservations_consommables
 *
 * Usage : node setup-gammes.mjs   (depuis le dossier calendar/)
 */

import { readFileSync } from 'fs'
import { resolve }      from 'path'

function loadEnv() {
  try {
    const raw = readFileSync(resolve('.env'), 'utf8')
    return Object.fromEntries(
      raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
    )
  } catch { console.error('❌  .env introuvable.'); process.exit(1) }
}

function resolveDirectusUrl(envUrl) {
  if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl.replace(/\/$/, '')
  try {
    const vite = readFileSync(resolve('vite.config.ts'), 'utf8')
    const m = vite.match(/target\s*:\s*['"]([^'"]+)['"]/)
    if (m) return m[1].replace(/\/$/, '')
  } catch {}
  console.error('❌  URL Directus introuvable.'); process.exit(1)
}

const env  = loadEnv()
const BASE = resolveDirectusUrl(env.VITE_DIRECTUS_URL ?? env.DIRECTUS_URL)

async function api(method, path, body = null, token = null) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message ?? json?.message ?? res.statusText
    throw Object.assign(new Error(msg), { status: res.status, path })
  }
  return json.data ?? json
}

async function ensureCollection(name, meta, token) {
  try {
    await api('GET', `/collections/${name}`, null, token)
    console.log(`    ⏭  Collection ${name} — existe`)
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api('POST', '/collections', { collection: name, meta, schema: {} }, token)
      console.log(`    ✅  Collection ${name} — créée`)
    } else throw e
  }
}

async function ensureField(collection, field, type, meta, schema, token) {
  try {
    const existing = await api('GET', `/fields/${collection}/${field}`, null, token)
    if (existing?.type !== type) {
      await api('PATCH', `/fields/${collection}/${field}`, { type, meta, schema }, token)
      console.log(`    ✅  ${collection}.${field} — type corrigé → ${type}`)
    } else {
      console.log(`    ⏭  ${collection}.${field} — existe (${type})`)
    }
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api('POST', `/fields/${collection}`, { field, type, meta, schema }, token)
      console.log(`    ✅  ${collection}.${field} — créé (${type})`)
    } else throw e
  }
}

async function ensureRelation(collection, field, relatedCollection, token) {
  try {
    const existing = await api('GET', `/relations/${collection}/${field}`, null, token)
    if (existing?.related_collection === relatedCollection) {
      console.log(`    ⏭  Relation ${collection}.${field} → ${relatedCollection} — existe`)
    } else {
      await api('PATCH', `/relations/${collection}/${field}`, { related_collection: relatedCollection }, token)
      console.log(`    ✅  Relation corrigée`)
    }
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api('POST', '/relations', { collection, field, related_collection: relatedCollection }, token)
      console.log(`    ✅  Relation ${collection}.${field} → ${relatedCollection} — créée`)
    } else {
      console.log(`    ⚠️   Relation ${collection}.${field} : ${e.message}`)
    }
  }
}

async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', { email: env.VITE_DIRECTUS_EMAIL, password: env.VITE_DIRECTUS_PASSWORD })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  // ── 1. Collection gammes ──────────────────────────────────────────────────
  console.log('📦  Collection: gammes')
  await ensureCollection('gammes', { icon: 'layers', color: '#7c3aed', display_template: '{{nom}}' }, token)
  await ensureField('gammes', 'nom',         'string',  { interface: 'input',    required: true }, { is_nullable: false, max_length: 255 }, token)
  await ensureField('gammes', 'description', 'text',    { interface: 'textarea', required: false }, { is_nullable: true }, token)
  console.log()

  // ── 2. Collection gamme_consommables ─────────────────────────────────────
  console.log('📦  Collection: gamme_consommables')
  await ensureCollection('gamme_consommables', { icon: 'category', color: '#a855f7', display_template: '{{nom}}' }, token)
  await ensureField('gamme_consommables', 'gamme_id',        'integer', { interface: 'select-dropdown-m2o', hidden: false }, { is_nullable: false }, token)
  await ensureField('gamme_consommables', 'nom',             'string',  { interface: 'input', required: true }, { is_nullable: false, max_length: 255 }, token)
  await ensureField('gamme_consommables', 'unite',           'string',  { interface: 'input', note: 'Ex: feuilles, m, rouleaux' }, { is_nullable: true, max_length: 50 }, token)
  await ensureField('gamme_consommables', 'quantite_defaut', 'integer', { interface: 'input', note: 'Quantité proposée par défaut' }, { is_nullable: true }, token)
  await ensureField('gamme_consommables', 'prix_unitaire',   'decimal', { interface: 'input', note: 'Prix en €' }, { is_nullable: true, numeric_precision: 10, numeric_scale: 2 }, token)
  await ensureField('gamme_consommables', 'stock',           'integer', { interface: 'input', note: 'Stock disponible' }, { is_nullable: true }, token)
  await ensureRelation('gamme_consommables', 'gamme_id', 'gammes', token)
  console.log()

  // ── 3. Collection produits_gammes (M2M junction) ─────────────────────────
  console.log('📦  Collection: produits_gammes')
  await ensureCollection('produits_gammes', { icon: 'link', hidden: true }, token)
  await ensureField('produits_gammes', 'produit_id', 'integer', { interface: 'select-dropdown-m2o', hidden: false }, { is_nullable: false }, token)
  await ensureField('produits_gammes', 'gamme_id',   'integer', { interface: 'select-dropdown-m2o', hidden: false }, { is_nullable: false }, token)
  await ensureRelation('produits_gammes', 'produit_id', 'produits', token)
  await ensureRelation('produits_gammes', 'gamme_id',   'gammes',   token)
  console.log()

  // ── 4. Collection reservations_consommables ───────────────────────────────
  console.log('📦  Collection: reservations_consommables')
  await ensureCollection('reservations_consommables', { icon: 'receipt_long', hidden: true }, token)
  await ensureField('reservations_consommables', 'reservations_id',  'integer', { interface: 'select-dropdown-m2o', hidden: false }, { is_nullable: false }, token)
  await ensureField('reservations_consommables', 'consommable_id',   'integer', { interface: 'select-dropdown-m2o', hidden: false }, { is_nullable: false }, token)
  await ensureField('reservations_consommables', 'quantite',         'integer', { interface: 'input' }, { is_nullable: false }, token)
  await ensureRelation('reservations_consommables', 'reservations_id', 'reservations',       token)
  await ensureRelation('reservations_consommables', 'consommable_id',  'gamme_consommables', token)
  console.log()

  console.log('─────────────────────────────────────────────')
  console.log('🎉  Setup terminé !\n')
  console.log('    ⚠️  Configurer les permissions dans Directus UI :')
  console.log('    Politiques d\'accès → ta politique → chacune des 4 nouvelles collections → *\n')
  console.log('    Collections créées :')
  console.log('    • gammes')
  console.log('    • gamme_consommables')
  console.log('    • produits_gammes')
  console.log('    • reservations_consommables\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  process.exit(1)
})
