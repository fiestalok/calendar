/**
 * seed.js — Import initial Fiestalok → Directus
 *
 * Pré-requis : Directus lancé (docker-compose up) sur localhost:8055
 * Usage      : node scripts/seed.js
 * Node       : >= 18 (fetch natif)
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const load  = f => JSON.parse(readFileSync(join(__dir, '..', f), 'utf8'))

// ── Config ────────────────────────────────────────────────────────────────────

const BASE     = 'http://localhost:8055'
const EMAIL    = 'contact@fiestalok.fr'
const PASSWORD = 'fiestalok2sxb!'

const clientsData = load('src/data/clients.json')

// ── Auth & requêtes ───────────────────────────────────────────────────────────

let token

async function login() {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.errors?.[0]?.message ?? 'Login failed')
  token = j.data.access_token
  console.log('✓ Authentifié\n')
}

async function req(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const j = await r.json()
  if (!r.ok) {
    const msg = j.errors?.[0]?.message ?? JSON.stringify(j)
    const err = new Error(msg)
    err.status = r.status
    throw err
  }
  return j.data
}

// ── Helpers schéma ────────────────────────────────────────────────────────────

async function addField(collection, field) {
  try {
    await req('POST', `/fields/${collection}`, field)
    console.log(`  + ${collection}.${field.field}`)
  } catch (e) {
    if (e.status === 400 || /already exist/i.test(e.message)) {
      console.log(`  = ${collection}.${field.field} (déjà présent)`)
    } else throw e
  }
}

async function addRelation(rel) {
  try {
    await req('POST', '/relations', rel)
    console.log(`  + relation ${rel.collection}.${rel.field} → ${rel.related_collection}`)
  } catch (e) {
    if (e.status === 400 || /already exist/i.test(e.message)) {
      console.log(`  = relation ${rel.collection}.${rel.field} (déjà présente)`)
    } else throw e
  }
}

async function createCollection(payload) {
  try {
    await req('POST', '/collections', payload)
    console.log(`  + collection "${payload.collection}"`)
  } catch (e) {
    if (e.status === 400 || /already exist/i.test(e.message)) {
      console.log(`  = collection "${payload.collection}" (déjà présente)`)
    } else throw e
  }
}

// ── Constructeurs de champs ───────────────────────────────────────────────────

const pk = () => ({
  field: 'id', type: 'integer',
  meta: { hidden: true, readonly: true, interface: 'input' },
  schema: { is_primary_key: true, has_auto_increment: true, is_nullable: false },
})

const dateCreated = () => ({
  field: 'date_created', type: 'timestamp',
  meta: { special: ['date-created'], hidden: true, readonly: true, interface: 'datetime' },
  schema: { is_nullable: true },
})

const str = (field, label, half = false) => ({
  field, type: 'string',
  meta: { interface: 'input', width: half ? 'half' : 'full',
          translations: [{ language: 'fr-FR', translation: label }] },
  schema: { is_nullable: true },
})

const txt = (field, label) => ({
  field, type: 'text',
  meta: { interface: 'input-multiline',
          translations: [{ language: 'fr-FR', translation: label }] },
  schema: { is_nullable: true },
})

const num = (field, label, type = 'float') => ({
  field, type,
  meta: { interface: 'input',
          translations: [{ language: 'fr-FR', translation: label }] },
  schema: { is_nullable: true },
})

const json = (field, label) => ({
  field, type: 'json',
  meta: { interface: 'input-code',
          translations: [{ language: 'fr-FR', translation: label }] },
  schema: { is_nullable: true },
})

const fk = (field, label) => ({
  field, type: 'integer',
  meta: { interface: 'select-dropdown-m2o',
          translations: [{ language: 'fr-FR', translation: label }] },
  schema: { is_nullable: true },
})

// ── Étapes ────────────────────────────────────────────────────────────────────

// 1. Ajout des champs manquants dans la collection clients existante
async function step1_clientsFields() {
  console.log('[1] Ajout des champs clients manquants…')
  await addField('clients', str('siret',   'SIRET',   true))
  await addField('clients', str('secteur', 'Secteur', true))
  await addField('clients', txt('notes',   'Notes'))
}

// 2. Ajout des champs métier dans devis + relation FK vers clients
async function step2_devisFields() {
  console.log('\n[2] Enrichissement de la collection devis…')
  await addField('devis', fk('client',         'Client'))
  await addField('devis', str('numero',        'N° Devis',    true))
  await addField('devis', str('statut',        'Statut',      true))
  await addField('devis', num('montant',       'Montant (€)'))
  await addField('devis', txt('description',  'Description'))
  await addRelation({
    collection: 'devis',
    field: 'client',
    related_collection: 'clients',
    meta: {
      many_collection: 'devis',
      many_field: 'client',
      one_collection: 'clients',
      one_field: null,
    },
    schema: { on_delete: 'SET NULL' },
  })
}

// 3. Création de la collection contacts (schéma uniquement)
async function step3_contacts() {
  console.log('\n[3] Création de la collection contacts…')
  await createCollection({
    collection: 'contacts',
    meta: {
      icon: 'contacts',
      display_template: '{{prenom}} {{nom}}',
      singleton: false,
      translations: [{ language: 'fr-FR', translation: 'Contacts' }],
    },
    schema: {},
    fields: [
      pk(),
      dateCreated(),
      str('prenom',     'Prénom',     true),
      str('nom',        'Nom',        true),
      str('email',      'Email',      true),
      str('telephone',  'Téléphone',  true),
      str('poste',      'Poste',      true),
      str('entreprise', 'Entreprise', true),
      str('ville',      'Ville',      true),
      json('tags',      'Tags'),
      txt('notes',      'Notes'),
    ],
  })
}

// 4. Création de la collection prospects (schéma uniquement)
async function step4_prospects() {
  console.log('\n[4] Création de la collection prospects…')
  await createCollection({
    collection: 'prospects',
    meta: {
      icon: 'search',
      display_template: '{{prenom}} {{nom}}{{raison_sociale}}',
      singleton: false,
      translations: [{ language: 'fr-FR', translation: 'Prospects' }],
    },
    schema: {},
    fields: [
      pk(),
      dateCreated(),
      str('type',           'Type',            true),
      str('statut',         'Statut',          true),
      str('prenom',         'Prénom',           true),
      str('nom',            'Nom',             true),
      str('raison_sociale', 'Raison sociale',  true),
      str('email',          'Email',           true),
      str('telephone',      'Téléphone',       true),
      str('ville',          'Ville',           true),
      str('origine',        'Origine',         true),
      num('budget_estime',  'Budget estimé (€)'),
      str('evenement',      'Événement'),
      txt('notes',          'Notes'),
    ],
  })
}

// 5. Création de la collection entrepots (schéma uniquement)
async function step5_entrepots() {
  console.log('\n[5] Création de la collection entrepôts…')
  await createCollection({
    collection: 'entrepots',
    meta: {
      icon: 'warehouse',
      display_template: '{{nom}}',
      singleton: false,
      translations: [{ language: 'fr-FR', translation: 'Entrepôts' }],
    },
    schema: {},
    fields: [
      pk(),
      dateCreated(),
      str('nom',          'Nom'),
      str('adresse',      'Adresse'),
      str('ville',        'Ville',         true),
      str('code_postal',  'Code postal',   true),
      num('superficie',   'Superficie m²', 'integer'),
      str('responsable',  'Responsable',   true),
      str('telephone',    'Téléphone',     true),
      str('email',        'Email',         true),
      json('emplacements','Emplacements'),
      txt('notes',        'Notes'),
    ],
  })
}

// 6. Import des clients
async function step6_importClients() {
  console.log('\n[6] Import des clients…')
  const items = clientsData.map(c => ({
    type:         c.type,
    first_name:   c.prenom          ?? null,
    last_name:    c.nom             ?? null,
    company_name: c.raison_sociale  ?? null,
    email:        c.email           ?? null,
    phone:        c.telephone       ?? null,
    address:      c.adresse         ?? null,
    city:         c.ville           ?? null,
    zip_code:     c.code_postal     ?? null,
    siret:        c.siret           ?? null,
    secteur:      c.secteur         ?? null,
    notes:        c.notes           || null,
  }))

  const inserted = await req('POST', '/items/clients', items)
  const list = Array.isArray(inserted) ? inserted : [inserted]
  console.log(`  → ${list.length} client(s) importé(s)`)

  // Correspondance id JSON → id Directus
  const idMap = {}
  clientsData.forEach((c, i) => { idMap[c.id] = list[i].id })
  return idMap
}

// 7. Import des devis (extraits du JSON clients)
async function step7_importDevis(clientIdMap) {
  console.log('\n[7] Import des devis…')
  const items = []
  for (const c of clientsData) {
    for (const d of c.devis ?? []) {
      items.push({
        client:      clientIdMap[c.id],
        numero:      d.numero,
        statut:      d.statut,
        montant:     d.montant,
        description: d.description,
        valid_until: d.date_validite,
        // notes et file laissés null (le PDF sera uploadé manuellement)
        notes:       null,
        file:        null,
      })
    }
  }

  if (!items.length) {
    console.log('  → aucun devis à importer')
    return
  }

  const inserted = await req('POST', '/items/devis', items)
  const list = Array.isArray(inserted) ? inserted : [inserted]
  console.log(`  → ${list.length} devis importé(s)`)
}

// 8. Création de la collection faq (schéma uniquement)
async function step8_faq() {
  console.log('\n[8] Création de la collection faq…')
  await createCollection({
    collection: 'faq',
    meta: {
      icon: 'help',
      display_template: '{{categorie}}',
      singleton: false,
      sort_field: 'sort',
      translations: [{ language: 'fr-FR', translation: 'FAQ' }],
    },
    schema: {},
    fields: [
      pk(),
      dateCreated(),
      num('sort',      'Ordre',     'integer'),
      str('categorie', 'Catégorie', true),
      str('icon',      'Icône',     true),
      json('questions','Questions'),
    ],
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════')
  console.log('  Seed Fiestalok → Directus')
  console.log('══════════════════════════════════════════\n')

  await login()
  await step1_clientsFields()
  await step2_devisFields()
  await step3_contacts()
  await step4_prospects()
  await step5_entrepots()
  const clientIdMap = await step6_importClients()
  await step7_importDevis(clientIdMap)
  await step8_faq()

  console.log('\n══════════════════════════════════════════')
  console.log('  ✅  Terminé.')
  console.log('══════════════════════════════════════════')
}

main().catch(e => {
  console.error('\n❌ Erreur :', e.message)
  process.exit(1)
})
