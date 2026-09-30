import { ENTREPRISE } from './entreprise.js'

// Conditions générales de location, imprimées à la suite de chaque devis.
// Dans `contenu` : une chaîne = un paragraphe, { sousTitre } = un intertitre.
export const CGV = {
  titre:     'Conditions générales de location',
  miseAJour: 'septembre 2026',

  preambule: [
    `Les présentes conditions générales de location régissent l'activité de l'association ${ENTREPRISE.nom}, `
      + `dont le siège est situé ${ENTREPRISE.adresse} (SIRET ${ENTREPRISE.siret}), spécialisée dans la location `
      + 'de matériel festif : structures gonflables, photobooths, sonorisation, machines festives, tonnelles, etc.',
    'Elles s\'appliquent à tous nos clients : particuliers, entreprises, associations et collectivités.',
  ],

  articles: [
    {
      titre: 'Objet',
      contenu: [
        `${ENTREPRISE.nom} propose la mise à disposition temporaire de matériel événementiel. La signature d'un devis `
          + 'ou le paiement d\'un acompte entraîne l\'adhésion totale et sans réserve du client aux présentes conditions.',
      ],
    },
    {
      titre: 'Réservation et règlement',
      contenu: [
        'La réservation est validée dès réception du devis signé et d\'un acompte de 30 % du montant total. '
          + 'À défaut d\'acompte, la signature du devis engage fermement le client. En cas de désistement, '
          + 'une indemnité de 30 % reste due.',
        'Le solde doit être réglé au plus tard lors de la mise à disposition du matériel. Les paiements s\'effectuent '
          + 'par virement bancaire, par carte bancaire ou en espèces (dans la limite du plafond légal). Pour les '
          + 'professionnels, des délais de paiement peuvent être accordés selon les mentions portées au devis.',
      ],
    },
    {
      titre: 'Annulation',
      contenu: [
        'Toute annulation intervenant moins de 30 jours avant l\'événement entraîne la facturation de l\'intégralité '
          + 'de la prestation, sauf cas de force majeure prouvé. Les intempéries ne sont pas considérées comme un motif '
          + 'd\'annulation automatique sans frais.',
      ],
    },
    {
      titre: 'Caution et responsabilité',
      contenu: [
        `Bien qu'${ENTREPRISE.nom} puisse choisir de ne pas encaisser de caution systématique, le client est `
          + 'contractuellement responsable de l\'état du matériel. En cas de dégradation, casse, perte ou vol, '
          + `${ENTREPRISE.nom} facturera au client les frais de remise en état ou le remplacement à la valeur à neuf du matériel.`,
        'Le client devient responsable du matériel dès sa mise à disposition et jusqu\'à sa restitution complète. '
          + 'Il est également responsable des utilisateurs, des dommages corporels, matériels ou immatériels pouvant '
          + 'survenir pendant la durée de location. Le client certifie être couvert par une assurance responsabilité '
          + 'civile couvrant les dommages causés au matériel loué, aux utilisateurs et aux tiers. '
          + `${ENTREPRISE.nom} pourra demander une attestation d'assurance à tout moment.`,
        `${ENTREPRISE.nom} est titulaire d'une assurance responsabilité civile professionnelle. En cas de blessure, `
          + 'les dommages corporels subis par un utilisateur relèvent de sa propre assurance.',
      ],
    },
    {
      titre: 'Livraison, installation et retrait',
      contenu: [
        'Selon ce que prévoit le devis, le matériel est soit livré, installé puis démonté par notre équipe sur le '
          + 'lieu de l\'événement, soit retiré et rapporté par le client à notre dépôt de Strasbourg. La livraison, '
          + 'l\'installation et le démontage sont facturés selon un forfait qui dépend de la distance, indiqué sur le devis.',
        'La livraison et l\'installation s\'entendent en rez-de-chaussée, sur un emplacement facilement accessible '
          + 'depuis le véhicule. Toute manutention complexe (étages, escaliers, accès difficile) ou installation non '
          + 'prévue au devis initial sera facturée en supplément. Le client est tenu de contrôler le matériel dès sa '
          + 'réception et de signaler immédiatement tout défaut.',
        'Tout retard dans la restitution du matériel pourra entraîner une facturation supplémentaire calculée selon '
          + 'le tarif journalier en vigueur.',
      ],
    },
    {
      titre: 'Usage et sécurité',
      contenu: [
        'Le client assume la garde juridique du matériel dès sa réception. Il s\'engage à l\'utiliser de manière '
          + 'prudente et conforme aux consignes techniques transmises (notamment pour les photobooths et les jeux '
          + 'gonflables). Toute modification ou sous-location du matériel est interdite.',
        'Les structures gonflables doivent être surveillées en permanence par un adulte responsable. Le client '
          + 's\'engage à respecter les capacités maximales indiquées ainsi que les consignes de sécurité transmises par '
          + `${ENTREPRISE.nom}. La responsabilité d'${ENTREPRISE.nom} ne pourra être engagée en cas de mauvaise `
          + 'utilisation du matériel, de surveillance insuffisante ou de non-respect des consignes de sécurité.',
      ],
    },
    {
      titre: 'Vigilance météorologique',
      contenu: [
        'Le client s\'engage à surveiller les conditions météo. Pour les structures gonflables, l\'usage doit cesser '
          + 'immédiatement dès que le vent atteint 38 km/h. En cas d\'alerte, le client doit évacuer et sécuriser les '
          + `installations. ${ENTREPRISE.nom} décline toute responsabilité en cas de sinistre lié au vent ou à la `
          + 'foudre si les consignes d\'évacuation n\'ont pas été suivies.',
        'En cas de pluie, d\'orage, de fortes rafales ou de conditions météorologiques présentant un risque pour la '
          + 'sécurité, les structures gonflables doivent être immédiatement évacuées et la soufflerie coupée sans délai.',
      ],
    },
    {
      titre: 'Publicité et droit à l\'image',
      contenu: [
        `${ENTREPRISE.nom} s'autorise à photographier ses installations sur le lieu de l'événement à des fins `
          + 'promotionnelles (site web, réseaux sociaux), sauf demande contraire expresse et écrite du client avant '
          + 'l\'événement.',
      ],
    },
    {
      titre: 'Prix et TVA',
      contenu: [
        'Les prix sont exprimés en euros. Le régime de TVA applicable est précisé sur chaque devis : TVA au taux en '
          + 'vigueur, ou mention « TVA non applicable, article 293 B du CGI ».',
      ],
    },
    {
      titre: 'Litiges',
      contenu: [
        'En cas de différend relatif à l\'exécution du contrat, les parties rechercheront d\'abord une solution '
          + 'amiable. À défaut d\'accord, le litige sera porté devant la juridiction compétente selon les règles de '
          + 'droit commun.',
      ],
    },
    {
      titre: 'Conditions spécifiques',
      contenu: [
        { sousTitre: 'Structures gonflables' },
        'Il est interdit de déplacer la structure gonflable, de retirer les ancrages ou de modifier les systèmes de '
          + 'fixation. Le client s\'engage à maintenir en permanence tous les dispositifs de sécurité et de fixation '
          + `installés par ${ENTREPRISE.nom}.`,
        { sousTitre: 'Photobooth' },
        'Le client est responsable de toute mauvaise manipulation du photobooth. Le matériel doit être protégé de la '
          + 'pluie, de l\'humidité et de toute projection liquide.',
        { sousTitre: 'Matériel électrique' },
        'Toute utilisation extérieure sans protection adaptée est interdite. Le client s\'engage à utiliser des '
          + 'branchements conformes et sécurisés, à éviter toute surcharge électrique et à protéger le matériel contre '
          + 'la pluie et l\'humidité.',
      ],
    },
  ],

  conclusion: 'La signature du devis ou le paiement de l\'acompte vaut, pour le client, reconnaissance d\'avoir pris '
    + 'connaissance des consignes de sécurité et engagement à les respecter.',
}
