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

export function nafLabel(code?: string | null): string | undefined {
  if (!code) return undefined;
  return DIVISIONS[code.slice(0, 2)];
}
