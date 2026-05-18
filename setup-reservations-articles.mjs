#!/usr/bin/env node
/**
 * setup-reservations-articles.mjs
 * Configure la collection reservations_articles dans Directus :
 *   - Crée les champs M2O reservations_id et articles_id s'ils n'existent pas
 *   - Crée les relations (M2O) vers reservations et articles
 *   - Affiche l'état actuel des données pour diagnostic
 *
 * Usage : node setup-reservations-articles.mjs
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
  } catch { console.error('❌  .env introuvable. Lancez depuis calendar/'); process.exit(1) }
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

async function ensureField(collection, field, type, meta, schema, token) {
  try {
    const existing = await api('GET', `/fields/${collection}/${field}`, null, token)
    const currentType = existing?.type
    console.log(`    ⏭  ${collection}.${field} — existe (type: ${currentType})`)
    // If field exists but type is wrong (e.g. 'integer' instead of 'uuid'), update it
    if (currentType !== type) {
      console.log(`    ⚠️   Type incorrect (${currentType} ≠ ${type}) — correction...`)
      await api('PATCH', `/fields/${collection}/${field}`, { type, meta, schema }, token)
      console.log(`    ✅  Type corrigé → ${type}`)
    }
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api('POST', `/fields/${collection}`, { field, type, meta, schema }, token)
      console.log(`    ✅  ${collection}.${field} — créé (${type})`)
    } else throw e
  }
}

async function ensureRelation(collection, field, relatedCollection, token) {
  try {
    const existing = await api('GET', `/relations/${collection}/${field}`, null, token)
    if (existing?.related_collection === relatedCollection) {
      console.log(`    ⏭  Relation ${collection}.${field} → ${relatedCollection} — existe`)
    } else {
      console.log(`    ⚠️   Relation pointe vers ${existing?.related_collection} — correction...`)
      await api('PATCH', `/relations/${collection}/${field}`, { related_collection: relatedCollection }, token)
      console.log(`    ✅  Relation corrigée`)
    }
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api('POST', '/relations', {
        collection,
        field,
        related_collection: relatedCollection,
      }, token)
      console.log(`    ✅  Relation ${collection}.${field} → ${relatedCollection} — créée`)
    } else {
      console.log(`    ⚠️   Impossible de créer la relation : ${e.message}`)
    }
  }
}

async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', { email: env.VITE_DIRECTUS_EMAIL, password: env.VITE_DIRECTUS_PASSWORD })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  // ── 1. Diagnostic : données actuelles ──────────────────────────────────────
  console.log('🔍  Diagnostic — données actuelles dans reservations_articles')
  try {
    const rows = await api('GET', '/items/reservations_articles?limit=10&fields=id,reservations_id,articles_id', null, token)
    if (!rows?.length) {
      console.log('    ℹ️   Aucune ligne trouvée')
    } else {
      console.log(`    ${rows.length} ligne(s) trouvée(s) :`)
      for (const r of rows) {
        console.log(`    id=${r.id}  reservations_id=${r.reservations_id}  articles_id=${r.articles_id}`)
      }
    }
  } catch (e) {
    console.log(`    ❌  Impossible de lire : ${e.message}`)
  }
  console.log()

  // ── 2. Champs M2O ──────────────────────────────────────────────────────────
  console.log('📋  Champs reservations_articles')

  await ensureField('reservations_articles', 'reservations_id',
    'integer',
    { interface: 'select-dropdown-m2o', hidden: false, readonly: false },
    { is_nullable: false },
    token
  )

  await ensureField('reservations_articles', 'articles_id',
    'integer',
    { interface: 'select-dropdown-m2o', hidden: false, readonly: false },
    { is_nullable: true },
    token
  )
  console.log()

  // ── 3. Relations M2O ──────────────────────────────────────────────────────
  console.log('🔗  Relations')
  await ensureRelation('reservations_articles', 'reservations_id', 'reservations', token)
  await ensureRelation('reservations_articles', 'articles_id',     'articles',     token)
  console.log()

  // ── 4. Nettoyage lignes orphelines (articles_id = null) ────────────────────
  console.log('🗑️   Nettoyage — suppression des lignes avec articles_id null')
  try {
    const nullRows = await api(
      'GET',
      '/items/reservations_articles?filter[articles_id][_null]=true&fields=id,reservations_id&limit=100',
      null,
      token
    )
    if (!nullRows?.length) {
      console.log('    ✅  Aucune ligne orpheline trouvée')
    } else {
      console.log(`    ${nullRows.length} ligne(s) orpheline(s) à supprimer…`)
      for (const row of nullRows) {
        await api('DELETE', `/items/reservations_articles/${row.id}`, null, token)
        console.log(`    🗑️   Supprimé id=${row.id} (résa ${row.reservations_id})`)
      }
    }
  } catch (e) {
    console.log(`    ⚠️   Nettoyage impossible : ${e.message}`)
    console.log('    → Supprimez manuellement dans Directus admin les lignes reservations_articles avec articles_id = null')
  }
  console.log()

  // ── 5. Re-diagnostic ───────────────────────────────────────────────────────
  console.log('🔍  Vérification post-migration — lecture avec expansion')
  try {
    const rows = await api(
      'GET',
      '/items/reservations_articles?limit=5&fields=id,reservations_id,articles_id.id,articles_id.reference,articles_id.etat',
      null,
      token
    )
    if (!rows?.length) {
      console.log('    ✅  Table propre (0 lignes)')
    } else {
      for (const r of rows) {
        const art = r.articles_id
        if (typeof art === 'object' && art?.id) {
          console.log(`    ✅  id=${r.id} → article: ${art.reference} (${art.etat})`)
        } else {
          console.log(`    ⚠️   id=${r.id} → articles_id=${art} (toujours null)`)
        }
      }
    }
  } catch (e) {
    console.log(`    ❌  Vérification échouée : ${e.message}`)
  }

  console.log()
  console.log('─────────────────────────────────────────────')
  console.log('🎉  Setup terminé !\n')
  console.log('    Prochaines étapes :')
  console.log('    1. Rafraîchis l\'app dans le navigateur')
  console.log('    2. Ouvre la réservation → clique "Remettre en attente"')
  console.log('    3. Refais "Préparer un devis" → sélectionne les articles\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  process.exit(1)
})
