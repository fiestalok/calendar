#!/usr/bin/env node
/**
 * seed-reservations-produits.mjs
 * Lie les réservations existantes aux produits via reservations_produits.
 *
 *  Réservation 29 — Jonathan EHRHARD  (09/06)  → Chateau gonflable croco XL
 *  Réservation 27 — Bob Moran          (11/06)  → Photobooth premium + Tonelle 4x4
 *  Réservation 24  (15-17/05)                   → Tonelle 4x4 + Chateau gonflable croco XL
 *  Réservation 25  (21-24/05)                   → Photobooth premium
 *  Réservation 26  (25-27/05)                   → Tonelle 4x4
 *
 * Usage : node seed-reservations-produits.mjs
 */

import { readFileSync } from 'fs'
import { resolve }      from 'path'

function loadEnv() {
  const raw = readFileSync(resolve('.env'), 'utf8')
  return Object.fromEntries(
    raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
  )
}

function resolveDirectusUrl(envUrl) {
  if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl.replace(/\/$/, '')
  const vite = readFileSync(resolve('vite.config.ts'), 'utf8')
  const m = vite.match(/target\s*:\s*['"]([^'"]+)['"]/)
  return m[1].replace(/\/$/, '')
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
  if (!res.ok) throw Object.assign(new Error(json?.errors?.[0]?.message ?? res.statusText), { status: res.status })
  return json.data ?? json
}

async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', { email: env.VITE_DIRECTUS_EMAIL, password: env.VITE_DIRECTUS_PASSWORD })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  // ── Données existantes ────────────────────────────────────────────────────
  const [reservations, produits, existing] = await Promise.all([
    api('GET', '/items/reservations?fields=id,date_start,date_end,client.first_name,client.last_name&limit=100', null, token),
    api('GET', '/items/produits?fields=id,name,jours_avant,jours_apres&limit=100', null, token),
    api('GET', '/items/reservations_produits?fields=reservations_id,produits_id&limit=500', null, token),
  ])

  const produitByName = Object.fromEntries((produits ?? []).map(p => [p.name, p]))
  const existingSet   = new Set((existing ?? []).map(e => `${e.reservations_id}-${e.produits_id}`))

  const clientName = r => {
    const fn = r.client?.first_name
    const ln = r.client?.last_name
    return (fn || ln) ? `${fn ?? ''} ${ln ?? ''}`.trim() : `Résa #${r.id}`
  }

  // ── Mapping resa → produits ───────────────────────────────────────────────
  const P = produitByName

  const LINKS = [
    // Jonathan EHRHARD — château gonflable
    { resa_id: 29, produit: 'Chateau gonflable croco XL', qty: 1 },

    // Bob Moran — photobooth + tonelle
    { resa_id: 27, produit: 'Photobooth premium',         qty: 1 },
    { resa_id: 27, produit: 'Tonelle 4x4',                qty: 1 },

    // Réservation 24 (15-17 mai)
    { resa_id: 24, produit: 'Tonelle 4x4',                qty: 2 },
    { resa_id: 24, produit: 'Chateau gonflable croco XL', qty: 1 },

    // Réservation 25 (21-24 mai)
    { resa_id: 25, produit: 'Photobooth premium',         qty: 1 },

    // Réservation 26 (25-27 mai)
    { resa_id: 26, produit: 'Tonelle 4x4',                qty: 1 },
  ]

  console.log('🔖  Liens reservations_produits')
  for (const link of LINKS) {
    const produit = P[link.produit]
    if (!produit) { console.log(`    ⚠️  Produit introuvable : "${link.produit}"`); continue }

    const key = `${link.resa_id}-${produit.id}`
    if (existingSet.has(key)) {
      console.log(`    ⏭  Résa ${link.resa_id} ↔ ${link.produit} — déjà lié`)
      continue
    }

    const resa = (reservations ?? []).find(r => r.id === link.resa_id)
    await api('POST', '/items/reservations_produits', {
      reservations_id: link.resa_id,
      produits_id:     produit.id,
      quantity:        link.qty ?? 1,
    }, token)

    const jours = produit.jours_avant || produit.jours_apres
      ? ` (blocage J-${produit.jours_avant}/J+${produit.jours_apres})`
      : ''
    console.log(`    ✅  ${clientName(resa ?? {})} → ${link.produit} ×${link.qty ?? 1}${jours}`)
  }

  console.log('\n─────────────────────────────────────────────')
  console.log('🎉  Liens créés ! Rafraîchis le planning pour voir les noms de produits.\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  process.exit(1)
})
