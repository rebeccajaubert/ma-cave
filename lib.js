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
export const parseId = (id) => { const [k, c, r] = id.split(':'); return { k, c: +c, r: +r }; };
export const isValidId = (id) => typeof id === 'string' && /^(G|IG|ID|D):\d+:\d+$/.test(id);

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
export const DEFAULT_CONFIG = {
  nom: 'La Cave de Verdelot',
  racks: {
    G: { style: 'cases', cols: 6, rows: 5 }, IG: { style: 'cases', cols: 6, rows: 5 },
    ID: { style: 'metal', cols: 36, rows: 12 }, D: { style: 'metal', cols: 36, rows: 12 },
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
  for (const k of RACK_ORDER) {
    // Casier absent : réglage par défaut. Casier d'un ancien format (sans type) : c'étaient des alvéoles.
    const r = src[k] || out.racks[k], style = STYLES[r.style] ? r.style : DEFAULT_STYLE, lim = rackLimits(k, style);
    out.racks[k] = {
      style,
      cols: clamp(parseInt(r.cols) || out.racks[k].cols, 1, lim.cols),
      rows: clamp(parseInt(r.rows) || out.racks[k].rows, 1, lim.rows),
    };
  }
  return out;
}

/**
 * Réglage de la version 0.2.0 et avant (alvéoles partout, 12 colonnes). Utilisé pour un appareil qui a déjà
 * des fiches mais n'avait jamais enregistré de réglage : ses fiches restent ainsi à leur place.
 */
export const LEGACY_CONFIG = {
  nom: DEFAULT_CONFIG.nom,
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
