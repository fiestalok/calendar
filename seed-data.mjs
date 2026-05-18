#!/usr/bin/env node
/**
 * seed-data.mjs
 * Crée les produits, articles et les lie aux entrepôts.
 *
 * Produits créés :
 *   • Chateau gonflable croco XL
 *   • Tonelle 4x4
 *   • Photobooth premium
 *
 * Articles (6 total, répartis moitié/moitié) :
 *   • CG-001   → Chateau gonflable croco XL → francois home
 *   • TON-001  → Tonelle 4x4               → francois home
 *   • TON-002  → Tonelle 4x4               → francois home
 *   • TON-003  → Tonelle 4x4               → jonathan home
 *   • PB-001   → Photobooth premium         → jonathan home
 *   • PB-002   → Photobooth premium         → jonathan home
 *
 * Usage : node seed-data.mjs   (depuis le dossier calendar/)
 */

import { readFileSync } from 'fs'
import { resolve }      from 'path'

// ── .env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve('.env'), 'utf8')
    return Object.fromEntries(
      raw.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
    )
  } catch {
    console.error('❌  Fichier .env introuvable. Lancez le script depuis calendar/')
    process.exit(1)
  }
}

function resolveDirectusUrl(envUrl) {
  if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl.replace(/\/$/, '')
  try {
    const vite = readFileSync(resolve('vite.config.ts'), 'utf8')
    const m = vite.match(/target\s*:\s*['"]([^'"]+)['"]/)
    if (m) return m[1].replace(/\/$/, '')
  } catch { /* pas de vite.config */ }
  console.error('❌  Impossible de déterminer l\'URL Directus.')
  process.exit(1)
}

const env      = loadEnv()
const BASE     = resolveDirectusUrl(env.VITE_DIRECTUS_URL ?? env.DIRECTUS_URL)
const EMAIL    = env.VITE_DIRECTUS_EMAIL
const PASSWORD = env.VITE_DIRECTUS_PASSWORD

// ── HTTP ──────────────────────────────────────────────────────────────────────
async function api(method, path, body = null, token = null) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.errors?.[0]?.message ?? json?.message ?? res.statusText
    throw Object.assign(new Error(msg), { status: res.status, path })
  }
  return json.data ?? json
}

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  // ── 1. Entrepôts ────────────────────────────────────────────────────────────
  console.log('🏠  Entrepôts')
  const rawEntrepots = await api('GET', '/items/entrepots?fields=id,nom&limit=100', null, token)
  const entrepots = rawEntrepots ?? []

  async function ensureEntrepot(nom) {
    const found = entrepots.find(e => e.nom?.toLowerCase() === nom.toLowerCase())
    if (found) {
      console.log(`    ⏭  "${nom}" — déjà présent (id ${found.id})`)
      return found.id
    }
    const created = await api('POST', '/items/entrepots', { nom }, token)
    console.log(`    ✅  "${nom}" — créé (id ${created.id})`)
    return created.id
  }

  const idFrancois  = await ensureEntrepot('francois home')
  const idJonathan  = await ensureEntrepot('jonathan home')

  // ── 2. Produits ─────────────────────────────────────────────────────────────
  console.log('\n📦  Produits')

  const PRODUITS_DEF = [
    { name: 'Chateau gonflable croco XL', prefix: 'CG',  qty: 1 },
    { name: 'Tonelle 4x4',                prefix: 'TON', qty: 3 },
    { name: 'Photobooth premium',          prefix: 'PB',  qty: 2 },
  ]

  // Vérifie si un produit avec ce nom existe déjà
  const rawProduits = await api(
    'GET', '/items/produits?fields=id,name&limit=100', null, token
  )
  const existing = rawProduits ?? []

  async function ensureProduit(name) {
    const found = existing.find(p => p.name?.toLowerCase() === name.toLowerCase())
    if (found) {
      console.log(`    ⏭  "${name}" — déjà présent (id ${found.id})`)
      return found.id
    }
    const created = await api('POST', '/items/produits', {
      name,
      slug:   slugify(name),
      status: 'published',
    }, token)
    console.log(`    ✅  "${name}" — créé (id ${created.id})`)
    return created.id
  }

  const produitIds = {}
  for (const p of PRODUITS_DEF) {
    produitIds[p.prefix] = await ensureProduit(p.name)
  }

  // ── 3. Articles ─────────────────────────────────────────────────────────────
  console.log('\n🔖  Articles')

  //  Répartition moitié/moitié :
  //  francois home (3) : CG-001, TON-001, TON-002
  //  jonathan home (3) : TON-003, PB-001, PB-002
  const ARTICLES = [
    { reference: 'CG-001',  produit: 'CG',  entrepot: idFrancois, label: 'Chateau gonflable croco XL' },
    { reference: 'TON-001', produit: 'TON', entrepot: idFrancois, label: 'Tonelle 4x4' },
    { reference: 'TON-002', produit: 'TON', entrepot: idFrancois, label: 'Tonelle 4x4' },
    { reference: 'TON-003', produit: 'TON', entrepot: idJonathan, label: 'Tonelle 4x4' },
    { reference: 'PB-001',  produit: 'PB',  entrepot: idJonathan, label: 'Photobooth premium' },
    { reference: 'PB-002',  produit: 'PB',  entrepot: idJonathan, label: 'Photobooth premium' },
  ]

  // Récupère les références déjà en base pour éviter les doublons
  const rawArticles = await api(
    'GET', '/items/articles?fields=reference&limit=500', null, token
  )
  const existingRefs = new Set((rawArticles ?? []).map(a => a.reference))

  for (const a of ARTICLES) {
    if (existingRefs.has(a.reference)) {
      console.log(`    ⏭  ${a.reference} — déjà présent`)
      continue
    }
    await api('POST', '/items/articles', {
      reference:   a.reference,
      produit_id:  produitIds[a.produit],
      entrepot_id: a.entrepot,
      etat:        'disponible',
    }, token)
    const loc = a.entrepot === idFrancois ? 'francois home' : 'jonathan home'
    console.log(`    ✅  ${a.reference}  (${a.label})  →  ${loc}`)
  }

  // ── 4. Résumé ────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────')
  console.log('🎉  Seed terminé !\n')
  console.log('Répartition :')
  console.log('  francois home  →  CG-001, TON-001, TON-002')
  console.log('  jonathan home  →  TON-003, PB-001, PB-002\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  process.exit(1)
})
