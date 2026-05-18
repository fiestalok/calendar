#!/usr/bin/env node
/**
 * setup-directus.mjs
 * Mise à jour du schéma Directus pour Fiestalok
 *
 * Prérequis : Node 18+
 * Usage     : node setup-directus.mjs   (depuis le dossier calendar/)
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

// Si VITE_DIRECTUS_URL est un chemin relatif (/api), on cherche le vrai host
// dans vite.config.ts (proxy target).
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

const env  = loadEnv()
const BASE = resolveDirectusUrl(env.VITE_DIRECTUS_URL ?? env.DIRECTUS_URL)
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

async function ensureField(collection, def, token) {
  if (await fieldExists(collection, def.field, token)) {
    console.log(`    ⏭  ${collection}.${def.field} — déjà présent`)
    return
  }
  await api('POST', `/fields/${collection}`, def, token)
  console.log(`    ✅  ${collection}.${def.field} — créé`)
}

// ── Schéma cible ───────────────────────────────────────────────────────────────

const COMMENTAIRES_FIELDS = [
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
    field: 'record_type', type: 'string',
    schema: { is_nullable: false, max_length: 80 },
    meta: {
      required: true,
      note: 'clients | contacts | prospects | client_notes | contact_notes …',
      interface: 'input',
    },
  },
  {
    field: 'record_id', type: 'string',
    schema: { is_nullable: false, max_length: 36 },
    meta: { required: true, interface: 'input' },
  },
  {
    field: 'author', type: 'string',
    schema: { is_nullable: false, max_length: 120 },
    meta: { required: true, interface: 'input' },
  },
  {
    field: 'text', type: 'text',
    schema: { is_nullable: false },
    meta: { required: true, interface: 'input-multiline' },
  },
]

const EXTRA_FIELDS = [
  // Référence manuelle de facture sur un devis
  {
    collection: 'devis',
    field: 'facture_ref', type: 'string',
    schema: { is_nullable: true, max_length: 80 },
    meta: { interface: 'input', note: 'Référence manuelle de la facture associée (ex: FAC-2024-001)' },
  },
  // Rôle du contact dans son entreprise
  {
    collection: 'contacts',
    field: 'role', type: 'string',
    schema: { is_nullable: true, max_length: 40 },
    meta: {
      interface: 'select-dropdown',
      options: {
        choices: [
          { text: 'Principal',   value: 'principal'   },
          { text: 'Secondaire',  value: 'secondaire'  },
          { text: 'Facturation', value: 'facturation' },
          { text: 'Technique',   value: 'technique'   },
          { text: 'Autre',       value: 'autre'       },
        ],
      },
    },
  },
]

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔗  Connexion à ${BASE}…`)

  const auth = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })
  const token = auth.access_token
  console.log('✅  Authentifié\n')

  // ── 1. Collection commentaires ─────────────────────────────────────────────
  console.log('📦  Collection [commentaires]')
  if (await collectionExists('commentaires', token)) {
    console.log('    ⏭  Collection existe — vérification des champs…')
    for (const f of COMMENTAIRES_FIELDS.filter(f => f.field !== 'id' && f.field !== 'date_created')) {
      await ensureField('commentaires', f, token)
    }
  } else {
    await api('POST', '/collections', {
      collection: 'commentaires',
      meta: { icon: 'comment', note: 'Commentaires et historique de notes sur tous les objets' },
      schema: {},
      fields: COMMENTAIRES_FIELDS,
    }, token)
    console.log('    ✅  Collection + 6 champs créés')
  }

  // ── 2. Champs sur collections existantes ────────────────────────────────────
  console.log('\n🛠   Champs supplémentaires')
  for (const f of EXTRA_FIELDS) {
    const { collection, ...def } = f
    await ensureField(collection, def, token)
  }

  // ── 3. Permissions sur commentaires ─────────────────────────────────────────
  console.log('\n🔐  Permissions [commentaires]')
  try {
    const me = await api('GET', '/users/me?fields=role', null, token)
    const roleId = me?.role

    if (!roleId) {
      console.log('    ℹ️   Compte admin (pas de rôle) — aucune restriction à configurer.')
    } else {
      // Récupère les permissions existantes pour ce rôle + collection
      const existing = await api(
        'GET',
        `/permissions?filter[role][_eq]=${roleId}&filter[collection][_eq]=commentaires&fields=action`,
        null, token
      )
      const done = new Set((existing ?? []).map(p => p.action))

      for (const action of ['read', 'create', 'delete']) {
        if (done.has(action)) {
          console.log(`    ⏭  ${action} — déjà configuré`)
        } else {
          await api('POST', '/permissions', {
            role: roleId,
            collection: 'commentaires',
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
    // Directus v11 avec Access Policies → API différente, fallback manuel
    console.warn(`    ⚠️   Permissions automatiques impossibles (${err.message ?? err.status})`)
    console.warn('    👉  Configurez manuellement dans Directus :')
    console.warn('        Paramètres → Politiques d\'accès → votre politique')
    console.warn('        → commentaires : cochez Lire / Créer / Supprimer')
  }

  // ── 4. Résumé ────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────')
  console.log('🎉  Mise à jour terminée !\n')
  console.log('Vérifications recommandées dans Directus :')
  console.log('  • commentaires → champs record_type, record_id, author, text, date_created')
  console.log('  • devis        → champ facture_ref (texte, nullable)')
  console.log('  • contacts     → champ role (select, nullable)')
  console.log('  • Politique d\'accès → commentaires : Lire + Créer + Supprimer\n')
}

main().catch(err => {
  console.error(`\n❌  ${err.message}`)
  if (err.status) console.error(`   HTTP ${err.status} — ${err.path}`)
  process.exit(1)
})
