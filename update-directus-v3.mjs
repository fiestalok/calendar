#!/usr/bin/env node
/**
 * update-directus-v3.mjs
 * Ajoute le champ devis.reservation (M2O → reservations)
 * pour lier un devis à une réservation spécifique.
 *
 * Usage : node update-directus-v3.mjs
 */

import { readFileSync } from 'fs'
import { resolve }      from 'path'

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

async function fieldExists(collection, field, token) {
  try { await api('GET', `/fields/${collection}/${field}`, null, token); return true }
  catch { return false }
}

async function relationExists(collection, field, token) {
  try { await api('GET', `/relations/${collection}/${field}`, null, token); return true }
  catch { return false }
}

async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', {
    email: env.VITE_DIRECTUS_EMAIL, password: env.VITE_DIRECTUS_PASSWORD,
  })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  // ── 1. Champ devis.reservation ─────────────────────────────────────────────
  console.log('🛠   Champ [devis.reservation]')
  if (await fieldExists('devis', 'reservation', token)) {
    console.log('    ⏭  Déjà présent')
  } else {
    await api('POST', '/fields/devis', {
      field: 'reservation',
      type:  'integer',
      schema: { is_nullable: true },
      meta: {
        special:         ['m2o'],
        interface:       'select-dropdown-m2o',
        display:         'related-values',
        display_options: { template: '{{date_start}} — {{date_end}}' },
        options:         { template: '{{date_start}} — {{date_end}}' },
        width:           'half',
        note:            'Réservation liée à ce devis',
      },
    }, token)
    console.log('    ✅  Créé')
  }

  // ── 2. Relation devis.reservation → reservations ───────────────────────────
  console.log('\n🔗  Relation [devis.reservation → reservations]')
  if (await relationExists('devis', 'reservation', token)) {
    console.log('    ⏭  Déjà présente')
  } else {
    await api('POST', '/relations', {
      collection:         'devis',
      field:              'reservation',
      related_collection: 'reservations',
    }, token)
    console.log('    ✅  Créée')
  }

  console.log('\n─────────────────────────────────────────────')
  console.log('🎉  Migration terminée !')
  console.log('\nPour lier un devis à une réservation :')
  console.log('  • Ouvre le devis dans Directus et sélectionne la réservation dans le champ "Réservation liée"')
  console.log('  • OU modifie le devis depuis la fiche client (onglet Devis) — ajouter le select viendra dans une prochaine mise à jour\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  process.exit(1)
})
