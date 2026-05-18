#!/usr/bin/env node
/**
 * setup-gammes-v3.mjs
 *   - Ajoute le champ "type" à articles : 'principal' | 'secondaire' (défaut: 'principal')
 *   - Crée la collection gamme_articles_materiel (gamme ↔ articles secondaires)
 *
 * Usage : node setup-gammes-v3.mjs   (depuis calendar/)
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

async function ensureCollection(name, meta, token) {
  try {
    await api('GET', `/collections/${name}`, null, token)
    console.log(`    ⏭  Collection ${name} — existe`)
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api('POST', '/collections', { collection: name, meta, schema: {} }, token)
      console.log(`    ✅  Collection ${name} — créée`)
    } else throw e
  }
}

async function ensureField(collection, field, type, meta, schema, token) {
  try {
    const existing = await api('GET', `/fields/${collection}/${field}`, null, token)
    if (existing?.type !== type) {
      await api('PATCH', `/fields/${collection}/${field}`, { type, meta, schema }, token)
      console.log(`    ✅  ${collection}.${field} — type corrigé`)
    } else {
      console.log(`    ⏭  ${collection}.${field} — existe (${type})`)
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
      await api('PATCH', `/relations/${collection}/${field}`, { related_collection: relatedCollection }, token)
      console.log(`    ✅  Relation corrigée`)
    }
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      await api('POST', '/relations', { collection, field, related_collection: relatedCollection }, token)
      console.log(`    ✅  Relation ${collection}.${field} → ${relatedCollection} — créée`)
    } else {
      console.log(`    ⚠️   ${collection}.${field} : ${e.message}`)
    }
  }
}

async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', { email: env.VITE_DIRECTUS_EMAIL, password: env.VITE_DIRECTUS_PASSWORD })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  // ── 1. Champ type sur articles ──────────────────────────────────────────
  console.log('📋  articles.type (principal | secondaire)')
  await ensureField('articles', 'type', 'string', {
    interface: 'select-dropdown',
    options: {
      choices: [
        { text: 'Principal', value: 'principal' },
        { text: 'Secondaire (matériel d\'exploitation)', value: 'secondaire' },
      ],
    },
    required: true,
    hidden: false,
    note: 'principal = article réservable / secondaire = matériel d\'exploitation lié aux gammes',
  }, { is_nullable: false, default_value: 'principal', max_length: 20 }, token)

  // Set default for existing articles
  try {
    await api('PATCH', '/items/articles', { type: 'principal' }, token)
    console.log('    ✅  Articles existants → type = principal')
  } catch (e) {
    console.log(`    ⚠️   Mise à jour articles existants : ${e.message}`)
  }
  console.log()

  // ── 2. Collection gamme_articles_materiel ───────────────────────────────
  console.log('📦  Collection: gamme_articles_materiel')
  await ensureCollection('gamme_articles_materiel', { icon: 'link', hidden: true }, token)
  await ensureField('gamme_articles_materiel', 'gamme_id',   'integer', { interface: 'select-dropdown-m2o', hidden: false }, { is_nullable: false }, token)
  await ensureField('gamme_articles_materiel', 'article_id', 'integer', { interface: 'select-dropdown-m2o', hidden: false }, { is_nullable: false }, token)
  await ensureRelation('gamme_articles_materiel', 'gamme_id',   'gammes',   token)
  await ensureRelation('gamme_articles_materiel', 'article_id', 'articles', token)
  console.log()

  console.log('─────────────────────────────────────────────')
  console.log('🎉  Migration terminée !\n')
  console.log('    ⚠️  Configurer les permissions :')
  console.log('    Politiques d\'accès → gamme_articles_materiel → *')
  console.log('    Politiques d\'accès → articles → autoriser le champ "type"\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  process.exit(1)
})
