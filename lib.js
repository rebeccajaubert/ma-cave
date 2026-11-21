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
  racks: {
    G: { style: 'cases', cols: 6, rows: 5 }, IG: { style: 'cases', cols: 6, rows: 5 },
    ID: { style: 'metal', cols: 36, rows: 15 }, D: { style: 'metal', cols: 36, rows: 15 },
  },
};

/**
 * Remet une configuration au format actuel ({ nom, racks: { G: { style, cols, rows }, … } }), dans les limites.
 * Accepte les anciens formats : v1 ({ racks } sans type), v3 ({ cols, rowsMur, rowsIlot }).
 */
export function normalizeConfig(c) {
  const out = structuredClone(DEFAULT_CONFIG);
  if (!c || typeof c !== 'object') return out;
  if (c.nom && c.nom !== 'La Cave de Papa') out.nom = String(c.nom).slice(0, 40);
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
 * @param {object} lost ancienne fiche `K:c:r` avec une quantité
 * @param {number} capacity nombre de places de la case
 * @returns {{ put: object[], remove: string[] }} vide si la case est pleine
 */
export function placeLost(list, lost, capacity, rand = Math.random) {
  const pile = pileOf(list, lost.id), q = qty(lost), n = Math.min(q, Math.max(0, capacity - pile.length));
  if (!n) return { put: [], remove: [] };
  const { quantite, aRanger, ...wine } = lost, base = newBottleId(lost.id, rand), now = Date.now();
  const put = Array.from({ length: n }, (_, i) => ({ ...wine, id: base + i.toString(36), pile: pile.length + i, ajout: now }));
  return n < q ? { put: [...put, { ...lost, quantite: q - n }], remove: [] } : { put, remove: [lost.id] };
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
  return { colW, rowH, colX, rowY, W: colX.at(-1) + colW.at(-1), H: rowY.at(-1) + rowH.at(-1) };
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
