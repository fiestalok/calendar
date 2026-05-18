#!/usr/bin/env node
/**
 * update-directus-v4.mjs
 * Ajoute les champs "validé par" à la table reservations :
 *   - devis_realise_par  (text, nullable)
 *   - devis_confirme_par (text, nullable)
 *   - terminee_par       (text, nullable)
 *
 * Usage : node update-directus-v4.mjs
 *
 * Note : Après ce script, configurer manuellement dans Directus :
 *   Paramètres → Politiques d'accès → ta politique → reservations_articles → all fields → *
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

async function ensureField(collection, field, label, token) {
  try {
    await api('GET', `/fields/${collection}/${field}`, null, token)
    console.log(`    ⏭  ${field} — déjà existant`)
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api('POST', `/fields/${collection}`, {
        field,
        type: 'string',
        meta: { note: label, hidden: false, readonly: false, interface: 'input' },
        schema: { is_nullable: true, max_length: 255 },
      }, token)
      console.log(`    ✅  ${field} — créé`)
    } else {
      throw e
    }
  }
}

async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', {
    email:    env.VITE_DIRECTUS_EMAIL,
    password: env.VITE_DIRECTUS_PASSWORD,
  })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  console.log('📋  Champs reservations — "validé par" + devis signé')
  await ensureField('reservations', 'devis_realise_par',  'Devis réalisé par',  token)
  await ensureField('reservations', 'devis_confirme_par', 'Devis confirmé par', token)
  await ensureField('reservations', 'terminee_par',       'Terminée par',       token)

  // Champ fichier pour le devis signé (UUID → directus_files)
  try {
    await api('GET', '/fields/reservations/fichier_devis_signe', null, token)
    console.log(`    ⏭  fichier_devis_signe — déjà existant`)
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api('POST', '/fields/reservations', {
        field: 'fichier_devis_signe',
        type: 'uuid',
        meta: { note: 'Devis signé (fichier)', interface: 'file', hidden: false, readonly: false },
        schema: { is_nullable: true },
      }, token)
      console.log('    ✅  fichier_devis_signe — créé')
    } else throw e
  }
  console.log()

  console.log('─────────────────────────────────────────────')
  console.log('🎉  Migration terminée !\n')
  console.log('    ⚠️  Penser à configurer les permissions dans Directus UI :')
  console.log('    Paramètres → Politiques d\'accès → ta politique')
  console.log('    → reservations_articles → tous les champs → *\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  process.exit(1)
})
