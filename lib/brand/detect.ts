/**
 * Repère le nom d'une marque / enseigne citée dans une demande
 * (« une vidéo sur les magasins Carrefour » → « Carrefour »), pour que la pub
 * parle VRAIMENT de cette marque (nom, logo, couleurs, site).
 */
const NOT_BRANDS = new Set(['Lyon', 'Paris', 'Marseille', 'Lille', 'Toulouse', 'Nice', 'Nantes', 'Bordeaux', 'Strasbourg', 'Montpellier', 'Rennes', 'Villeurbanne', 'France', 'Europe', 'Noël', 'Pâques', 'TikTok', 'Instagram', 'YouTube', 'Facebook', 'Reels', 'Shorts', 'Halloween', 'Black', 'Friday', 'Saint', 'Valentin', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre', 'IA', 'Pub', 'Vidéo', 'Je', 'Tu', 'Il', 'On', 'Nous', 'Vous']);

export function detectBrandName(text: string): string | null {
  const t = ` ${text.replace(/\s+/g, ' ')} `;
  // Après « pour / sur / chez / de / les magasins / la marque / l'enseigne… » : un ou plusieurs mots en Majuscule.
  const re = /(?:\bpour|\bsur|\bchez|\bde|\bdes|\bdu|\bles|\bla|\ble|\bl['’]|\bmagasins?|\bmarque|\benseigne|\brestaurants?|\bboutiques?|\bsociété|\bentreprise|\bclub|\bsalon)\s+((?:[A-ZÀ-Ý][\wÀ-ÿ'’&.-]*)(?:\s+(?:[A-ZÀ-Ý&][\wÀ-ÿ'’&.-]*|de|du|des|et|&)){0,3})/g;
  for (const m of t.matchAll(re)) {
    let name = m[1].replace(/\s+(de|du|des|et|&)$/i, '').trim();
    const words = name.split(' ');
    while (words.length && NOT_BRANDS.has(words[words.length - 1])) words.pop();
    name = words.join(' ');
    if (name.length >= 2 && !NOT_BRANDS.has(words[0])) return name.slice(0, 40);
  }
  return null;
}
