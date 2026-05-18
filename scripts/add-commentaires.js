/**
 * Crée la collection `commentaires` dans Directus.
 * Usage:
 *   $env:VITE_DIRECTUS_URL="http://localhost:8055"
 *   $env:VITE_DIRECTUS_EMAIL="..."; $env:VITE_DIRECTUS_PASSWORD="..."
 *   node scripts/add-commentaires.js
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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
} catch { /* .env absent */ }

const BASE  = process.env.VITE_DIRECTUS_URL
const EMAIL = process.env.VITE_DIRECTUS_EMAIL
const PASS  = process.env.VITE_DIRECTUS_PASSWORD

if (!BASE || !EMAIL || !PASS) {
  console.error('❌  Variables manquantes : VITE_DIRECTUS_URL, VITE_DIRECTUS_EMAIL, VITE_DIRECTUS_PASSWORD')
  process.exit(1)
}

let token = null

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
    if (/already exists|duplicate|Unique/i.test(msg)) return null
    throw new Error(msg)
  }
  return json.data ?? null
}

async function field(collection, name, type, meta = {}, schema = {}) {
  const res = await api('POST', `/fields/${collection}`, { field: name, type, meta, schema })
  console.log(res === null ? `  ~ ${name} existe déjà` : `  + ${name} (${type})`)
}

async function main() {
  await auth()
  console.log('\n[1] Création de la collection commentaires')
  await api('POST', '/collections', {
    collection: 'commentaires',
    meta: { icon: 'chat', translations: [{ language: 'fr-FR', translation: 'Commentaires' }] },
    schema: {},
  })
  await field('commentaires', 'date_created', 'timestamp', { special: ['date-created'], readonly: true })
  await field('commentaires', 'record_type', 'string')
  await field('commentaires', 'record_id',   'string')
  await field('commentaires', 'author',       'string')
  await field('commentaires', 'text',         'text')
  console.log('✓ Collection commentaires créée')
  console.log('\n✅  Migration terminée !')
  console.log('Pensez à ajouter Read+Create+Delete sur commentaires dans Access Policies.')
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1) })
