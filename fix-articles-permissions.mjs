#!/usr/bin/env node
/**
 * fix-articles-permissions.mjs
 * Donne accès au champ "status" de la collection articles (et corrige toutes
 * les permissions read/create/update/delete pour articles + produits).
 *
 * Usage : node fix-articles-permissions.mjs
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

async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', {
    email:    env.VITE_DIRECTUS_EMAIL,
    password: env.VITE_DIRECTUS_PASSWORD,
  })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  const me     = await api('GET', '/users/me?fields=role', null, token)
  const roleId = me?.role

  if (!roleId) {
    console.log('ℹ️   Compte admin — aucune restriction à corriger.')
    return
  }

  const COLLECTIONS = ['articles', 'produits', 'entrepots', 'reservations_produits', 'reservations']
  const ACTIONS      = ['read', 'create', 'update', 'delete']

  for (const collection of COLLECTIONS) {
    console.log(`🔐  Permissions [${collection}]`)

    // Récupère les permissions existantes pour ce rôle + collection
    const existing = await api(
      'GET',
      `/permissions?filter[role][_eq]=${roleId}&filter[collection][_eq]=${collection}&fields=id,action,fields&limit=50`,
      null, token
    )
    const byAction = Object.fromEntries((existing ?? []).map(p => [p.action, p]))

    for (const action of ACTIONS) {
      if (byAction[action]) {
        const perm = byAction[action]
        // Si les champs ne couvrent pas tout, on met à jour
        if (perm.fields !== null && perm.fields !== '*') {
          await api('PATCH', `/permissions/${perm.id}`, { fields: '*' }, token)
          console.log(`    🔧  ${action} → champs mis à jour ("*")`)
        } else {
          console.log(`    ⏭  ${action} → déjà OK`)
        }
      } else {
        await api('POST', '/permissions', {
          role:        roleId,
          collection,
          action,
          fields:      '*',
          permissions: {},
          validation:  {},
        }, token)
        console.log(`    ✅  ${action} → ajouté`)
      }
    }
    console.log()
  }

  console.log('─────────────────────────────────────────────')
  console.log('🎉  Permissions corrigées !')
  console.log('    Rechargez l\'app dans le navigateur.\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  console.error('\n👉  Si le script échoue (Directus v11 Access Policies),')
  console.error('    va dans Paramètres → Politiques d\'accès → ta politique')
  console.error('    → articles → champs autorisés → mets "*" ou coche "status"')
  process.exit(1)
})
