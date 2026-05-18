// Script de reset + seed Directus — Fiestalok
// Usage: node seed.js
// Prérequis: npm install (dans calendar/) pour avoir axios disponible

import axios from 'axios'

const BASE_URL = 'https://back.fiestalok.fr'
const EMAIL    = 'contact@fiestalok.fr'
const PASSWORD = 'fiestalok2sxb!'

let token = null

// ── Auth ──────────────────────────────────────────────────────────────────────

async function auth() {
  const { data } = await axios.post(`${BASE_URL}/auth/login`, { email: EMAIL, password: PASSWORD })
  token = data.data.access_token
  console.log('✓ Authentifié')
}

function api(method, path, body = null, params = null) {
  return axios({
    method,
    url: `${BASE_URL}${path}`,
    headers: { Authorization: `Bearer ${token}` },
    data: body,
    params,
  }).then(r => r.data?.data ?? r.data)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function deleteAll(collection) {
  const items = await api('GET', `/items/${collection}`, null, { fields: 'id', limit: -1 }).catch(() => [])
  if (!items?.length) { process.stdout.write(`  skip ${collection} (vide)\n`); return 0 }
  const ids = items.map(i => i.id)
  await api('DELETE', `/items/${collection}`, ids)
  process.stdout.write(`  ✓ ${collection} — ${ids.length} supprimé(s)\n`)
  return ids.length
}

function pick(arr, n = 1) {
  return arr.slice(0, Math.min(n, arr.length))
}

function dateOffset(days) {
  const dt = new Date()
  dt.setDate(dt.getDate() + days)
  return dt.toISOString().split('T')[0]
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await auth()

  // ── Phase 1 : Suppression (ordre FK-safe) ──────────────────────────────────
  console.log('\n🗑  Suppression des données transactionnelles...')
  await deleteAll('reservations_consommables')
  await deleteAll('gamme_articles_materiel')
  await deleteAll('reservations_articles')
  await deleteAll('reservations_produits')
  await deleteAll('devis')
  await deleteAll('factures')
  await deleteAll('commentaires')
  await deleteAll('reservations')
  await deleteAll('clients')
  await deleteAll('contacts')
  await deleteAll('prospects')

  // ── Phase 2 : Entrepôts ────────────────────────────────────────────────────
  console.log('\n🏭  Entrepôts...')
  const existingEntrepots = await api('GET', '/items/entrepots', null, { fields: 'id,nom', limit: -1 }).catch(() => [])
  const entrepotMap = {}
  for (const e of existingEntrepots ?? []) entrepotMap[e.nom] = e.id

  const entrepotNames = ['François Home', 'Jonathan Home']
  for (const nom of entrepotNames) {
    if (!entrepotMap[nom]) {
      const e = await api('POST', '/items/entrepots', { nom })
      entrepotMap[nom] = e.id
      console.log(`  ✓ Créé : ${nom} (id ${e.id})`)
    } else {
      console.log(`  skip : ${nom} existe déjà (id ${entrepotMap[nom]})`)
    }
  }

  // ── Phase 2b : Champ name sur articles ────────────────────────────────────
  console.log('\n🔑  Vérification champ articles.name...')
  await api('POST', '/fields/articles', {
    field: 'name',
    type: 'string',
    meta: { interface: 'input', display: 'raw', required: false, hidden: false, label: 'Nom' },
    schema: { is_nullable: true, data_type: 'varchar', max_length: 255 },
  }).then(() => console.log('  ✓ Champ name créé'))
    .catch(() => console.log('  skip : champ name existe déjà'))

  // ── Phase 3 : Chargement des produits et articles existants ───────────────
  console.log('\n📦  Chargement des produits existants...')
  const produits = await api('GET', '/items/produits', null, {
    fields: 'id,name,price',
    filter: { status: { _neq: 'archived' } },
    limit: -1,
    sort: 'name',
  }).catch(() => [])
  console.log(`  ${produits.length} produit(s) trouvé(s)${produits.length ? ' : ' + produits.map(p => p.name).join(', ') : ''}`)

  console.log('\n🔧  Chargement des articles principaux...')
  const articles = await api('GET', '/items/articles', null, {
    fields: 'id,reference,produit_id',
    filter: { type: { _eq: 'principal' } },
    limit: -1,
  }).catch(() => [])
  console.log(`  ${articles.length} article(s) principal(aux) trouvé(s)`)

  // Helper : trouver les articles liés à un produit
  function articlesForProduits(produitIds) {
    return articles.filter(a => {
      const pid = typeof a.produit_id === 'object' ? a.produit_id?.id : a.produit_id
      return produitIds.includes(pid)
    })
  }

  // ── Phase 3b : Articles ────────────────────────────────────────────────────
  console.log('\n🔧  Création des articles...')
  await deleteAll('articles')

  const produitByName = Object.fromEntries(produits.map(p => [p.name, p]))
  const chateau   = produitByName['Chateau gonflable croco XL']
  const photobooth = produitByName['Photobooth premium']
  const tonelle   = produitByName['Tonelle 4x4']
  const fHome = entrepotMap['François Home']
  const jHome = entrepotMap['Jonathan Home']

  const articlesData = [
    // Château gonflable croco XL
    ...(chateau ? [
      { name: 'Château Croco XL — Unité 1', reference: 'CG-001', type: 'principal', produit_id: chateau.id, entrepot_id: jHome, etat: 'disponible', valeur_achat: 3500 },
      { name: 'Château Croco XL — Unité 2', reference: 'CG-002', type: 'principal', produit_id: chateau.id, entrepot_id: fHome, etat: 'disponible', valeur_achat: 3500 },
    ] : []),
    // Photobooth premium
    ...(photobooth ? [
      { name: 'Photobooth Premium — Unité 1', reference: 'PB-001', type: 'principal', produit_id: photobooth.id, entrepot_id: jHome, etat: 'disponible', valeur_achat: 2800 },
      { name: 'Photobooth Premium — Unité 2', reference: 'PB-002', type: 'principal', produit_id: photobooth.id, entrepot_id: jHome, etat: 'disponible', valeur_achat: 2800 },
    ] : []),
    // Tonelle 4x4
    ...(tonelle ? [
      { name: 'Tonelle 4x4 — Unité 1', reference: 'TO-001', type: 'principal', produit_id: tonelle.id, entrepot_id: fHome, etat: 'disponible', valeur_achat: 1200 },
      { name: 'Tonelle 4x4 — Unité 2', reference: 'TO-002', type: 'principal', produit_id: tonelle.id, entrepot_id: fHome, etat: 'disponible', valeur_achat: 1200 },
    ] : []),
  ]

  const createdArticles = []
  for (const a of articlesData) {
    const created = await api('POST', '/items/articles', a)
    createdArticles.push(created)
    console.log(`  ✓ ${a.reference} — ${a.name}`)
  }
  // Mettre à jour la liste articles pour la suite (réservations)
  articles.splice(0, articles.length, ...createdArticles.map(a => ({ ...a, produit_id: a.produit_id })))
  console.log(`  ${createdArticles.length} article(s) créé(s)`)

  // ── Phase 3c : Articles secondaires + liaison gammes ─────────────────────
  console.log('\n🎒  Création des articles secondaires (matériel gammes)...')

  // produits_gammes: gamme_id=1 → produit 35 (Château gonflable croco XL)
  // On relit la liaison pour être robuste si les IDs changent
  const produitGammes = await api('GET', '/items/produits_gammes', null, { fields: 'id,produit_id,gamme_id', limit: -1 }).catch(() => [])

  const secondairesData = [
    // Gamme Château — matériel d'exploitation
    { gamme: 'chateau', name: 'Bâche de protection',     reference: 'BCH-001', entrepot: 'Jonathan Home', valeur: 120 },
    { gamme: 'chateau', name: 'Enrouleur électrique',    reference: 'ENR-001', entrepot: 'Jonathan Home', valeur: 85  },
    { gamme: 'chateau', name: 'Groupe électrogène',      reference: 'GRP-001', entrepot: 'François Home', valeur: 950 },
    { gamme: 'chateau', name: 'Jerican carburant',       reference: 'JRC-001', entrepot: 'François Home', valeur: 25  },
    { gamme: 'chateau', name: 'Plaque anti-vibration',   reference: 'PAV-001', entrepot: 'Jonathan Home', valeur: 60  },
  ]

  // Trouver la gamme pour le château (produit_id = chateau.id)
  const chateauId = chateau?.id
  const chateauGammeLink = produitGammes.find(pg => pg.produit_id === chateauId)
  const chateauGammeId = chateauGammeLink?.gamme_id ?? null

  if (!chateauGammeId) {
    console.log('  ⚠️  Aucune gamme liée au château — articles secondaires ignorés')
  } else {
    for (const s of secondairesData) {
      const art = await api('POST', '/items/articles', {
        name:         s.name,
        reference:    s.reference,
        type:         'secondaire',
        produit_id:   null,
        entrepot_id:  entrepotMap[s.entrepot] ?? null,
        etat:         'disponible',
        valeur_achat: s.valeur,
      })
      await api('POST', '/items/gamme_articles_materiel', {
        gamme_id:   chateauGammeId,
        article_id: art.id,
      })
      console.log(`  ✓ ${s.reference} — ${s.name} → gamme #${chateauGammeId}`)
    }
  }

  // ── Phase 4 : Clients ──────────────────────────────────────────────────────
  console.log('\n👥  Création des clients...')

  const clientsData = [
    {
      typeClient: 'particulier',
      first_name: 'Sophie', last_name: 'Martin',
      email: 'sophie.martin@gmail.com', phone: '06 12 34 56 78',
      address: '12 rue des Lilas', city: 'Lyon', zip_code: '69001',
    },
    {
      typeClient: 'particulier',
      first_name: 'Lucas', last_name: 'Dubois',
      email: 'lucas.dubois@hotmail.fr', phone: '06 98 76 54 32',
      address: '5 avenue Pasteur', city: 'Bordeaux', zip_code: '33000',
    },
    {
      typeClient: 'particulier',
      first_name: 'Emma', last_name: 'Bernard',
      email: 'emma.bernard@orange.fr', phone: '07 45 23 67 89',
      address: '8 impasse des Roses', city: 'Nantes', zip_code: '44000',
      notes: 'Anniversaire enfants chaque année',
    },
    {
      typeClient: 'professionnel',
      first_name: 'Jean', last_name: 'Dupont',
      company_name: 'Mairie de Schiltigheim',
      email: 'evenements@schiltigheim.fr', phone: '03 88 83 40 40',
      address: '1 Place de la République', city: 'Schiltigheim', zip_code: '67300',
      siret: '21670450400019', secteur: 'Collectivité',
    },
    {
      typeClient: 'professionnel',
      first_name: 'Aurélie', last_name: 'Keller',
      company_name: 'Les Jardins Events',
      email: 'contact@jardins-events.fr', phone: '06 71 22 33 44',
      address: '47 route du Général de Gaulle', city: 'Illkirch-Graffenstaden', zip_code: '67400',
      siret: '84312765000021', secteur: 'Événementiel',
      notes: 'Partenaire régulier — tarif préférentiel',
    },
    {
      typeClient: 'particulier',
      first_name: 'Thomas', last_name: 'Schmitt',
      email: 'thomas.schmitt@gmail.com', phone: '06 33 44 55 66',
      address: '22 rue du Fossé des Treize', city: 'Strasbourg', zip_code: '67000',
    },
    {
      typeClient: 'particulier',
      first_name: 'Camille', last_name: 'Lefebvre',
      email: 'camille.lefebvre@gmail.com', phone: '07 55 66 77 88',
      address: '3 allée des Chênes', city: 'Mulhouse', zip_code: '68100',
    },
  ]

  const clients = []
  for (const c of clientsData) {
    const created = await api('POST', '/items/clients', c)
    clients.push(created)
    console.log(`  ✓ ${c.first_name} ${c.last_name}${c.company_name ? ' (' + c.company_name + ')' : ''}`)
  }

  // ── Phase 5 : Réservations ────────────────────────────────────────────────
  if (!produits.length) {
    console.log('\n⚠️  Aucun produit en base — réservations ignorées')
  } else {
    console.log('\n📅  Création des réservations...')

    const p1 = produits[0]
    const p2 = produits[1] ?? produits[0]
    const p3 = produits[2] ?? produits[0]

    const scenarios = [
      // en_attente — demande entrante récente
      {
        res: {
          client: clients[0].id,
          date_start: dateOffset(18), date_end: dateOffset(18),
          status: 'en_attente',
          delivery: false,
          total_price: null,
          notes: 'Anniversaire 6 ans, prévoir décoration rose',
        },
        selectedProduits: [p1],
      },
      // en_attente — demande sans date précise
      {
        res: {
          client: clients[1].id,
          date_start: dateOffset(10), date_end: dateOffset(10),
          status: 'en_attente',
          delivery: false,
          total_price: null,
          notes: null,
        },
        selectedProduits: [p1],
      },
      // devis_realise — devis envoyé, en attente accord client
      {
        res: {
          client: clients[2].id,
          date_start: dateOffset(25), date_end: dateOffset(26),
          status: 'devis_realise',
          delivery: true,
          delivery_address: '8 impasse des Roses, 44000 Nantes',
          total_price: (p1.price ?? 300) + (p2.price ?? 300),
          notes: null,
        },
        selectedProduits: [p1, p2],
      },
      // devis_confirme — confirmé, à préparer
      {
        res: {
          client: clients[4].id,
          date_start: dateOffset(35), date_end: dateOffset(36),
          status: 'devis_confirme',
          delivery: true,
          delivery_address: '47 route du Général de Gaulle, 67400 Illkirch-Graffenstaden',
          total_price: (p1.price ?? 350) * 2,
          notes: 'Fête de fin d\'année entreprise — 80 personnes',
        },
        selectedProduits: [p1, p2],
      },
      // terminee — passée
      {
        res: {
          client: clients[3].id,
          date_start: dateOffset(-12), date_end: dateOffset(-12),
          status: 'terminee',
          delivery: true,
          delivery_address: '1 Place de la République, 67300 Schiltigheim',
          total_price: (p1.price ?? 300) + (p2.price ?? 300) + (p3.price ?? 300),
          notes: 'Fête de quartier annuelle — très bon retour client',
        },
        selectedProduits: [p1, p2, p3],
      },
    ]

    for (const { res, selectedProduits } of scenarios) {
      const reservation = await api('POST', '/items/reservations', res)
      process.stdout.write(`  ✓ Réservation ${reservation.id} (${res.status})`)

      // Lier produits
      for (const p of selectedProduits) {
        await api('POST', '/items/reservations_produits', {
          reservations_id: reservation.id,
          produits_id: p.id,
          quantity: 1,
          unit_price: p.price ?? 0,
        })
      }

      // Lier articles principaux correspondants (max 1 par produit)
      const linkedArticles = articlesForProduits(selectedProduits.map(p => p.id))
      for (const art of linkedArticles.slice(0, selectedProduits.length)) {
        await api('POST', '/items/reservations_articles', {
          reservations_id: reservation.id,
          articles_id: art.id,
        })
      }

      process.stdout.write(` — ${selectedProduits.map(p => p.name).join(', ')}\n`)
    }
  }

  // ── Phase 6 : Contacts & Prospects ───────────────────────────────────────
  console.log('\n📞  Contacts...')
  const contactsData = [
    { nom: 'Marie Lacroix', email: 'marie.lacroix@mairie67.fr', phone: '03 88 12 34 56' },
    { nom: 'Pierre Weber',  email: 'p.weber@webevents.fr',      phone: '06 55 44 33 22' },
  ]
  for (const c of contactsData) {
    await api('POST', '/items/contacts', c)
    console.log(`  ✓ ${c.nom}`)
  }

  console.log('\n🔍  Prospects...')
  const prospectsData = [
    { email: 'famille.meyer@gmail.com',      phone: '06 11 22 33 44', notes: 'Intéressé château gonflable pour juillet' },
    { email: 'club@wolfisheim-sports.fr',    phone: '03 88 99 00 11', notes: 'Journée portes ouvertes fin août' },
    { email: 'marlene.fischer@outlook.com',  phone: '07 22 33 44 55', notes: 'Demande de devis reçue par Instagram' },
  ]
  for (const p of prospectsData) {
    await api('POST', '/items/prospects', p)
    console.log(`  ✓ ${p.email}`)
  }

  console.log('\n✅  Seed terminé avec succès !')
  console.log(`   • ${clients.length} clients`)
  console.log(`   • 5 réservations (${produits.length ? 'liées aux produits existants' : 'ignorées — aucun produit'})`)
  console.log(`   • ${contactsData.length} contacts, ${prospectsData.length} prospects`)
}

main().catch(err => {
  const detail = err.response?.data?.errors?.[0]?.message ?? err.response?.data ?? err.message
  console.error('\n❌  Erreur :', detail)
  process.exit(1)
})
