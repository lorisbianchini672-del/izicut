/**
 * Libellés des divisions NAF rév. 2 (2 premiers chiffres du code APE), pour
 * afficher une activité lisible quand le registre ne renvoie que le code.
 */
const DIVISIONS: Record<string, string> = {
  '01': 'Agriculture', '02': 'Sylviculture', '03': 'Pêche et aquaculture', '05': 'Extraction de houille', '06': 'Extraction d’hydrocarbures',
  '07': 'Extraction de minerais', '08': 'Autres industries extractives', '09': 'Services aux industries extractives',
  '10': 'Industries alimentaires', '11': 'Fabrication de boissons', '12': 'Fabrication de produits à base de tabac', '13': 'Industrie textile',
  '14': 'Industrie de l’habillement', '15': 'Industrie du cuir et de la chaussure', '16': 'Travail du bois', '17': 'Industrie du papier et du carton',
  '18': 'Imprimerie', '19': 'Cokéfaction et raffinage', '20': 'Industrie chimique', '21': 'Industrie pharmaceutique', '22': 'Produits en caoutchouc et plastique',
  '23': 'Produits minéraux non métalliques', '24': 'Métallurgie', '25': 'Fabrication de produits métalliques', '26': 'Produits informatiques et électroniques',
  '27': 'Équipements électriques', '28': 'Machines et équipements', '29': 'Industrie automobile', '30': 'Autres matériels de transport', '31': 'Fabrication de meubles',
  '32': 'Autres industries manufacturières', '33': 'Réparation et installation de machines', '35': 'Production d’électricité et de gaz', '36': 'Captage et distribution d’eau',
  '37': 'Collecte des eaux usées', '38': 'Gestion des déchets et recyclage', '39': 'Dépollution', '41': 'Construction de bâtiments', '42': 'Génie civil',
  '43': 'Travaux de construction spécialisés', '45': 'Commerce et réparation automobile', '46': 'Commerce de gros', '47': 'Commerce de détail',
  '49': 'Transports terrestres', '50': 'Transports par eau', '51': 'Transports aériens', '52': 'Entreposage et logistique', '53': 'Activités de poste et de courrier',
  '55': 'Hébergement', '56': 'Restauration', '58': 'Édition', '59': 'Production audiovisuelle et musicale', '60': 'Radio et télévision', '61': 'Télécommunications',
  '62': 'Programmation et conseil informatique', '63': 'Services d’information', '64': 'Services financiers', '65': 'Assurance', '66': 'Activités auxiliaires de finance et d’assurance',
  '68': 'Activités immobilières', '69': 'Activités juridiques et comptables', '70': 'Conseil de gestion', '71': 'Architecture et ingénierie', '72': 'Recherche-développement',
  '73': 'Publicité et études de marché', '74': 'Autres activités spécialisées (design, photo…)', '75': 'Activités vétérinaires', '77': 'Location et location-bail',
  '78': 'Activités liées à l’emploi', '79': 'Agences de voyage', '80': 'Sécurité et enquêtes', '81': 'Services aux bâtiments et aménagement paysager',
  '82': 'Services administratifs et de soutien', '84': 'Administration publique', '85': 'Enseignement', '86': 'Santé humaine', '87': 'Hébergement médico-social',
  '88': 'Action sociale sans hébergement', '90': 'Activités créatives, artistiques et de spectacle', '91': 'Bibliothèques, musées et patrimoine', '92': 'Jeux de hasard',
  '93': 'Activités sportives et de loisirs', '94': 'Activités associatives', '95': 'Réparation d’ordinateurs et de biens personnels', '96': 'Autres services personnels (coiffure, beauté…)',
  '97': 'Ménages employeurs', '99': 'Organisations extraterritoriales'
};

/** Sous-classes les plus courantes chez les TPE, commerces et associations. */
const COMMON: Record<string, string> = {
  '10.13B': 'Charcuterie', '10.71B': 'Cuisson de produits de boulangerie', '10.71C': 'Boulangerie-pâtisserie', '10.71D': 'Pâtisserie',
  '43.21A': 'Électricité (bâtiment)', '43.22A': 'Plomberie', '43.22B': 'Chauffage et climatisation', '43.31Z': 'Plâtrerie', '43.32A': 'Menuiserie',
  '43.34Z': 'Peinture et vitrerie', '43.39Z': 'Finitions du bâtiment', '43.91B': 'Couverture', '45.11Z': 'Vente de véhicules', '45.20A': 'Garage automobile',
  '47.11B': 'Supérette', '47.11D': 'Supermarché', '47.22Z': 'Boucherie', '47.24Z': 'Boulangerie-pâtisserie (commerce)', '47.25Z': 'Caviste',
  '47.29Z': 'Épicerie fine', '47.71Z': 'Boutique de vêtements', '47.72A': 'Magasin de chaussures', '47.73Z': 'Pharmacie', '47.75Z': 'Parfumerie et cosmétiques',
  '47.76Z': 'Fleuriste', '47.77Z': 'Bijouterie', '47.78C': 'Commerce de détail spécialisé', '47.91B': 'Vente à distance (e-commerce)',
  '49.32Z': 'Taxi / VTC', '49.41B': 'Transport routier de marchandises', '53.20Z': 'Livraison et coursiers', '55.10Z': 'Hôtel', '55.20Z': 'Hébergement touristique',
  '56.10A': 'Restaurant traditionnel', '56.10B': 'Cafétéria et libre-service', '56.10C': 'Restauration rapide', '56.21Z': 'Traiteur', '56.30Z': 'Bar / café',
  '59.11B': 'Production de films institutionnels et publicitaires', '62.01Z': 'Développement informatique', '62.02A': 'Conseil informatique',
  '68.31Z': 'Agence immobilière', '69.10Z': 'Cabinet d’avocats / juridique', '69.20Z': 'Expertise comptable', '70.22Z': 'Conseil aux entreprises',
  '71.11Z': 'Architecture', '73.11Z': 'Agence de publicité', '74.10Z': 'Design', '74.20Z': 'Photographie', '75.00Z': 'Vétérinaire',
  '81.21Z': 'Nettoyage de locaux', '81.30Z': 'Paysagiste', '85.51Z': 'Enseignement sportif et de loisirs', '85.52Z': 'Enseignement culturel (musique, danse…)',
  '85.53Z': 'Auto-école', '85.59A': 'Formation continue', '85.59B': 'Soutien scolaire et formations', '86.21Z': 'Médecin généraliste', '86.23Z': 'Dentiste',
  '86.90D': 'Infirmier(e)', '86.90E': 'Kinésithérapie et rééducation', '86.90F': 'Santé (autres praticiens)', '88.91A': 'Crèche', '88.99B': 'Action sociale',
  '90.01Z': 'Spectacle vivant', '90.02Z': 'Soutien au spectacle vivant', '90.03A': 'Création artistique', '93.11Z': 'Installations sportives', '93.12Z': 'Club de sport',
  '93.13Z': 'Salle de sport / fitness', '93.19Z': 'Activités sportives', '93.29Z': 'Loisirs et événements', '94.11Z': 'Organisation patronale', '94.12Z': 'Organisation professionnelle',
  '94.20Z': 'Syndicat', '94.91Z': 'Organisation religieuse', '94.99Z': 'Association', '96.02A': 'Coiffure', '96.02B': 'Institut de beauté',
  '96.04Z': 'Bien-être et soins du corps', '96.09Z': 'Services personnels'
};

export function nafLabel(code?: string | null): string | undefined {
  if (!code) return undefined;
  return COMMON[code] ?? DIVISIONS[code.slice(0, 2)];
}
