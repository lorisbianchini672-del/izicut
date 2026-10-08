/**
 * Pub automatique « démo cinématique » pour n'importe quelle entreprise ou
 * association française, construite à partir de ses vraies données :
 * registre (nom, activité NAF, ville, date de création), site web (menu,
 * couleurs, logo, photos) et fiche marque (atouts, faits).
 *
 * Elle est produite instantanément, sans IA : le client voit tout de suite
 * une pub pro, puis le directeur de création IA l'affine. Si l'IA est
 * saturée, cette version reste — jamais d'écran vide ni de message d'erreur.
 */
import type { BrandProfile } from '../brand/types';
import type { MotionProject, Music, Scene } from './types';

type Sector = {
  key: string;
  /** Codes NAF (préfixes) et mots-clés de l'activité qui désignent ce secteur. */
  naf: string[];
  words: RegExp;
  /** Ce qu'on dit de l'activité sous le nom (« Boulangerie · Lyon »). */
  tag: string;
  /** Question au-dessus des boutons. */
  ask: string;
  chips: string[];
  /** La vraie demande d'un client, tapée dans la barre de recherche. */
  prompt: (city: string, tag: string) => string;
  nav: string[];
  title: string;
  button: string;
  /** Phrase finale ({name} = nom de la marque). */
  end: string;
  music: Music;
  bpm: number;
  palette: [string, string];
};

const SECTORS: Sector[] = [
  { key: 'boulangerie', naf: ['10.71', '10.72', '47.24'], words: /boulang|pâtiss|patiss|viennois/i, tag: 'Boulangerie · Pâtisserie', ask: 'Ce matin, ce sera *quoi* ?', chips: ['Pain du jour', 'Viennoiseries', 'Pâtisseries', 'Commande'], prompt: (c) => `Une bonne boulangerie artisanale ${c ? 'à ' + c : 'près de chez moi'}`, nav: ['Nos pains', 'Pâtisseries', 'Horaires'], title: 'Le goût du *fait maison*', button: 'Nous trouver', end: 'Ça sent bon chez *{name}*.', music: 'acoustic', bpm: 100, palette: ['#e8a24a', '#ffd89a'] },
  { key: 'restaurant', naf: ['56.'], words: /restau|brasserie|pizz|burger|sushi|traiteur|café|bar |bistro|crêp/i, tag: 'Restaurant', ask: 'Ce soir, *on mange où* ?', chips: ['Sur place', 'À emporter', 'Livraison', 'Réserver'], prompt: (c) => `Un bon restaurant ${c ? 'à ' + c : 'près de moi'} pour ce soir`, nav: ['La carte', 'Réserver', 'Contact'], title: 'Une table qui *régale*', button: 'Réserver', end: 'À table chez *{name}*.', music: 'chill', bpm: 92, palette: ['#ff7a1a', '#ffc23d'] },
  { key: 'hotel', naf: ['55.'], words: /hôtel|hotel|gîte|gite|chambre d|camping|résidence/i, tag: 'Hébergement', ask: 'Votre *séjour* ?', chips: ['Chambres', 'Petit-déjeuner', 'Week-end', 'Réserver'], prompt: (c) => `Un hôtel agréable ${c ? 'à ' + c : ''} pour ce week-end`.trim(), nav: ['Chambres', 'Services', 'Réserver'], title: 'Votre séjour, *en douceur*', button: 'Réserver', end: 'Bienvenue chez *{name}*.', music: 'chill', bpm: 84, palette: ['#c9a96e', '#f5e6c4'] },
  { key: 'beaute', naf: ['96.02', '96.04', '47.75'], words: /coiff|beauté|beaute|esthéti|esthet|ongl|barb|spa |institut|maquill/i, tag: 'Beauté · Bien-être', ask: 'On s’occupe de *vous* ?', chips: ['Coupe', 'Couleur', 'Soins', 'Rendez-vous'], prompt: (c) => `Un salon de qualité ${c ? 'à ' + c : 'près de chez moi'}, dispo cette semaine`, nav: ['Prestations', 'Tarifs', 'Rendez-vous'], title: 'Prenez soin *de vous*', button: 'Prendre RDV', end: 'Votre moment chez *{name}*.', music: 'pop', bpm: 112, palette: ['#ff5c8a', '#ffc1d6'] },
  { key: 'sport', naf: ['93.1', '85.51'], words: /sport|club|basket|foot|tennis|rugby|hand|judo|karaté|karate|danse|fitness|muscu|gym|natation|escalade|boxe|vélo|velo/i, tag: 'Club de sport', ask: 'Ton *niveau* ?', chips: ['Découverte', 'Jeunes', 'Adultes', 'Loisir'], prompt: (c, tag) => `Je cherche un ${tag === 'Club de sport' ? 'club de sport' : tag.toLowerCase()} ${c ? 'à ' + c : 'près de chez moi'} pour la rentrée`, nav: ['Le club', 'Équipes', 'Inscriptions'], title: 'Rejoins *l’équipe*', button: 'S’inscrire', end: 'Cette saison, c’est avec *{name}*.', music: 'electro', bpm: 124, palette: ['#1f6bff', '#ffd23d'] },
  { key: 'association', naf: ['94.'], words: /associa|amicale|comité|comite|bénévol|benevol|solidar/i, tag: 'Association', ask: 'Envie de *participer* ?', chips: ['Adhérer', 'Bénévolat', 'Événements', 'Faire un don'], prompt: (c) => `Une association où m’engager ${c ? 'à ' + c : 'près de chez moi'}`, nav: ['Nos actions', 'Agenda', 'Adhérer'], title: 'Ensemble, *on va plus loin*', button: 'Nous rejoindre', end: 'Rejoignez *{name}*.', music: 'acoustic', bpm: 104, palette: ['#22c55e', '#facc15'] },
  { key: 'comptable', naf: ['69.2'], words: /compta|expert|audit|gestion|paie/i, tag: 'Expertise comptable', ask: 'Vous êtes *plutôt* ?', chips: ['Création', 'TPE / PME', 'Indépendant', 'Association'], prompt: (c) => `Un expert-comptable réactif ${c ? 'à ' + c : ''} pour ma société`.replace('  ', ' '), nav: ['Expertises', 'Le cabinet', 'Contact'], title: 'Vos chiffres, *notre métier*', button: 'Prendre RDV', end: 'Gérez sereinement avec *{name}*.', music: 'epic', bpm: 92, palette: ['#2f6bff', '#22d3ee'] },
  { key: 'juridique', naf: ['69.1'], words: /avocat|notaire|huissier|juridi|droit/i, tag: 'Conseil juridique', ask: 'Votre *besoin* ?', chips: ['Famille', 'Entreprise', 'Immobilier', 'Travail'], prompt: (c) => `Un avocat de confiance ${c ? 'à ' + c : ''} pour un premier rendez-vous`.replace('  ', ' '), nav: ['Domaines', 'Le cabinet', 'Contact'], title: 'Défendre *vos intérêts*', button: 'Être rappelé', end: 'Faites confiance à *{name}*.', music: 'epic', bpm: 86, palette: ['#c9a96e', '#f5e6c4'] },
  { key: 'immobilier', naf: ['68.'], words: /immobili|agence immo|syndic|location/i, tag: 'Immobilier', ask: 'Votre *projet* ?', chips: ['Acheter', 'Vendre', 'Louer', 'Estimer'], prompt: (c) => `Je veux vendre mon appartement ${c ? 'à ' + c : ''} au bon prix`.replace('  ', ' '), nav: ['Acheter', 'Vendre', 'Estimation'], title: 'Votre projet, *entre de bonnes mains*', button: 'Estimer mon bien', end: 'Votre projet avec *{name}*.', music: 'pop', bpm: 108, palette: ['#ff7a1a', '#ffd23d'] },
  { key: 'btp', naf: ['41.', '42.', '43.'], words: /bâtiment|batiment|maçon|macon|plomb|électric|electric|menuis|peint|rénov|renov|couvr|charpent|carrel|chauff/i, tag: 'Artisan du bâtiment', ask: 'Vos *travaux* ?', chips: ['Rénovation', 'Dépannage', 'Neuf', 'Devis'], prompt: (c) => `Un artisan sérieux ${c ? 'à ' + c : 'près de chez moi'} pour mes travaux`, nav: ['Réalisations', 'Services', 'Devis'], title: 'Du travail *bien fait*', button: 'Demander un devis', end: 'Vos travaux avec *{name}*.', music: 'hiphop', bpm: 92, palette: ['#ff9f1c', '#ffe066'] },
  { key: 'auto', naf: ['45.'], words: /garage|auto|carross|pneu|moto|contrôle tech|controle tech/i, tag: 'Garage · Automobile', ask: 'Votre *véhicule* ?', chips: ['Entretien', 'Réparation', 'Pneus', 'Rendez-vous'], prompt: (c) => `Un garage honnête ${c ? 'à ' + c : 'près de chez moi'} pour la révision`, nav: ['Services', 'Atelier', 'Rendez-vous'], title: 'Votre voiture, *entre de bonnes mains*', button: 'Prendre RDV', end: 'Roulez tranquille avec *{name}*.', music: 'electro', bpm: 120, palette: ['#ef4444', '#facc15'] },
  { key: 'sante', naf: ['86.', '75.', '47.73', '47.74'], words: /médec|medec|kiné|kine|ostéo|osteo|dentist|infirm|pharma|vétér|veter|psycho|santé|sante|optic/i, tag: 'Santé', ask: 'Comment *on vous aide* ?', chips: ['Consultation', 'Prévention', 'Suivi', 'Rendez-vous'], prompt: (c) => `Un professionnel de santé disponible ${c ? 'à ' + c : 'près de chez moi'}`, nav: ['Soins', 'Équipe', 'Rendez-vous'], title: 'Votre santé, *notre priorité*', button: 'Prendre RDV', end: 'Prenez soin de vous avec *{name}*.', music: 'chill', bpm: 84, palette: ['#14b8a6', '#a7f3d0'] },
  { key: 'formation', naf: ['85.'], words: /école|ecole|formation|cours|enseign|lycée|lycee|collège|college|crèche|creche|soutien/i, tag: 'Formation', ask: 'Vous voulez *apprendre* ?', chips: ['Cours', 'Ateliers', 'En ligne', 'S’inscrire'], prompt: (c) => `Une formation de qualité ${c ? 'à ' + c : ''} qui commence bientôt`.replace('  ', ' '), nav: ['Formations', 'Pédagogie', 'Inscription'], title: 'Apprendre, *vraiment*', button: 'S’inscrire', end: 'Progressez avec *{name}*.', music: 'pop', bpm: 110, palette: ['#8b5cf6', '#fbbf24'] },
  { key: 'tech', naf: ['58.2', '62.', '63.'], words: /logiciel|informati|digital|numérique|numerique|web|appli|saas|dévelop|develop|data/i, tag: 'Tech · Digital', ask: 'Vous voulez *créer* ?', chips: ['Site web', 'Application', 'Automatiser', 'Conseil'], prompt: () => 'Je veux un outil simple pour faire gagner du temps à mon équipe', nav: ['Solutions', 'Projets', 'Contact'], title: 'Votre idée, *en ligne*', button: 'Démarrer', end: 'Construit avec *{name}*.', music: 'electro', bpm: 126, palette: ['#7c5cff', '#22d3ee'] },
  { key: 'conseil', naf: ['70.', '71.', '72.', '73.', '74.1', '78.', '82.'], words: /conseil|agence|marketing|communic|design|architect|recrut|événement|evenement/i, tag: 'Conseil · Agence', ask: 'Votre *objectif* ?', chips: ['Stratégie', 'Création', 'Accompagnement', 'Devis'], prompt: (c) => `Une agence ${c ? 'à ' + c : ''} pour faire décoller mon activité`.replace('  ', ' '), nav: ['Expertises', 'Références', 'Contact'], title: 'Vos projets, *plus loin*', button: 'Nous parler', end: 'Avancez avec *{name}*.', music: 'electro', bpm: 118, palette: ['#ff4d8d', '#ffb547'] },
  { key: 'photo', naf: ['74.2', '59.', '90.'], words: /photo|vidéo|video|film|spectacle|musique|théâtre|theatre|artiste|studio/i, tag: 'Création · Image', ask: 'Votre *projet* ?', chips: ['Mariage', 'Portrait', 'Entreprise', 'Événement'], prompt: (c) => `Un photographe talentueux ${c ? 'à ' + c : ''} pour un événement`.replace('  ', ' '), nav: ['Portfolio', 'Prestations', 'Contact'], title: 'Des images qui *racontent*', button: 'Me contacter', end: 'Vos souvenirs par *{name}*.', music: 'epic', bpm: 90, palette: ['#f59e0b', '#fde68a'] },
  { key: 'transport', naf: ['49.', '50.', '51.', '52.', '53.'], words: /transport|livraison|taxi|vtc|déménag|demenag|logisti|coursier/i, tag: 'Transport · Livraison', ask: 'On vous emmène *où* ?', chips: ['Course', 'Livraison', 'Déménagement', 'Devis'], prompt: (c) => `Un transport fiable ${c ? 'depuis ' + c : ''} demain matin`.replace('  ', ' '), nav: ['Services', 'Tarifs', 'Réserver'], title: 'À l’heure, *partout*', button: 'Réserver', end: 'En route avec *{name}*.', music: 'electro', bpm: 122, palette: ['#22c55e', '#a3e635'] },
  { key: 'tourisme', naf: ['79.', '91.', '93.2'], words: /voyage|tourism|loisir|parc|musée|musee|visite|escape|bowling|karting/i, tag: 'Loisirs · Sorties', ask: 'Ce week-end, *on fait quoi* ?', chips: ['En famille', 'Entre amis', 'Groupes', 'Réserver'], prompt: (c) => `Une sortie sympa ${c ? 'à ' + c : ''} ce week-end`.replace('  ', ' '), nav: ['Activités', 'Tarifs', 'Réserver'], title: 'Des souvenirs *à vivre*', button: 'Réserver', end: 'On s’amuse chez *{name}*.', music: 'pop', bpm: 118, palette: ['#06b6d4', '#fde047'] },
  { key: 'agriculture', naf: ['01.', '02.', '03.', '11.'], words: /ferme|maraîch|maraich|producteur|vigne|vin |domaine|bio |miel|fromag|élevage|elevage/i, tag: 'Producteur local', ask: 'Vous cherchez *quoi* ?', chips: ['Produits frais', 'Paniers', 'Vente directe', 'Visite'], prompt: (c) => `Des produits locaux et frais ${c ? 'près de ' + c : 'près de chez moi'}`, nav: ['Nos produits', 'La ferme', 'Points de vente'], title: 'Du champ *à votre table*', button: 'Nous trouver', end: 'Mangez local avec *{name}*.', music: 'acoustic', bpm: 98, palette: ['#84cc16', '#fde047'] },
  { key: 'finance', naf: ['64.', '65.', '66.'], words: /banque|assuran|courtier|crédit|credit|patrimoine|mutuelle/i, tag: 'Finance · Assurance', ask: 'Votre *projet* ?', chips: ['Épargne', 'Crédit', 'Assurance', 'Conseil'], prompt: (c) => `Un conseiller ${c ? 'à ' + c : ''} pour préparer mon projet`.replace('  ', ' '), nav: ['Solutions', 'Conseillers', 'Contact'], title: 'Vos projets, *sécurisés*', button: 'Être rappelé', end: 'Avancez sereinement avec *{name}*.', music: 'epic', bpm: 88, palette: ['#2563eb', '#93c5fd'] },
  { key: 'commerce', naf: ['47.', '46.'], words: /boutique|magasin|commerce|épicer|epicer|fleur|librair|vêtement|vetement|mode|bijou|cave|caviste/i, tag: 'Boutique', ask: 'Vous cherchez *quoi* ?', chips: ['Nouveautés', 'Idées cadeaux', 'Conseils', 'Nous trouver'], prompt: (c) => `Une boutique ${c ? 'à ' + c : 'près de chez moi'} avec du choix et de bons conseils`, nav: ['Boutique', 'Nouveautés', 'Contact'], title: 'Le bon choix, *près de chez vous*', button: 'Venir en boutique', end: 'Craquez chez *{name}*.', music: 'pop', bpm: 116, palette: ['#ff5c8a', '#ffb547'] },
  { key: 'services', naf: ['81.', '95.', '96.', '77.', '88.', '97.'], words: /nettoy|ménage|menage|répar|repar|pressing|garde|aide à domicile|services/i, tag: 'Services', ask: 'Besoin d’un *coup de main* ?', chips: ['À domicile', 'Entreprises', 'Urgence', 'Devis'], prompt: (c) => `Quelqu’un de fiable ${c ? 'à ' + c : 'près de chez moi'}, cette semaine`, nav: ['Services', 'Tarifs', 'Contact'], title: 'On s’occupe *de tout*', button: 'Demander un devis', end: 'Simplifiez-vous la vie avec *{name}*.', music: 'pop', bpm: 108, palette: ['#0ea5e9', '#a5f3fc'] }
];

const GENERIC: Sector = { key: 'generic', naf: [], words: /$^/, tag: 'Entreprise', ask: 'Vous cherchez *quoi* ?', chips: ['Découvrir', 'Nos services', 'Contact', 'Devis'], prompt: (c) => `Un professionnel de confiance ${c ? 'à ' + c : 'près de chez moi'}`, nav: ['Accueil', 'Services', 'Contact'], title: 'Votre partenaire *de confiance*', button: 'Nous contacter', end: 'Faites le bon choix : *{name}*.', music: 'pop', bpm: 112, palette: ['#7c5cff', '#ffbe76'] };

/** Secteur d'activité : code NAF du registre d'abord, puis mots de l'activité, du site et de la description du client. */
export function detectSector(p: BrandProfile): Sector {
  const naf = (p.company?.activityCode ?? '').trim();
  if (naf) {
    // Le préfixe le plus précis gagne (« 69.2 » avant « 69. »).
    let best: { s: Sector; len: number } | null = null;
    for (const s of SECTORS) for (const pre of s.naf) if (naf.startsWith(pre) && (!best || pre.length > best.len)) best = { s, len: pre.length };
    if (best) return best.s;
  }
  if (p.company?.isAssociation) return SECTORS.find((s) => s.key === 'association') ?? GENERIC;
  const hay = `${p.company?.activityLabel ?? ''} ${p.company?.name ?? ''} ${p.notes ?? ''} ${p.site?.title ?? ''} ${p.site?.description ?? ''}`;
  return SECTORS.find((s) => s.words.test(hay)) ?? GENERIC;
}

/** « BASKET CHARPENNES CROIX-LUIZET » → « Basket Charpennes Croix-Luizet » (32 caractères max, coupé au mot). */
export function displayName(p: BrandProfile): string {
  const raw = (p.company?.name || p.site?.title?.split(/[|–—-]/)[0] || 'Votre marque')
    .replace(/\b(SARL|SAS|SASU|EURL|SA|SCI|SNC|SCOP|SELARL|SELAS|EI|EIRL|SCM|SCP)\b\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || 'Votre marque';
  const nice = raw === raw.toUpperCase()
    ? raw.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/\b(De|Du|Des|La|Le|Les|Et|En|Au|Aux|À|D|L)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase())
    : raw;
  if (nice.length <= 32) return nice;
  const cut = nice.slice(0, 32);
  return cut.slice(0, cut.lastIndexOf(' ') > 12 ? cut.lastIndexOf(' ') : 32).trim();
}

const HEX = /^#[0-9a-f]{6}$/i;
function lum(h: string): number {
  const n = parseInt(h.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
}
function sat(h: string): number {
  const n = parseInt(h.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}
function darken(h: string, k: number): string {
  const n = parseInt(h.slice(1), 16);
  const m = (v: number) => Math.round(v * (1 - k));
  return '#' + ((1 << 24) | (m((n >> 16) & 255) << 16) | (m((n >> 8) & 255) << 8) | m(n & 255)).toString(16).slice(1);
}

/** Couleurs vives de la marque (fiche, puis site), sinon celles du secteur. Le fond reste quasi noir (style cinéma). */
function palette(p: BrandProfile, sector: Sector): { primary: string; accent: string; background: string } {
  const cands = [p.brief?.palette?.primary, p.brief?.palette?.accent, ...(p.site?.colors ?? [])]
    .filter((c): c is string => Boolean(c && HEX.test(c)))
    .map((c) => c.toLowerCase())
    .filter((c) => sat(c) > 0.28 && lum(c) > 45 && lum(c) < 235);
  const uniq = [...new Set(cands)];
  const primary = uniq[0] ?? sector.palette[0];
  const accent = uniq.find((c) => c !== primary && Math.abs(lum(c) - lum(primary)) > 25) ?? sector.palette[1];
  // Le flux de lumière a besoin d'une couleur assez claire pour briller sur le noir.
  const bright = (h: string) => (lum(h) >= 80 ? h : lighten(h, Math.min(0.55, (80 - lum(h)) / 120 + 0.15)));
  return { primary: bright(primary), accent: bright(accent), background: darken(primary, 0.94) };
}

function lighten(h: string, k: number): string {
  const n = parseInt(h.slice(1), 16);
  const m = (v: number) => Math.round(v + (255 - v) * k);
  return '#' + ((1 << 24) | (m((n >> 16) & 255) << 16) | (m((n >> 8) & 255) << 8) | m(n & 255)).toString(16).slice(1);
}

const SPORTS = ['basket', 'football', 'foot', 'rugby', 'handball', 'tennis', 'judo', 'karaté', 'natation', 'escalade', 'boxe', 'danse', 'gym', 'volley', 'badminton', 'cyclisme', 'athlétisme', 'escrime', 'golf', 'équitation', 'roller', 'hockey', 'ski', 'voile', 'aviron', 'triathlon', 'pétanque', 'yoga', 'fitness'];
/** Étiquette sous le nom, au plus juste (« Club de basket » plutôt que « Club de sport »). */
function sectorTag(p: BrandProfile, sector: Sector): string {
  if (sector.key !== 'sport') return sector.tag;
  const hay = `${p.company?.name ?? ''} ${p.company?.activityLabel ?? ''} ${p.site?.title ?? ''} ${p.notes ?? ''}`.toLowerCase();
  const sp = SPORTS.find((x) => hay.includes(x));
  return sp ? `Club de ${sp === 'foot' ? 'football' : sp}` : sector.tag;
}

const short = (s: string, n: number) => s.replace(/[.!]+$/, '').trim().slice(0, n);

export function buildCinematicAd(p: BrandProfile, opts: { photos: number; format?: MotionProject['format'] }): MotionProject {
  const sector = detectSector(p);
  const name = displayName(p);
  const city = (p.company?.city ?? '').replace(/\s+\d+(e|er|ème)?\s*arrondissement/i, '').trim();
  const niceCity = city && city === city.toUpperCase() ? city.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase()) : city;
  const pal = palette(p, sector);
  // Boutons : les vrais atouts de la fiche marque s'ils sont courts, sinon ceux du secteur.
  const strengths = (p.brief?.strengths ?? []).map((s) => short(s, 22)).filter((s) => s.length >= 3 && s.length <= 22);
  const chips = (strengths.length >= 3 ? strengths : sector.chips).slice(0, 4);
  const nav = (p.site?.nav ?? []).filter((x) => x.length <= 14 && !/^accueil$/i.test(x)).slice(0, 3);
  const year = Number(p.company?.createdAt?.slice(0, 4));
  const age = Number.isFinite(year) ? new Date().getFullYear() - year : 0;
  const scenes: Scene[] = [
    { type: 'logo', duration: 2.5, title: name, subtitle: niceCity ? `${sectorTag(p, sector)} · ${niceCity}` : sectorTag(p, sector), sfx: 'riser' },
    { type: 'prompt', duration: 3.5, text: sector.prompt(niceCity, sectorTag(p, sector)).slice(0, 120), label: name.slice(0, 24) },
    { type: 'chips', duration: 3, title: sector.ask, items: chips, pick: Math.min(1, chips.length - 1) },
    {
      type: 'mockup',
      duration: 3.5,
      title: sector.title,
      nav: nav.length >= 2 ? nav : sector.nav,
      button: sector.button,
      ...(opts.photos > 0 ? { photo: 0 } : {})
    }
  ];
  // Les vraies photos du client en héros (Ken Burns), avec ses vrais faits en légende.
  const facts = (p.brief?.facts ?? []).map((f) => short(f, 60)).filter((f) => f.length >= 8 && f.length <= 60);
  for (let i = 1; i < Math.min(opts.photos, 4); i++) {
    scenes.push({ type: 'photo', duration: 2.2, photo: i, layout: i % 2 ? 'full' : 'frame', captionPos: 'bottom', ...(facts[i - 1] ? { caption: facts[i - 1] } : {}) });
  }
  if (age >= 5 && age < 200) scenes.push({ type: 'title', duration: 2.3, anim: 'mask', title: niceCity ? `Depuis *${year}* à ${niceCity}` : `Depuis *${year}*` });
  const link = (p.link ?? p.site?.url ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 60);
  scenes.push({
    type: 'title',
    duration: 3,
    anim: 'curve',
    title: sector.end.replace('{name}', name).slice(0, 90),
    ...(link ? { magic: [{ kind: 'sticker' as const, text: 'Lien en bio', sub: link, emoji: '👇', at: 1.4, pos: 'bottom' as const }] } : {})
  });
  return {
    format: opts.format ?? '9:16',
    brand: name.slice(0, 40),
    theme: { background: pal.background, primary: pal.primary, accent: pal.accent, text: '#ffffff', style: 'neon', motif: 'flow', radius: p.site?.radius ?? 'pill', anim: 'blur' },
    transition: 'blur',
    sound: { music: sector.music, bpm: sector.bpm, volume: 0.8 },
    scenes: scenes.slice(0, 12)
  };
}
