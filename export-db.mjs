#!/usr/bin/env node
/**
 * export-db.mjs — Export complet de la base Directus en JSON
 * Usage : node export-db.mjs  (depuis calendar/)
 * Génère : directus-export-YYYY-MM-DD.json
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// ── Chargement .env ──────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve('.env'), 'utf8')
    return Object.fromEntries(
      raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
    )
  } catch { console.error('❌  .env introuvable.'); process.exit(1) }
}

function resolveBase(envUrl) {
  if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl.replace(/\/$/, '')
  try {
    const vite = readFileSync(resolve('vite.config.ts'), 'utf8')
    const m = vite.match(/target\s*:\s*['"]([^'"]+)['"]/)
    if (m) return m[1].replace(/\/$/, '')
  } catch {}
  console.error('❌  URL Directus introuvable.'); process.exit(1)
}

const env  = loadEnv()
const BASE = resolveBase(env.VITE_DIRECTUS_URL ?? env.DIRECTUS_URL)

// ── API helper ───────────────────────────────────────────────────────────────
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

async function fetchCollection(token, name, params = {}) {
  const qs = new URLSearchParams({ limit: '-1', ...params }).toString()
  try {
    const data = await api('GET', `/items/${name}?${qs}`, null, token)
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.warn(`  ⚠️  ${name} : ${e.message}`)
    return []
  }
}

// ── Collections à exporter ───────────────────────────────────────────────────
const COLLECTIONS = [
  // Catalogue
  { name: 'produits',               fields: '*' },
  { name: 'gammes',                 fields: '*' },
  { name: 'gamme_consommables',     fields: '*' },
  { name: 'gamme_articles_materiel',fields: '*' },
  { name: 'produits_gammes',        fields: '*' },
  // Stock
  { name: 'articles',               fields: '*' },
  { name: 'entrepots',              fields: '*' },
  // Clients & CRM
  { name: 'clients',                fields: '*' },
  { name: 'contacts',               fields: '*' },
  { name: 'prospects',              fields: '*' },
  // Réservations
  { name: 'reservations',           fields: '*' },
  { name: 'reservations_produits',  fields: '*' },
  { name: 'reservations_articles',  fields: '*' },
  { name: 'reservations_consommables', fields: '*' },
  // Devis & Facturation
  { name: 'devis',                  fields: '*' },
  { name: 'factures',               fields: '*' },
  // Divers
  { name: 'commentaires',           fields: '*' },
  { name: 'faq',                    fields: '*' },
]

async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', { email: env.VITE_DIRECTUS_EMAIL, password: env.VITE_DIRECTUS_PASSWORD })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  const result = {
    exported_at: new Date().toISOString(),
    base_url: BASE,
    collections: {},
  }

  for (const col of COLLECTIONS) {
    process.stdout.write(`  📦  ${col.name.padEnd(32)}`)
    const rows = await fetchCollection(token, col.name, { fields: col.fields })
    result.collections[col.name] = rows
    console.log(`${String(rows.length).padStart(5)} enregistrements`)
  }

  // ── Fichier de sortie ────────────────────────────────────────────────────
  const date     = new Date().toISOString().slice(0, 10)
  const filename = `directus-export-${date}.json`
  writeFileSync(resolve(filename), JSON.stringify(result, null, 2), 'utf8')

  const total = Object.values(result.collections).reduce((s, v) => s + v.length, 0)
  console.log(`\n✅  Export terminé → ${filename}`)
  console.log(`   ${total} enregistrements au total\n`)
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  process.exit(1)
})
