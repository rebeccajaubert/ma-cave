/**
 * Fonctions pures de « Ma Cave » : aucune dépendance au navigateur ni à Three.js,
 * ce qui permet de les tester avec `npm test` (node --test).
 */

/** Échappe le HTML : à utiliser pour tout texte saisi par l'utilisateur ou lu sur une étiquette. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Borne `v` entre `a` et `b`. */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Minuscules sans accents, pour comparer et rechercher (« Château » = « chateau »). */
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- Casiers et emplacements ----------

/** Les quatre casiers : mur gauche, face gauche de l'îlot, face droite de l'îlot, mur droit. */
export const RACK_ORDER = ['G', 'IG', 'ID', 'D'];
export const RACK_NAMES = { G: 'Mur gauche', IG: 'Îlot, côté gauche', ID: 'Îlot, côté droit', D: 'Mur droit' };

/** Identifiant d'un emplacement : casier, colonne, rangée (comptées à partir de 0). Ex. « G:12:4 ». */
export const slotId = (k, c, r) => `${k}:${c}:${r}`;
/** Décompose un identifiant. `u` est le suffixe d'une bouteille de case maçonnée (`K:c:r:u`), sinon null. */
export const parseId = (id) => { const [k, c, r, u] = id.split(':'); return { k, c: +c, r: +r, u: u ?? null }; };
export const isValidId = (id) => typeof id === 'string' && /^(G|IG|ID|D):\d+:\d+(:[a-z0-9]+)?$/.test(id);
/** Case (`K:c:r`) d'un identifiant d'emplacement ou de bouteille. */
export const caseIdOf = (id) => id.split(':').slice(0, 3).join(':');
/**
 * Identifiant stable d'une nouvelle bouteille de case maçonnée : `K:c:r:u`. Le suffixe ne change pas quand la
 * bouteille descend dans la pile (seul son champ `pile` change).
 */
export const newBottleId = (caseId, rand = Math.random) =>
  `${caseId}:${Date.now().toString(36)}${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, '0')}`;

// ---------- Types de rangement ----------

/**
 * Types de rangement possibles pour un casier. Chaque type fixe la taille d'un emplacement
 * (largeur `w` et hauteur `h` en mètres), si un emplacement ne contient qu'une bouteille (`unique`),
 * la quantité proposée par défaut et le nom d'un emplacement (`lieu`).
 * Les types reprennent la cave de Verdelot (cases maçonnées d'un côté, casiers métalliques de l'autre)
 * et des rangements courants. Par choix esthétique, toutes les bouteilles sont montrées culot vers l'allée
 * (bouchon caché), même dans les casiers métalliques où elles sont en réalité goulot vers l'allée. La disposition des bouteilles d'un emplacement est calculée par cellLayout() plus bas.
 */
export const STYLES = {
  cases: { nom: 'Cases maçonnées', aide: 'Grandes cases où les bouteilles sont empilées.', w: 0.6, h: 0.38, defaut: 12, lieu: 'case' },
  metal: { nom: 'Casier métallique', aide: 'Une bouteille par place, côte à côte.', w: 0.09, h: 0.11, defaut: 1, lieu: 'place', unique: true },
  alveoles: { nom: 'Alvéoles', aide: 'Une bouteille par trou (terre cuite, bois).', w: 0.2, h: 0.2, defaut: 1, lieu: 'emplacement' },
  caisses: { nom: 'Caisses', aide: 'Caisses en bois empilées, plusieurs bouteilles par caisse.', w: 0.5, h: 0.34, defaut: 6, lieu: 'caisse' },
};
export const DEFAULT_STYLE = 'alveoles';
const MAX_LENGTH = 8;                       // longueur maximale d'un casier (m)
const MAX_HEIGHT = { mur: 2.0, ilot: 2.4 }; // hauteur maximale d'un casier mural et de l'îlot central (m)

/** Nombre maximal de colonnes et de rangées d'un casier selon son type de rangement. */
export function rackLimits(key, style) {
  const st = STYLES[style] || STYLES[DEFAULT_STYLE];
  const maxH = key === 'IG' || key === 'ID' ? MAX_HEIGHT.ilot : MAX_HEIGHT.mur;
  return { cols: Math.floor(MAX_LENGTH / st.w + 1e-9), rows: Math.floor(maxH / st.h + 1e-9) };
}

// ---------- Dimensions de la cave ----------

// Cave de Verdelot : en descendant, couloir de gauche en cases maçonnées, couloir de droite en casiers métalliques.
/**
 * Révision du format de réglage. Un réglage enregistré avant la révision 2 (v0.3.4) qui a gardé l'ancien
 * casier métallique d'origine (36 × 12) passe à 15 rangées, la vraie hauteur à Verdelot.
 */
export const CONFIG_REV = 3;   // 3 (v0.4.0) : tailles de colonnes et de rangées réglables (colW / rowH) des cases maçonnées
export const DEFAULT_CONFIG = {
  nom: 'La Cave de Verdelot',
  rev: CONFIG_REV,
  entree: 'avant',   // côté de l'entrée : 'avant' (devant) ou 'fond'
  ilotX: 0,          // décalage de l'îlot vers le mur droit (m, négatif = vers le mur gauche)
  racks: {
    G: { style: 'cases', cols: 6, rows: 5 }, IG: { style: 'cases', cols: 6, rows: 5 },
    ID: { style: 'metal', cols: 36, rows: 15 }, D: { style: 'metal', cols: 36, rows: 15 },
  },
};

/**
 * Remet une configuration au format actuel ({ nom, racks: { G: { style, cols, rows }, … } }), dans les limites.
 * Accepte les anciens formats : v1 ({ racks } sans type), v3 ({ cols, rowsMur, rowsIlot }).
 */
/** Décalage maximal d'un casier le long de la cave, et de l'îlot vers un mur (garde 60 cm de passage), en mètres. */
export const RACK_Z_MAX = 4, ILOT_X_MAX = 1.1;
/** Décalage lu dans un réglage : un nombre, borné, arrondi au centimètre ; sinon 0. */
const offset = (v, max) => { const n = Number(v); return Number.isFinite(n) ? Math.round(clamp(n, -max, max) * 100) / 100 || 0 : 0; };

export function normalizeConfig(c) {
  const out = JSON.parse(JSON.stringify(DEFAULT_CONFIG));   // copie profonde (structuredClone n'existe pas avant iOS 15.4)
  if (!c || typeof c !== 'object') return out;
  if (c.nom && c.nom !== 'La Cave de Papa') out.nom = String(c.nom).slice(0, 40);
  // Disposition (v1.1) : côté de l'entrée et décalages ; absents d'un ancien réglage → la disposition d'avant.
  out.entree = c.entree === 'fond' ? 'fond' : 'avant';
  out.ilotX = offset(c.ilotX, ILOT_X_MAX);
  const src = {};
  if (c.racks && typeof c.racks === 'object') Object.assign(src, c.racks);
  else if (c.cols) for (const k of RACK_ORDER) src[k] = { cols: c.cols, rows: k === 'IG' || k === 'ID' ? c.rowsIlot : c.rowsMur };
  const beforeRev2 = !(Number(c.rev) >= 2);
  for (const k of RACK_ORDER) {
    // Casier absent : réglage par défaut. Casier d'un ancien format (sans type) : c'étaient des alvéoles.
    const r = src[k] || out.racks[k], style = STYLES[r.style] ? r.style : DEFAULT_STYLE, lim = rackLimits(k, style);
    let rows = parseInt(r.rows) || out.racks[k].rows;
    // Ancien casier métallique d'origine (36 × 12) : 15 rangées. Ajouter des rangées en haut ne déplace aucune fiche
    // (les rangées se comptent depuis le bas).
    if (beforeRev2 && style === 'metal' && parseInt(r.cols) === 36 && rows === 12) rows = 15;
    out.racks[k] = {
      style,
      cols: clamp(parseInt(r.cols) || out.racks[k].cols, 1, lim.cols),
      rows: clamp(rows, 1, lim.rows),
    };
    // Décalage le long de la cave (m), positif = vers le devant ; écrit seulement s'il existe (réglage inchangé sinon)
    const z = offset(r.z, RACK_Z_MAX); if (z) out.racks[k].z = z;
    // Cases maçonnées : largeur de chaque colonne et hauteur de chaque rangée (séparations réglées à la main).
    if (style === 'cases') {
      const st = STYLES.cases, fit = (arr, n, def) => Array.from({ length: n }, (_, i) => {
        const v = Number(Array.isArray(arr) ? arr[i] : NaN);
        return Number.isFinite(v) ? Math.round(clamp(v, CASE_MIN, CASE_MAX) * 100) / 100 : def;
      });
      if (Array.isArray(r.colW)) out.racks[k].colW = fit(r.colW, out.racks[k].cols, st.w);
      if (Array.isArray(r.rowH)) out.racks[k].rowH = fit(r.rowH, out.racks[k].rows, st.h);
    }
  }
  return out;
}

/**
 * Réglage de la version 0.2.0 et avant (alvéoles partout, 12 colonnes). Utilisé pour un appareil qui a déjà
 * des fiches mais n'avait jamais enregistré de réglage : ses fiches restent ainsi à leur place.
 */
export const LEGACY_CONFIG = {
  nom: DEFAULT_CONFIG.nom,
  rev: CONFIG_REV,
  entree: 'avant',
  ilotX: 0,
  racks: {
    G: { style: 'alveoles', cols: 12, rows: 5 }, IG: { style: 'alveoles', cols: 12, rows: 6 },
    ID: { style: 'alveoles', cols: 12, rows: 6 }, D: { style: 'alveoles', cols: 12, rows: 5 },
  },
};
/** Faut-il figer l'ancien réglage ? Oui si des fiches existent alors qu'aucun réglage n'a jamais été enregistré. */
export const needsLegacyConfig = (hasStoredConfig, recordCount) => !hasStoredConfig && recordCount > 0;

/** Nombre de vraies fiches (les bouteilles d'exemple ne comptent pas). */
export const realRecordCount = (list) => list.filter((b) => !b.demo && !b.vide).length;

/**
 * Appareil de test : il n'a que des bouteilles d'exemple, et pas de réglage enregistré ou l'ancien rangement
 * en alvéoles. On le remet alors au format de Verdelot, avec des exemples régénérés à ce format.
 * Dès qu'une vraie fiche existe, on ne touche à rien.
 * @param {object|null} storedConfig réglage enregistré sur l'appareil (null s'il n'y en a pas)
 */
export function shouldResetDemoToVerdelot(storedConfig, list) {
  if (!list.length || realRecordCount(list) > 0) return false;
  if (!storedConfig) return true;
  return JSON.stringify(normalizeConfig(storedConfig).racks) === JSON.stringify(LEGACY_CONFIG.racks);
}

/**
 * Disposition des bouteilles visibles dans un emplacement, selon le type de rangement :
 * `pts` = positions [x, y, z] (m) par rapport au centre de l'emplacement, dans l'ordre de remplissage ;
 * `s` = échelle des bouteilles pour qu'elles tiennent dans l'emplacement (1 = taille réelle).
 */
export function cellLayout(style) {
  const st = STYLES[style] || STYLES[DEFAULT_STYLE];
  if (style === 'metal') return { s: Math.min(st.w, st.h) / 0.165, pts: [[0, 0, 0]] };   // un seul culot, réduit pour tenir dans la place
  if (!STYLES[style] || style === 'alveoles') return { s: 1, pts: [[0, 0, 0], [0.034, 0.038, -0.02], [-0.034, 0.038, -0.04]] };   // jusqu'à 3, la première devant
  const rows = style === 'cases' ? [5, 4, 5] : [3, 3];   // cases : bouteilles empilées en quinconce, comme sur les photos
  const dx = st.w / Math.max(...rows), dy = (st.h * 0.88) / rows.length, pts = [];
  rows.forEach((n, r) => { for (let i = 0; i < n; i++) pts.push([(i - (n - 1) / 2) * dx, -st.h / 2 + st.h * 0.1 + (r + 0.5) * dy, 0]); });
  return { s: Math.min(1, Math.min(dx, dy) / 0.155), pts };
}

/**
 * Taille réelle d'un casier selon son type de rangement et son nombre de colonnes et de rangées.
 * Chaque casier a la sienne : l'îlot peut être plus court ou plus long que les murs, et les murs différents entre eux.
 * @returns {{ length: number, height: number }} en mètres
 */
export function rackSize(style, cols, rows) {
  const st = STYLES[style] || STYLES[DEFAULT_STYLE];
  return { length: (parseInt(cols) || 0) * st.w, height: (parseInt(rows) || 0) * st.h };
}
/** « 3,6 m » : mètres arrondis au décimètre, à la française. */
export const meters = (m) => `${(Math.round(m * 10) / 10).toLocaleString('fr-FR')} m`;

/** Réglage (type, colonnes, rangées) de chacun des quatre casiers. */
export const rackSizes = (c) => c.racks;

// ---------- Vider un casier ----------

/**
 * Fiches d'un casier, éventuellement limitées à une colonne et/ou une rangée (comptées depuis 0).
 * @returns {Array<object>}
 */
export function recordsIn(list, key, { col = null, row = null } = {}) {
  return list.filter((b) => {
    if (!isValidId(b.id)) return false;
    const p = parseId(b.id);
    return p.k === key && (col === null || p.c === col) && (row === null || p.r === row);
  });
}

// ---------- Fiches de bouteilles ----------

/** Nombre de bouteilles stockées à un emplacement (au moins 1, 99 au plus). */
export const qty = (b) => clamp(parseInt(b?.quantite) || 1, 1, 99);

/** Nombre total de bouteilles d'une liste de fiches (une fiche peut en regrouper plusieurs). */
export const totalBottles = (list) => list.reduce((s, b) => s + qty(b), 0);
/**
 * Phrase de résumé en tête du menu, ex. « 142 bouteilles · 18 places libres ».
 * En français, 0 et 1 sont au singulier (« 0 bouteille »).
 * @param {number} bottles nombre de bouteilles rangées
 * @param {number} free nombre d'emplacements vides
 * @returns {string}
 */
export function caveSummary(bottles, free) {
  const s = (n) => (n > 1 ? 's' : '');
  return `${bottles} bouteille${s(bottles)} · ${free} place${s(free)} libre${s(free)}`;
}

/**
 * Suggestions de saisie à partir des fiches déjà enregistrées : valeurs distinctes,
 * les plus fréquentes d'abord (puis ordre alphabétique).
 * @param {Array<object>} list fiches
 * @param {string} field nom du champ (nom, appellation, region, cepage)
 * @returns {string[]}
 */
export function suggestions(list, field) {
  const count = new Map();   // clé normalisée -> { texte, n }
  for (const b of list) {
    const text = String(b[field] ?? '').trim();
    if (!text) continue;
    const key = norm(text), cur = count.get(key);
    if (cur) cur.n++; else count.set(key, { text, n: 1 });
  }
  return [...count.values()].sort((a, b) => b.n - a.n || a.text.localeCompare(b.text, 'fr')).map((x) => x.text);
}

/**
 * Bouteilles à boire bientôt : fiches dont l'année « à boire jusqu'en » est au plus `year + 1`,
 * les plus urgentes d'abord.
 */
export function drinkSoon(list, year) {
  const y = (b) => parseInt(String(b.apogee ?? '').match(/\b(19|20)\d{2}\b/)?.[0]);
  return list.filter((b) => y(b) <= year + 1).sort((a, b) => y(a) - y(b) || norm(a.nom).localeCompare(norm(b.nom)));
}

/**
 * Retrouve la fiche portant ce nom (sans tenir compte des accents ni de la casse), pour pré-remplir
 * la fiche d'un vin déjà connu. À nom égal, on préfère le même millésime, puis la fiche la plus récente.
 */
export function findKnownWine(list, nom, millesime = '') {
  const key = norm(String(nom ?? '').trim()), year = String(millesime ?? '').trim();
  if (!key) return null;
  let best = null, bestSame = false;
  for (const b of list) {
    if (norm(b.nom) !== key) continue;
    const same = !!year && String(b.millesime ?? '').trim() === year;
    if (!best || (same && !bestSame) || (same === bestSame && (b.ajout || 0) >= (best.ajout || 0))) { best = b; bestSame = same; }
  }
  return best;
}

/**
 * Champs d'un vin connu que l'on peut reprendre pour une nouvelle bouteille.
 * Appellation, région, cépage et couleur sont propres au vin ; le prix et la date limite de garde
 * dépendent du millésime : on ne les reprend que si le millésime saisi est le même.
 * @returns {{appellation?:string, region?:string, cepage?:string, couleur?:string, apogee?:string, prix?:string}}
 */
export function inheritableFields(known, millesime = '') {
  const out = {};
  if (!known) return out;
  for (const k of ['appellation', 'region', 'cepage', 'couleur']) if (known[k]) out[k] = known[k];
  const year = String(millesime ?? '').trim();
  if (year && String(known.millesime ?? '').trim() === year) for (const k of ['apogee', 'prix']) if (known[k]) out[k] = known[k];
  return out;
}

// ---------- Versions ----------

/** Vrai si la version `a` (« 0.3.10 ») est plus récente que `b` (« 0.3.9 »). Une version illisible n'est jamais plus récente. */
export function isNewerVersion(a, b) {
  const p = (v) => (/^\d+\.\d+\.\d+$/.test(String(v ?? '')) ? String(v).split('.').map(Number) : null);
  const x = p(a), y = p(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// ---------- Pile d'une case maçonnée ----------
// Une case est une pile : ses bouteilles occupent les rangs 0…n−1 sans trou (0 = coin en bas à droite).
// On ajoute toujours en haut ; quand une bouteille est retirée, celles du dessus descendent d'un cran.
// Les fonctions ci-dessous ne modifient rien : elles renvoient des copies des fiches à réécrire.

const byPile = (a, b) => (a.pile ?? 0) - (b.pile ?? 0) || (a.ajout ?? 0) - (b.ajout ?? 0) || String(a.id).localeCompare(String(b.id));

/** Bouteilles d'une case (fiches à 4 parties), triées par rang dans la pile. */
export function pileOf(list, caseId) {
  return list.filter((b) => b && !b.vide && parseId(b.id).u && caseIdOf(b.id) === caseId).sort(byPile);
}

/**
 * Rangs à donner à `n` nouvelles bouteilles, en haut de la pile.
 * @throws {RangeError} si la case n'a pas assez de places ; `cause` = nombre de places libres
 */
export function pushToPile(list, caseId, n, capacity) {
  const count = pileOf(list, caseId).length;
  if (count + n > capacity) throw new RangeError('place', { cause: Math.max(0, capacity - count) });
  return Array.from({ length: n }, (_, i) => count + i);
}

/**
 * Retire une bouteille de sa pile : renvoie la fiche à supprimer et les fiches du dessus, descendues d'un cran.
 * À écrire dans UNE transaction, pour ne jamais laisser de trou ni deux bouteilles au même rang.
 * @returns {{ put: object[], remove: string[] }}
 */
export function removeFromPile(list, id) {
  const gone = list.find((b) => b.id === id); if (!gone) return { put: [], remove: [] };
  if (!parseId(id).u) return { put: [], remove: [id] };   // ancienne fiche (« à ranger ») : elle n'est pas dans la pile
  const pile = pileOf(list, caseIdOf(id)), at = pile.findIndex((b) => b.id === id);
  return { put: pile.slice(at + 1).map((b, i) => ({ ...b, pile: at + i })), remove: [id] };
}

/**
 * « Annuler » des retraits : remet les bouteilles retirées dans leur pile et fait remonter celles du dessus
 * (une bouteille ajoutée entre-temps reste dans la case). Les bouteilles sont remises dans l'ordre INVERSE des
 * retraits, chacune au rang qu'elle avait au moment de SON retrait : on rejoue ainsi les retraits à l'envers,
 * même si deux bouteilles ont été retirées au même rang (la bouteille du bas bue deux fois).
 * @param {object[]} removed fiches dans l'ordre des retraits, chacune avec son rang au moment du retrait
 * @returns {object[]} fiches à réécrire
 */
export function undoRemoval(list, removed) {
  const out = [], ids = new Set(removed.map((b) => b.id));
  for (const caseId of new Set(removed.map((b) => caseIdOf(b.id)))) {
    const pile = pileOf(list, caseId).filter((b) => !ids.has(b.id));
    for (const b of removed.filter((x) => caseIdOf(x.id) === caseId).reverse()) pile.splice(clamp(Number(b.pile) || 0, 0, pile.length), 0, b);
    pile.forEach((b, i) => { if (b.pile !== i || ids.has(b.id)) out.push({ ...b, pile: i }); });
  }
  return out;
}

/** Remet les rangs d'une case à 0…n−1 (ordre conservé, égalités départagées par la date d'ajout). */
export function normalizePile(list, caseId) {
  return pileOf(list, caseId).map((b, i) => (b.pile === i ? null : { ...b, pile: i })).filter(Boolean);
}

/**
 * Range en haut de la pile les bouteilles d'une ancienne fiche « à ranger », autant que la case le permet.
 * À écrire dans UNE transaction : les nouvelles fiches, et l'ancienne réduite (s'il en reste) ou supprimée.
 * @param {object[]} list toutes les fiches (pour connaître la pile actuelle de la case)
 * @param {object} lost ancienne fiche `K:c:r` avec une quantité
 * @param {number} capacity nombre de places de la case
 * @param {() => number} [rand] tirage aléatoire du suffixe des identifiants (injectable pour les tests)
 * @returns {{ put: object[], remove: string[] }} vide si la case est pleine
 */
export function placeLost(list, lost, capacity, rand = Math.random) {
  const pile = pileOf(list, lost.id), q = qty(lost), n = Math.min(q, Math.max(0, capacity - pile.length));
  if (!n) return { put: [], remove: [] };
  const { quantite, aRanger, vide, demo, pile: _p, ...wine } = lost, base = newBottleId(lost.id, rand), now = Date.now();
  const put = Array.from({ length: n }, (_, i) => ({ ...wine, id: base + i.toString(36), pile: pile.length + i, ajout: now }));
  return n < q ? { put: [...put, { ...lost, quantite: q - n }], remove: [] } : { put, remove: [lost.id] };
}

/** Même fiche, au rang près (le rang change quand une bouteille du dessous est retirée, pas la bouteille). */
function sameBottle(a, b) {
  if (!a || !b) return false;
  const norm = ({ pile, ...rest }) => JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
  return norm(a) === norm(b);
}

/**
 * « Annuler » après `placeLost` : retire les bouteilles rangées, retasse la pile (une bouteille posée dessus
 * entre-temps redescend) et remet l'ancienne fiche « à ranger » telle qu'elle était. Seulement si rien n'a changé
 * depuis le rangement : une bouteille rangée modifiée, bue ou déplacée, ou un reste « à ranger » modifié ou retiré,
 * serait écrasé ou compté deux fois ; on renvoie alors null et rien n'est annulé. À écrire dans UNE transaction.
 * @param {object[]} list toutes les fiches actuelles
 * @param {object} lost l'ancienne fiche, telle qu'avant le rangement
 * @param {{put: object[], remove: string[]}} written ce que `placeLost` a écrit
 * @returns {{ put: object[], remove: string[] } | null}
 */
export function undoPlaceLost(list, lost, written) {
  const byId = new Map(list.map((b) => [b.id, b]));
  const added = written.put.filter((b) => b.id !== lost.id), rest = written.put.find((b) => b.id === lost.id);
  if (!added.every((b) => sameBottle(byId.get(b.id), b))) return null;
  if (rest ? !sameBottle(byId.get(lost.id), rest) : byId.has(lost.id)) return null;
  const gone = new Set(added.map((b) => b.id)), left = list.filter((b) => !gone.has(b.id));
  return { put: [lost, ...normalizePile(left, lost.id)], remove: [...gone] };
}

/**
 * Déplace TOUT le contenu (la pile) d'une case maçonnée vers une autre, chaque pile gardant son ordre.
 * - `'stack'` : par-dessus ce que contient la case d'arrivée (ou dans une case vide) ;
 * - `'swap'` : échange des deux contenus.
 * Les bouteilles gardent leur suffixe (`K:c:r:u` → `K2:c2:r2:u`), un nouveau est tiré s'il est déjà pris. Une ancienne
 * fiche « à ranger » (`K:c:r`, hors de la pile) reste dans sa case. À écrire dans UNE transaction : les nouvelles
 * fiches et la suppression des anciennes ensemble, pour qu'aucune bouteille ne soit jamais perdue ni en double.
 * @param {object[]} list toutes les fiches
 * @param {string} from case de départ
 * @param {string} to case d'arrivée
 * @param {'stack'|'swap'} how
 * @param {{capFrom: number, capTo: number}} caps nombre de places de chaque case
 * @param {() => number} [rand]
 * @returns {{put: object[], remove: string[], before: object[], after: object[]}} `before` / `after` : contenu des
 *   deux cases avant et après, pour « Annuler » (`undoMoveCase`)
 * @throws {RangeError} si ça ne tient pas ; `cause` = `{ need, free }` (bouteilles à loger, places libres)
 */
export function moveCase(list, from, to, how, { capFrom, capTo }, rand = Math.random) {
  const src = pileOf(list, from), dst = pileOf(list, to);
  const taken = new Set(list.map((b) => b.id));
  // Nouvel identifiant dans la case `caseId` : le même suffixe si possible, sinon un nouveau jamais utilisé
  const idIn = (caseId, b) => {
    let id = `${caseId}:${parseId(b.id).u}`;
    for (let i = 0; taken.has(id); i++) id = newBottleId(caseId, rand) + i.toString(36);
    taken.add(id); return id;
  };
  const moveTo = (pile, caseId, start) => pile.map((b, i) => ({ ...b, id: idIn(caseId, b), pile: start + i }));
  let put;
  if (how === 'swap') {
    if (src.length > capTo) throw new RangeError('la case d\'arrivée est trop petite', { cause: { need: src.length, free: capTo } });
    if (dst.length > capFrom) throw new RangeError('la case de départ est trop petite', { cause: { need: dst.length, free: capFrom } });
    put = [...moveTo(src, to, 0), ...moveTo(dst, from, 0)];
  } else {
    const free = Math.max(0, capTo - dst.length);
    if (src.length > free) throw new RangeError('pas assez de place', { cause: { need: src.length, free } });
    // Par-dessus la bouteille la plus haute (et non au rang « nombre de bouteilles ») : une ancienne pile à trou
    // (rangs 0, 1, 3) donnerait sinon deux bouteilles au même rang
    put = moveTo(src, to, dst.length ? Math.max(...dst.map((b) => Number(b.pile) || 0)) + 1 : 0);
  }
  const remove = (how === 'swap' ? [...src, ...dst] : src).map((b) => b.id);
  const after = [...(how === 'swap' ? [] : dst), ...put];
  return { put, remove, before: [...src, ...dst], after };
}

/**
 * « Annuler » après `moveCase` : remet les deux cases exactement comme avant. Seulement si leur contenu est encore
 * celui laissé par le déplacement (aucune bouteille ajoutée, bue, déplacée ou modifiée depuis) ; sinon null et rien
 * n'est annulé. À écrire dans UNE transaction.
 * @param {object[]} list toutes les fiches actuelles
 * @param {{before: object[], after: object[], put: object[]}} op ce que `moveCase` a renvoyé
 * @returns {{put: object[], remove: string[]} | null}
 */
export function undoMoveCase(list, op) {
  const cases = new Set([...op.before, ...op.after].map((b) => caseIdOf(b.id)));
  const now = list.filter((b) => b && !b.vide && parseId(b.id).u && cases.has(caseIdOf(b.id)));
  if (now.length !== op.after.length) return null;
  const byId = new Map(now.map((b) => [b.id, b]));
  if (!op.after.every((b) => { const x = byId.get(b.id); return x && x.pile === b.pile && sameBottle(x, b); })) return null;
  return { put: op.before, remove: op.put.map((b) => b.id) };
}

/**
 * Convertit les anciennes fiches de cases maçonnées (`K:c:r` avec une quantité) en une fiche par bouteille,
 * empilées dans leur case. Les bouteilles qui ne tiennent pas restent dans l'ancienne fiche, marquée `aRanger`.
 * @param {(k: string) => boolean} isCasesRack ce casier est-il en cases maçonnées ?
 * @param {(caseId: string) => number} capacityOf nombre de places de la case
 * @returns {{ put: object[], remove: string[] }}
 */
export function migrateCaseRecords(list, isCasesRack, capacityOf, rand = Math.random) {
  const put = [], remove = [], work = [...list];
  for (const old of list) {
    if (!old || old.vide || parseId(old.id).u || !isCasesRack(parseId(old.id).k)) continue;
    const caseId = old.id, cap = capacityOf(caseId);
    if (!cap) continue;   // la case n'existe plus (dimensions réduites) : la fiche reste telle quelle, conservée
    const q = qty(old), free = Math.max(0, cap - pileOf(work, caseId).length), n = Math.min(q, free);
    if (!n && old.aRanger) continue;   // toujours pas de place : rien à réécrire
    const { quantite, aRanger, ...wine } = old;
    for (let i = 0; i < n; i++) {
      const b = { ...wine, id: newBottleId(caseId, rand) + i.toString(36), pile: pileOf(work, caseId).length };
      put.push(b); work.push(b);
    }
    if (n === q) remove.push(old.id); else put.push({ ...old, quantite: q - n, aRanger: true });
  }
  return { put, remove };
}

// ---------- Géométrie des cases maçonnées ----------

/** Diamètre d'une bouteille couchée (culot), en mètres. */
export const BOTTLE_D = 0.08;
/** Taille minimale et maximale d'une case maçonnée, en mètres. */
export const CASE_MIN = 0.10;
export const CASE_MAX = 1.5;
const EDGE = 0.01, EPS = 1e-9;

/**
 * Places d'une case de `w` × `h` mètres : bouteilles empilées en quinconce, une seule épaisseur.
 * Rangée du bas : n = ⌊(w − 2 cm) / 8 cm⌋ places, puis n − 1, n, n − 1… décalées d'un demi-diamètre.
 * @returns {Array<[number, number]>} centres relatifs au centre de la case, DANS L'ORDRE DE LA PILE :
 *   rangée du bas de droite à gauche, puis la rangée au-dessus… (x positif = à droite vu depuis l'allée)
 */
export function casePlaces(w, h) {
  const D = BOTTLE_D, n = Math.floor((w - 2 * EDGE) / D + EPS), pitch = D * Math.sin(Math.PI / 3), out = [];
  if (n < 1) return out;
  for (let i = 0; ; i++) {
    const y = -h / 2 + EDGE + D / 2 + i * pitch, count = i % 2 ? n - 1 : n;
    if (y + D / 2 > h / 2 - EDGE + EPS || count < 1) break;
    const x0 = w / 2 - EDGE - D / 2 - (i % 2 ? D / 2 : 0);   // la plus à droite de la rangée
    for (let j = 0; j < count; j++) out.push([x0 - j * D, y]);
  }
  return out;
}

/**
 * Grille d'un casier : taille de chaque colonne (depuis l'entrée) et rangée (depuis le bas), bords cumulés.
 * Les cases maçonnées peuvent avoir des tailles réglées (colW / rowH) ; les autres types sont réguliers.
 * @returns {{ colW: number[], rowH: number[], colX: number[], rowY: number[], W: number, H: number }}
 */
export function rackGrid(rackCfg) {
  const st = STYLES[rackCfg.style] || STYLES[DEFAULT_STYLE];
  const colW = Array.from({ length: rackCfg.cols }, (_, i) => rackCfg.colW?.[i] ?? st.w);
  const rowH = Array.from({ length: rackCfg.rows }, (_, i) => rackCfg.rowH?.[i] ?? st.h);
  const cum = (a) => a.reduce((acc, v, i) => (acc.push(i ? acc[i - 1] + a[i - 1] : 0), acc), []);
  const colX = cum(colW), rowY = cum(rowH);
  const n = colW.length - 1, m = rowH.length - 1;   // (pas de .at(-1) : absent avant iOS 15.4)
  return { colW, rowH, colX, rowY, W: colX[n] + colW[n], H: rowY[m] + rowH[m] };
}

/**
 * Déplace la séparation entre `sizes[i]` et `sizes[i + 1]` de `delta` mètres (au centimètre), sans changer
 * la somme. La séparation s'arrête à la dernière position où les deux tailles restent entre CASE_MIN et CASE_MAX et acceptées
 * par `accept(index, taille)` (par exemple : la case garde assez de places pour ses bouteilles).
 * @returns {number[]} nouvelles tailles (copie)
 */
export function moveSeparator(sizes, i, delta, accept) {
  const out = [...sizes], pair = sizes[i] + sizes[i + 1], cm = (v) => Math.round(v * 100) / 100;
  const steps = Math.round(Math.abs(delta) * 100), dir = Math.sign(delta);
  for (let s = 1; s <= steps; s++) {
    const a = cm(sizes[i] + dir * s / 100), b = cm(pair - a);
    if (a < CASE_MIN - EPS || b < CASE_MIN - EPS || a > CASE_MAX + EPS || b > CASE_MAX + EPS || !accept(i, a) || !accept(i + 1, b)) break;
    out[i] = a; out[i + 1] = b;
  }
  return out;
}

// ---------- Protection des données : copie avant mise à jour, rappel de sauvegarde ----------

/** Une journée en millisecondes. */
export const DAY_MS = 24 * 3600 * 1000;

/**
 * Faut-il copier les fiches avant de lancer une nouvelle version ? Oui au premier lancement d'une version
 * différente de la dernière lancée (elle peut transformer les fiches au démarrage), s'il y a de vraies fiches.
 * @param {string|null} lastVersion dernière version lancée sur l'appareil (null : jamais notée)
 * @param {string} currentVersion version qui démarre
 * @param {number} realCount nombre de fiches qui ne sont pas des exemples
 * @returns {boolean}
 */
export function needsSnapshot(lastVersion, currentVersion, realCount) {
  return realCount > 0 && lastVersion !== currentVersion;
}

/**
 * Copies à supprimer pour n'en garder que les `keep` plus récentes (numéros croissants : la plus récente a le
 * plus grand). On en garde plusieurs : si une version abîmait les fiches, la copie prise au lancement de la
 * version suivante serait déjà abîmée, la précédente non.
 * @param {number[]} ids numéros des copies
 * @param {number} keep
 * @returns {number[]} numéros des copies les plus anciennes en trop
 */
export function copiesToDrop(ids, keep) {
  return [...ids].sort((a, b) => b - a).slice(Math.max(0, keep));
}

/**
 * Faut-il rappeler de faire une sauvegarde ? Si de vraies fiches n'ont jamais été sauvegardées, ou pas
 * depuis 30 jours, sans le rappeler plus d'une fois par semaine.
 * @param {{now: number, lastBackup: *, lastReminder: *, realCount: number}} s dates en millisecondes (ou null)
 * @returns {boolean}
 */
export function backupReminderDue({ now, lastBackup, lastReminder, realCount }) {
  if (!(realCount > 0)) return false;
  const since = (t) => (Number.isFinite(Number(t)) && t !== null && t !== '' ? now - Number(t) : Infinity);
  return since(lastBackup) >= 30 * DAY_MS && since(lastReminder) >= 7 * DAY_MS;
}

/**
 * Dernière version lancée sur l'appareil : celle notée dans localStorage, sinon (stockage bloqué ou effacé)
 * la version de la plus récente copie prise pour une nouvelle version. Sans ce repli, un localStorage bloqué
 * ferait une copie à chaque lancement, et les copies d'avant la mise à jour seraient vite chassées.
 * @param {string|null} stored valeur notée (null si absente ou illisible)
 * @param {{id: number, raison?: string, vers?: string}[]} summaries résumés des copies
 * @returns {string|null}
 */
export function lastLaunchedVersion(stored, summaries) {
  if (stored) return stored;
  const last = [...summaries].filter((c) => c.raison === 'version' && c.vers).sort((a, b) => b.id - a.id)[0];
  return last ? last.vers : null;
}

/**
 * Mode développement : serveur local, ou `?debug` dans l'adresse. Les bouteilles d'exemple n'existent qu'en
 * mode développement : sur le téléphone d'un utilisateur, elles ne sont jamais ajoutées et celles d'avant
 * sont retirées.
 * @param {string} hostname `location.hostname`
 * @param {string} search `location.search`
 * @returns {boolean}
 */
export function isDevMode(hostname, search) {
  const h = String(hostname).toLowerCase();
  if (['localhost', '127.0.0.1', '[::1]', '::1'].includes(h) || h.endsWith('.localhost')) return true;
  return new URLSearchParams(search).has('debug');
}

/**
 * Fusion de ce qui a été dit dans la fiche. Ce que la voix donne remplace la valeur du champ (le dire est une intention
 * claire, et rien n'est enregistré sans « Enregistrer »), sauf un champ tapé à la main dans ce formulaire, qui n'est
 * jamais touché. Un champ rempli par la voix au tour précédent et absent de la nouvelle réponse est vidé : le texte
 * complet renvoyé fait foi. La couleur n'est jamais vidée (une puce reste toujours choisie).
 * @param {object} out réponse validée (`parseVoiceResponse`)
 * @param {{hand: string[], auto: string[], fields: string[]}} s champs tapés à la main, remplis par la voix, présents
 * @returns {{set: Record<string, string>, auto: string[]}} valeurs à écrire ('' pour vider) et champs remplis par la voix
 */
export function mergeVoice(out, { hand, auto, fields }) {
  const set = {}, filled = [];
  for (const f of fields) {
    if (hand.includes(f)) continue;
    const v = f === 'quantite' ? (out.quantite == null ? '' : String(out.quantite)) : String(out[f] ?? '');
    if (v !== '') { set[f] = v; filled.push(f); } else if (auto.includes(f) && f !== 'couleur') set[f] = '';
  }
  return { set, auto: filled };
}

/**
 * Index du dernier bord inférieur ou égal à `v` (0 si `v` est avant le premier) : la colonne ou la rangée touchée,
 * avec des tailles éventuellement inégales. Sans `findLastIndex`, absent avant iOS 15.4.
 * @param {number[]} edges bords croissants (le premier vaut 0)
 * @param {number} v position du doigt, dans la même unité
 * @returns {number}
 */
export function lastAtMost(edges, v) {
  let i = 0;
  while (i + 1 < edges.length && edges[i + 1] <= v) i++;
  return i;
}

/**
 * Numéro de colonne affiché : 1 = la plus proche de l'entrée. Les colonnes ne bougent pas quand l'entrée change de
 * côté (les fiches gardent leur index `c`) : seul le numéro montré à l'utilisateur suit l'entrée.
 * @param {number} c index de la colonne (0 = côté devant de la cave)
 * @param {number} cols nombre de colonnes du casier
 * @param {'avant'|'fond'} entree côté de l'entrée
 */
export const colNumber = (c, cols, entree) => (entree === 'fond' ? cols - c : c + 1);
/** Inverse de `colNumber` : index de la colonne qui porte le numéro `n` depuis l'entrée. */
export const colIndex = (n, cols, entree) => (entree === 'fond' ? cols - n : n - 1);

/**
 * Longueur de la cave qui contient tous les casiers, décalés ou non : de part et d'autre du centre, la plus grande
 * des demi-longueurs nécessaires (60 cm au-delà d'un casier mural ; 1,40 m au-delà de l'îlot, pour qu'on puisse en
 * faire le tour). Sans décalage, c'est la longueur d'avant les casiers déplaçables.
 * @param {{W: number, z: number, island: boolean}[]} racks longueur et décalage de chaque casier
 * @returns {number} longueur en mètres
 */
export function caveLength(racks) {
  let half = 0;
  for (const r of racks) half = Math.max(half, Math.abs(r.z) + (r.island ? (r.W + 0.2) / 2 + 1.4 : r.W / 2 + 0.6));
  return 2 * half;
}

const MIRROR = { G: 'D', D: 'G', IG: 'ID', ID: 'IG' };
/**
 * Casier qui porte le nom « vu depuis l'entrée ». Entrée au fond : on entre par l'autre bout, la gauche et la droite
 * s'échangent ; le casier de clé `G` est alors à droite de qui entre. Les clés des fiches ne changent jamais.
 * @param {'G'|'IG'|'ID'|'D'} k clé du casier
 * @param {'avant'|'fond'} entree
 */
export const mirrorRack = (k, entree) => (entree === 'fond' ? MIRROR[k] || k : k);
/** Nom affiché d'un casier, vu depuis l'entrée (« Mur gauche » = à gauche de qui entre). */
export const rackLabel = (k, entree) => RACK_NAMES[mirrorRack(k, entree)] || k;
/** Clés des casiers de gauche à droite pour qui entre (ordre de la barre du bas). */
export const rackOrderFromEntrance = (entree) => ['G', 'IG', 'ID', 'D'].map((k) => mirrorRack(k, entree));
