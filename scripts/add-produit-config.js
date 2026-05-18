/**
 * Ajoute les champs jours_avant / jours_apres sur la collection produits
 * Usage : node scripts/add-produit-config.js
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
    process.env[line.slice(0, idx).trim()] ??= line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const BASE  = process.env.VITE_DIRECTUS_URL
const EMAIL = process.env.VITE_DIRECTUS_EMAIL
const PASS  = process.env.VITE_DIRECTUS_PASSWORD

let token = null

async function auth() {
  const res  = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  })
  token = (await res.json()).data?.access_token
  if (!token) throw new Error('Auth échouée')
  console.log('✓ Authentifié')
}

async function addField(collection, field, type, schema = {}) {
  const res  = await fetch(`${BASE}/fields/${collection}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ field, type, schema }),
  })
  const json = await res.json()
  if (json.errors?.length) {
    const msg = json.errors[0].message
    if (/already exists/i.test(msg)) { console.log(`  ~ ${field} déjà présent`); return }
    throw new Error(msg)
  }
  console.log(`  + ${field} (${type})`)
}

async function main() {
  await auth()
  console.log('\nAjout des champs de configuration sur produits…')
  await addField('produits', 'jours_avant', 'integer', { default_value: 0 })
  await addField('produits', 'jours_apres', 'integer', { default_value: 0 })
  console.log('\n✅ Terminé — relance le front pour voir les changements.')
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
