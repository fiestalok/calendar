#!/usr/bin/env node
/**
 * update-directus.mjs
 * Mise à jour du schéma Directus — Fiestalok (session 2)
 *
 * Nouveautés gérées :
 *   • Collection  factures      (numero, date_facture, montant, description, statut)
 *   • Champ       devis.fichier (fichier PDF, relation → directus_files)
 *   • Champ       devis.facture (relation M2O → factures)
 *   • Permissions read/create/update/delete sur factures
 *
 * Prérequis : Node 18+
 * Usage     : node update-directus.mjs   (depuis le dossier calendar/)
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Lecture du .env ────────────────────────────────────────────────────────────
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
    console.error('❌  Fichier .env introuvable. Lancez le script depuis le dossier calendar/')
    process.exit(1)
  }
}

function resolveDirectusUrl(envUrl) {
  if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl.replace(/\/$/, '')
  try {
    const vite = readFileSync(resolve('vite.config.ts'), 'utf8')
    const m = vite.match(/target\s*:\s*['"]([^'"]+)['"]/)
    if (m) return m[1].replace(/\/$/, '')
  } catch { /* pas de vite.config */ }
  console.error('❌  Impossible de déterminer l\'URL Directus. Ajoutez DIRECTUS_URL=http://... dans .env')
  process.exit(1)
}

const env      = loadEnv()
const BASE     = resolveDirectusUrl(env.VITE_DIRECTUS_URL ?? env.DIRECTUS_URL)
const EMAIL    = env.VITE_DIRECTUS_EMAIL
const PASSWORD = env.VITE_DIRECTUS_PASSWORD

if (!EMAIL || !PASSWORD) {
  console.error('❌  Variables VITE_DIRECTUS_EMAIL / VITE_DIRECTUS_PASSWORD manquantes dans .env')
  process.exit(1)
}

// ── Helpers HTTP ───────────────────────────────────────────────────────────────
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

async function collectionExists(name, token) {
  try { await api('GET', `/collections/${name}`, null, token); return true }
  catch { return false }
}

async function fieldExists(collection, field, token) {
  try { await api('GET', `/fields/${collection}/${field}`, null, token); return true }
  catch { return false }
}

async function relationExists(collection, field, token) {
  try { await api('GET', `/relations/${collection}/${field}`, null, token); return true }
  catch { return false }
}

async function ensureField(collection, def, token) {
  if (await fieldExists(collection, def.field, token)) {
    console.log(`    ⏭  ${collection}.${def.field} — déjà présent`)
    return
  }
  await api('POST', `/fields/${collection}`, def, token)
  console.log(`    ✅  ${collection}.${def.field} — créé`)
}

async function ensureRelation(def, token) {
  if (await relationExists(def.collection, def.field, token)) {
    console.log(`    ⏭  relation ${def.collection}.${def.field} → ${def.related_collection} — déjà présente`)
    return
  }
  await api('POST', '/relations', def, token)
  console.log(`    ✅  relation ${def.collection}.${def.field} → ${def.related_collection} — créée`)
}

// ── Schéma : collection factures ──────────────────────────────────────────────
const FACTURES_FIELDS = [
  {
    field: 'id', type: 'integer',
    meta: { hidden: true, readonly: true },
    schema: { is_primary_key: true, has_auto_increment: true },
  },
  {
    field: 'date_created', type: 'timestamp',
    meta: { special: ['date-created'], readonly: true, width: 'half', display: 'datetime' },
    schema: {},
  },
  {
    field: 'numero', type: 'string',
    schema: { is_nullable: false, max_length: 80 },
    meta: {
      required: true,
      interface: 'input',
      width: 'half',
      note: 'Ex: FAC-2024-001',
    },
  },
  {
    field: 'date_facture', type: 'date',
    schema: { is_nullable: true },
    meta: { interface: 'datetime', width: 'half' },
  },
  {
    field: 'montant', type: 'decimal',
    schema: { is_nullable: true, numeric_precision: 12, numeric_scale: 2 },
    meta: { interface: 'input', width: 'half', options: { min: 0 } },
  },
  {
    field: 'statut', type: 'string',
    schema: { is_nullable: true, max_length: 40 },
    meta: {
      interface: 'select-dropdown',
      width: 'half',
      options: {
        choices: [
          { text: 'Brouillon',  value: 'brouillon'  },
          { text: 'Envoyée',    value: 'envoyee'    },
          { text: 'Payée',      value: 'payee'      },
          { text: 'Annulée',    value: 'annulee'    },
        ],
      },
    },
  },
  {
    field: 'description', type: 'text',
    schema: { is_nullable: true },
    meta: { interface: 'input-multiline' },
  },
]

// ── Schéma : champs supplémentaires sur devis ──────────────────────────────────
const DEVIS_EXTRA_FIELDS = [
  {
    // Fichier PDF attaché — relation vers directus_files via special "file"
    field: 'fichier', type: 'uuid',
    schema: { is_nullable: true },
    meta: {
      special: ['file'],
      interface: 'file',
      display: 'file',
      width: 'full',
      note: 'Fichier PDF du devis',
    },
  },
  {
    // Relation M2O vers la collection factures
    field: 'facture', type: 'integer',
    schema: { is_nullable: true },
    meta: {
      special: ['m2o'],
      interface: 'select-dropdown-m2o',
      display: 'related-values',
      display_options: { template: '{{numero}}' },
      options: { template: '{{numero}}' },
      width: 'half',
    },
  },
]

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)
  const auth  = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  // ── 1. Collection factures ─────────────────────────────────────────────────
  console.log('📦  Collection [factures]')
  if (await collectionExists('factures', token)) {
    console.log('    ⏭  Collection existe — vérification des champs…')
    for (const f of FACTURES_FIELDS.filter(f => !['id', 'date_created'].includes(f.field))) {
      await ensureField('factures', f, token)
    }
  } else {
    await api('POST', '/collections', {
      collection: 'factures',
      meta: {
        icon: 'receipt',
        note: 'Factures émises aux clients',
        sort_field: '-date_created',
      },
      schema: {},
      fields: FACTURES_FIELDS,
    }, token)
    console.log('    ✅  Collection + champs créés')
  }

  // ── 2. Champs supplémentaires sur devis ────────────────────────────────────
  console.log('\n🛠   Champs supplémentaires sur [devis]')
  for (const f of DEVIS_EXTRA_FIELDS) {
    await ensureField('devis', f, token)
  }

  // ── 3. Relation devis.facture → factures ───────────────────────────────────
  console.log('\n🔗  Relation [devis.facture → factures]')
  await ensureRelation({
    collection: 'devis',
    field: 'facture',
    related_collection: 'factures',
  }, token)

  // ── 4. Permissions sur factures ────────────────────────────────────────────
  console.log('\n🔐  Permissions [factures]')
  try {
    const me = await api('GET', '/users/me?fields=role', null, token)
    const roleId = me?.role

    if (!roleId) {
      console.log('    ℹ️   Compte admin — aucune restriction à configurer.')
    } else {
      const existing = await api(
        'GET',
        `/permissions?filter[role][_eq]=${roleId}&filter[collection][_eq]=factures&fields=action`,
        null, token
      )
      const done = new Set((existing ?? []).map(p => p.action))
      for (const action of ['read', 'create', 'update', 'delete']) {
        if (done.has(action)) {
          console.log(`    ⏭  ${action} — déjà configuré`)
        } else {
          await api('POST', '/permissions', {
            role: roleId,
            collection: 'factures',
            action,
            fields: '*',
            permissions: {},
            validation: {},
          }, token)
          console.log(`    ✅  ${action} — ajouté`)
        }
      }
    }
  } catch (err) {
    console.warn(`    ⚠️   Permissions automatiques impossibles (${err.message ?? err.status})`)
    console.warn('    👉  Configurez manuellement dans Directus :')
    console.warn('        Paramètres → Politiques d\'accès → votre politique')
    console.warn('        → factures : cochez Lire / Créer / Modifier / Supprimer')
  }

  // ── 5. Résumé ──────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────')
  console.log('🎉  Mise à jour terminée !\n')
  console.log('Vérifications recommandées dans Directus :')
  console.log('  • factures        → champs numero, date_facture, montant, statut, description')
  console.log('  • devis.fichier   → type UUID, special: file (interface "file")')
  console.log('  • devis.facture   → M2O vers factures, template {{numero}}')
  console.log('  • Politique d\'accès → factures : Lire + Créer + Modifier + Supprimer\n')
  console.log('Si devis.facture existait déjà (relation manuelle), vérifiez')
  console.log('que son template affiche bien {{numero}} dans le panneau Champs.\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  process.exit(1)
})
