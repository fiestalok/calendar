#!/usr/bin/env node
/**
 * update-directus-v5.mjs
 * Ajoute à la table reservations les paramètres du devis enregistrés par le CRM :
 *   - distance_km    (integer)  distance de livraison
 *   - remise         (boolean)  remise automatique (livraison offerte)
 *   - remise_libelle (string)   intitulé de la remise manuelle
 *   - remise_montant (float)    montant de la remise manuelle
 * Les champs déjà présents sont laissés tels quels.
 *
 * Usage : node update-directus-v5.mjs
 * Lit dans .env : VITE_DIRECTUS_URL, DIRECTUS_EMAIL et DIRECTUS_PASSWORD (compte administrateur).
 *
 * Note : si la politique d'accès du CRM liste les champs de reservations un par un
 * (au lieu de *), y ajouter ces champs en lecture et en modification.
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
  } catch {
    console.error('❌  .env introuvable. Lancez depuis calendar/'); process.exit(1)
  }
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
// Identifiants sans préfixe VITE_ pour que Vite ne puisse pas les exposer ; anciens noms acceptés
const EMAIL    = env.DIRECTUS_EMAIL    || env.VITE_DIRECTUS_EMAIL
const PASSWORD = env.DIRECTUS_PASSWORD || env.VITE_DIRECTUS_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('❌  Renseignez DIRECTUS_EMAIL et DIRECTUS_PASSWORD dans .env'); process.exit(1)
}

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

async function ensureField(collection, field, type, meta, schema, token) {
  try {
    await api('GET', `/fields/${collection}/${field}`, null, token)
    console.log(`    ⏭  ${field} — déjà existant`)
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api('POST', `/fields/${collection}`, {
        field,
        type,
        meta:   { hidden: false, readonly: false, ...meta },
        schema: { is_nullable: true, ...schema },
      }, token)
      console.log(`    ✅  ${field} — créé`)
    } else {
      throw e
    }
  }
}

async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  console.log('📋  Champs reservations — paramètres du devis')
  await ensureField('reservations', 'distance_km',    'integer', { note: 'Distance de livraison (km)', interface: 'input' },   { default_value: 0 }, token)
  await ensureField('reservations', 'remise',         'boolean', { note: 'Remise automatique (livraison offerte)', interface: 'boolean' }, { default_value: false }, token)
  await ensureField('reservations', 'remise_libelle', 'string',  { note: 'Intitulé de la remise manuelle', interface: 'input' }, { max_length: 255 }, token)
  await ensureField('reservations', 'remise_montant', 'float',   { note: 'Montant de la remise manuelle (€)', interface: 'input' }, {}, token)
  console.log()

  console.log('─────────────────────────────────────────────')
  console.log('🎉  Migration terminée !\n')
  console.log('    ⚠️  Si la politique d\'accès du CRM liste les champs de reservations un par un,')
  console.log('    y ajouter distance_km, remise, remise_libelle et remise_montant (lecture + modification).\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  process.exit(1)
})
