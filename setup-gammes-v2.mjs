#!/usr/bin/env node
/**
 * setup-gammes-v2.mjs
 * Ajoute le champ "type" à gamme_consommables :
 *   - type: 'consommable' | 'materiel'  (défaut: 'consommable')
 *
 * Usage : node setup-gammes-v2.mjs   (depuis le dossier calendar/)
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

async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', { email: env.VITE_DIRECTUS_EMAIL, password: env.VITE_DIRECTUS_PASSWORD })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  console.log('📋  Ajout du champ "type" à gamme_consommables…')
  try {
    await api('GET', '/fields/gamme_consommables/type', null, token)
    console.log('    ⏭  type — déjà existant')
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api('POST', '/fields/gamme_consommables', {
        field: 'type',
        type: 'string',
        meta: {
          interface: 'select-dropdown',
          options: {
            choices: [
              { text: 'Consommable', value: 'consommable' },
              { text: "Matériel d'exploitation", value: 'materiel' },
            ],
          },
          note: 'consommable = stock décrément définitif / matériel = restauré à la fin de résa',
          required: true,
          hidden: false,
        },
        schema: { is_nullable: false, default_value: 'consommable', max_length: 20 },
      }, token)
      console.log('    ✅  type — créé (consommable | materiel)')

      // Set default for existing rows
      console.log('    ⏭  Mise à jour des lignes existantes → type = consommable')
      await api('PATCH', '/items/gamme_consommables', { type: 'consommable' }, token).catch(() => {})
      console.log('    ✅  Lignes existantes mises à jour')
    } else throw e
  }

  console.log()
  console.log('─────────────────────────────────────────────')
  console.log('🎉  Migration terminée !\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  process.exit(1)
})
