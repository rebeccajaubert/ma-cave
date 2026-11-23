import * as THREE from './vendor/three.module.min.js';
import { esc, clamp, norm, RACK_ORDER, RACK_NAMES, slotId, parseId, isValidId, DEFAULT_CONFIG, CONFIG_REV, STYLES, rackGrid, casePlaces, pileOf, BOTTLE_D, moveSeparator, caseIdOf, newBottleId, pushToPile, removeFromPile, undoRemoval, normalizePile, migrateCaseRecords, placeLost, DEFAULT_STYLE, rackLimits, normalizeConfig, rackSizes, rackSize, meters, recordsIn, isNewerVersion, LEGACY_CONFIG, needsLegacyConfig, realRecordCount, shouldResetDemoToVerdelot, cellLayout, drinkSoon, qty, totalBottles, suggestions, findKnownWine, inheritableFields, needsSnapshot, copiesToDrop, backupReminderDue, lastLaunchedVersion, isDevMode, mergeVoice, undoPlaceLost, lastAtMost, DAY_MS } from './lib.js';
import { openStore, openCopies } from './db.js';
import { getApiKey, setApiKey, clearApiKey, cleanApiKey, scanLabel, readVoice, testApiKey, scanErrorMessage } from './scan.js';

/* ============================================================
   Ma Cave — maquette 3D de la cave, façon plan d'architecte
   Une voûte en demi-cylindre, un îlot central, des casiers
   sur les deux murs et sur les deux faces de l'îlot.
   Un emplacement est soit « enregistré » (une fiche existe : la bouteille
   apparaît dans le casier, avec son étiquette), soit « non enregistré »
   (aucune fiche : rien n'apparaît).
   Organisation : lib.js (fonctions pures testées), db.js (stockage local),
   scan.js (lecture automatique : photo d'étiquette et voix), app.js (scène 3D et interface).
   ============================================================ */

const $ = (id) => document.getElementById(id);

// Juste après une mise à jour, le navigateur peut associer une ancienne page (sans les nouveaux éléments)
// au nouveau code : on recharge une fois pour tout reprendre à jour, au lieu d'afficher un écran vide.
if (['scene', 'sheet', 'nav', 'dialog', 'undoBtn', 'updateBtn'].some((id) => !$(id))) {
  // Sans sessionStorage, on ne peut pas se souvenir de la tentative : on ne recharge pas (pas de boucle possible).
  let retried = true; try { retried = !!sessionStorage.getItem('cave-reload'); sessionStorage.setItem('cave-reload', '1'); } catch { retried = true; }
  if (!retried) location.reload();
  throw new Error('Page incomplète (ancienne version en cache)');
}
try { sessionStorage.removeItem('cave-reload'); } catch { /* sans stockage */ }
const APP_VERSION = self.APP_VERSION || '?';   // défini par version.js
const APP_FILES = self.APP_FILES || [];         // idem : fichiers de l'app

// ---------- Configuration (dimensions de la cave, gardées sur l'appareil) ----------
const CONFIG_KEY = 'cave-config-v4';   // les anciennes clés (v3, v2) sont relues et converties par normalizeConfig

function loadConfig() {
  try { return normalizeConfig(JSON.parse(localStorage.getItem(CONFIG_KEY) || localStorage.getItem('cave-config-v3') || localStorage.getItem('cave-config-v2') || 'null')); }
  catch { return { ...DEFAULT_CONFIG }; }
}
const config = loadConfig();

// ---------- Couleurs de vin ----------
const TYPES = {
  rouge: { nom: 'Rouge', verre: 0x14220e, capsule: 0x6e1020, css: '#8e1b2e' },
  blanc: { nom: 'Blanc', verre: 0x7f8f30, capsule: 0xc9a94a, css: '#c9b23a' },
  rose: { nom: 'Rosé', verre: 0xe0998f, capsule: 0xe9c2bc, css: '#e79a94' },
  bulles: { nom: 'Champagne', verre: 0x2a4a1e, capsule: 0xc8a23a, css: '#4f7a3a' },
  liquoreux: { nom: 'Liquoreux', verre: 0xb37c1c, capsule: 0xb8862b, css: '#c98a22' },
  autre: { nom: 'Autre', verre: 0x3a2716, capsule: 0x2a2a2a, css: '#5a4030' },
};
const typeOf = (b) => TYPES[b?.couleur] || TYPES.rouge;
const UNKNOWN_GLASS = 0x14220e;

// ---------- Fiches : en mémoire, et enregistrées sur l'appareil à chaque modification ----------
let store = null;                // accès à la base locale (null si le stockage est indisponible)
// Mode développement (serveur local ou ?debug) : seul mode où existent les bouteilles d'exemple
const DEV = isDevMode(location.hostname, location.search);
const records = new Map();       // identifiant d'emplacement -> fiche
const bottleAt = (id) => { const b = records.get(id); return b && !b.vide ? b : null; };
const allBottles = () => [...records.values()].filter((b) => !b.vide);

/**
 * Exécute une écriture sur la base locale. Renvoie true si on peut poursuivre (écriture réussie,
 * ou stockage indisponible : la modification vit alors le temps de la séance, l'utilisateur est prévenu).
 * Renvoie false si l'écriture a échoué : l'appelant ne doit alors RIEN changer à l'écran ni en mémoire.
 */
async function persist(op) {
  if (!store) { toast('Stockage indisponible : cette modification ne sera pas conservée à la fermeture'); return true; }
  try { await op(store); return true; }
  catch (e) { console.error(e); toast('Enregistrement impossible (espace plein ou stockage bloqué)'); return false; }
}
/** Message de succès ; sans stockage, dit honnêtement que la modification ne sera pas conservée. */
const saved = (msg) => toast(store ? msg : 'Gardé jusqu\'à la fermeture de l\'app seulement (stockage indisponible)');
/** Enregistre une fiche : d'abord sur l'appareil, puis en mémoire (jamais l'inverse). */
async function saveRecord(b) { const ok = await persist((s) => s.put(b)); if (ok) records.set(b.id, b); return ok; }
/** Supprime une fiche : d'abord sur l'appareil, puis en mémoire. */
async function deleteRecord(id) { const ok = await persist((s) => s.remove(id)); if (ok) records.delete(id); return ok; }
/** Écrit et supprime plusieurs fiches dans UNE transaction, puis met la mémoire à jour (tout ou rien). */
async function persistBatch(puts, removes) {
  const ok = await persist((s) => s.batch(puts, removes));
  if (ok) { for (const id of removes) records.delete(id); for (const b of puts) records.set(b.id, b); }
  return ok;
}

// ---------- Cases maçonnées : chaque case est une pile de bouteilles, une fiche par bouteille ----------
// On ajoute toujours en haut de la pile ; une bouteille retirée fait descendre celles du dessus (voir lib.js).
const isCasesRack = (k) => rk[k]?.style === 'cases';
/** Nombre de places d'une case, selon sa taille actuelle (0 si la case n'existe plus). */
function capacityOf(caseId) { const { k, c, r } = parseId(caseId); return inRack(k, c, r) && racks[k].isCases ? racks[k].places[c][r].length : 0; }
/** Champs qui décrivent le vin (copiés d'une bouteille à l'autre). */
const WINE_FIELDS = ['nom', 'couleur', 'millesime', 'apogee', 'appellation', 'region', 'cepage', 'prix', 'note', 'commentaire', 'photo'];
const wineOf = (b) => Object.fromEntries(WINE_FIELDS.filter((f) => b[f] !== undefined).map((f) => [f, b[f]]));
/**
 * Ajoute `n` bouteilles du vin `wine` en haut de la pile d'une case. Rien n'est écrit s'il manque de la place.
 * @returns {Promise<object[]|null>} les fiches créées, ou null
 */
async function addToCase(caseId, wine, n, extra = {}) {
  let ranks;
  try { ranks = pushToPile(allBottles(), caseId, n, capacityOf(caseId)); } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    toast(e.cause ? `Il ne reste que ${e.cause} place${e.cause > 1 ? 's' : ''} dans cette case` : 'Cette case est pleine');
    return null;
  }
  const now = Date.now(), base = newBottleId(caseId);
  const list = ranks.map((pile, i) => ({ ...wineOf(wine), ...extra, id: base + i.toString(36), pile, ajout: now }));
  return await persistBatch(list, []) ? list : null;
}
/**
 * Retire des bouteilles de case : leurs fiches sont supprimées et celles du dessus descendent, le tout dans une
 * seule transaction. Propose « Annuler » (sauf `undo: false`, pour l'ancienne place d'un déplacement).
 */
async function removeBottles(ids, label, { undo = true } = {}) {
  let work = allBottles(); const puts = new Map(), removed = [];
  for (const id of ids) {
    const now = work.find((x) => x.id === id); if (!now) continue;
    removed.push(now);   // avec son rang AU MOMENT de ce retrait : « Annuler » rejoue les retraits à l'envers
    const { put, remove } = removeFromPile(work, id);
    for (const p of put) puts.set(p.id, p);
    for (const r of remove) puts.delete(r);
    work = work.filter((x) => !remove.includes(x.id)).map((x) => puts.get(x.id) || x);
  }
  if (!removed.length) return true;
  if (!await persistBatch([...puts.values()], removed.map((b) => b.id))) return false;
  refresh(); if (undo) offerUndo(label, removed);
  return true;
}

/** Type de rangement d'un casier (alvéoles, cases maçonnées…). */
const styleOf = (k) => STYLES[rk[k]?.style] || STYLES[DEFAULT_STYLE];
function locText(id) {
  const { k, c, r, u } = parseId(id), b = u && records.get(id);
  // Bouteille de case maçonnée : on dit aussi où elle est dans la pile (comptée depuis le coin en bas à droite)
  const inPile = b ? ` · <b>${(b.pile ?? 0) + 1}<sup>e</sup></b> bouteille en partant du coin en bas à droite` : '';
  return `<b>${RACK_NAMES[k] || k}</b> · ${styleOf(k).lieu} en colonne <b>${c + 1}</b> depuis l'entrée · rangée <b>${r + 1}</b> depuis le bas${inPile}`;
}
function locShort(id) {
  const { k, c, r } = parseId(id);
  return `${RACK_NAMES[k] || k} · col. ${c + 1} · rang ${r + 1}`;
}

// ---------- Géométrie de la cave (mètres, schématique) ----------
const BASE = 0.12;        // socle sous les casiers
const R = 2.6;            // rayon de la voûte (demi-largeur de la cave)
const RACK_D = 0.4;       // profondeur des casiers muraux
const ISLAND_W = 1.0;     // largeur de l'îlot central : deux meubles de RACK_D dos à dos, avec un petit passage entre eux
const RACK_FRONT_X = R - RACK_D;

const rk = rackSizes(config);
/** Pour chaque casier : taille d'un emplacement (cw × ch) et du casier entier (W × H), selon son type de rangement. */
// cw × ch : taille nominale d'un emplacement (sert au zoom) ; W × H : taille réelle, les cases maçonnées pouvant
// avoir des colonnes et des rangées de tailles différentes (séparations réglées à la main).
const dims = Object.fromEntries(RACK_ORDER.map((k) => {
  const st = STYLES[rk[k].style], grid = rackGrid(rk[k]);
  return [k, { cw: st.w, ch: st.h, W: grid.W, H: grid.H, grid }];
}));
const islandLen = Math.max(dims.IG.W, dims.ID.W) + 0.2;
const outerLen = Math.max(dims.G.W, dims.D.W);
const L = Math.max(outerLen + 1.2, islandLen + 2.8);
// Petit mur droit sous la voûte : rehaussé si les casiers muraux sont hauts, pour qu'ils restent sous la voûte.
const WALL_H = Math.max(0.3, BASE + Math.max(dims.G.H, dims.D.H) + 0.1 - Math.sqrt(R * R - RACK_FRONT_X * RACK_FRONT_X));

// ---------- Palette « plan d'architecte » ----------
const C = { fond: 0x0f2a4d, trait: 0x9cc4ee, casier: 0xc9d6e6, arete: 0x24456f, sel: 0x0b1f3a, trouve: 0xff7a00 };

// ---------- Rendu ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.fond);
const VFOV = 38, TAN_V = Math.tan(THREE.MathUtils.degToRad(VFOV / 2));
const camera = new THREE.PerspectiveCamera(VFOV, 1, 0.1, 300);
scene.add(camera);
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const camLight = new THREE.PointLight(0xffffff, 2.4, 0, 0); camLight.position.set(1.2, 1.6, 0.6); camera.add(camLight);
let aspect = 1;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); aspect = w / h;
  camera.aspect = aspect; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// ---------- Sol, voûte en traits, repères ----------
const decor = new THREE.Group(); scene.add(decor);   // masqué quand on regarde un casier de face
{
  const grid = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#163a66'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(156,196,238,.22)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  }, true);
  const fg = new THREE.PlaneGeometry(2 * R, L);
  const fu = fg.attributes.uv; for (let i = 0; i < fu.count; i++) fu.setXY(i, fu.getX(i) * 2 * R / 0.5, fu.getY(i) * L / 0.5);
  const floor = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: grid })); floor.rotation.x = -Math.PI / 2; scene.add(floor);

  const lineMat = new THREE.LineBasicMaterial({ color: C.trait, transparent: true, opacity: 0.75 });
  const arc = []; arc.push(new THREE.Vector3(-R, 0, 0), new THREE.Vector3(-R, WALL_H, 0));
  for (let i = 1; i < 40; i++) { const a = Math.PI - (i / 40) * Math.PI; arc.push(new THREE.Vector3(R * Math.cos(a), WALL_H + R * Math.sin(a), 0)); }
  arc.push(new THREE.Vector3(R, WALL_H, 0), new THREE.Vector3(R, 0, 0));
  const arcGeo = new THREE.BufferGeometry().setFromPoints(arc);
  const nArcs = Math.max(3, Math.round(L / 1.1) + 1);
  for (let i = 0; i < nArcs; i++) { const l = new THREE.Line(arcGeo, lineMat); l.position.z = -L / 2 + (i / (nArcs - 1)) * L; decor.add(l); }
  const longs = [];
  for (const [x, y] of [[-R, 0], [-R, WALL_H], [R, 0], [R, WALL_H], [0, WALL_H + R], [-R * 0.707, WALL_H + R * 0.707], [R * 0.707, WALL_H + R * 0.707]])
    longs.push(new THREE.Vector3(x, y, -L / 2), new THREE.Vector3(x, y, L / 2));
  longs.push(new THREE.Vector3(-R, 0, -L / 2), new THREE.Vector3(R, 0, -L / 2), new THREE.Vector3(-R, 0, L / 2), new THREE.Vector3(R, 0, L / 2));
  decor.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(longs), lineMat));

  // Nom de la cave et entrée, écrits au sol
  const tex = canvasTex(1024, 256, (g, w, h) => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#dcebfb';
    let size = 96; do { g.font = `600 ${size}px -apple-system, "Helvetica Neue", sans-serif`; size -= 4; } while (g.measureText(config.nom).width > w - 60 && size > 30);
    g.fillText(config.nom, w / 2, 92);
    g.font = '500 54px -apple-system, "Helvetica Neue", sans-serif'; g.fillStyle = '#9cc4ee'; g.fillText('▼  ENTRÉE  ▼', w / 2, 200);
  });
  const t = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  t.rotation.x = -Math.PI / 2; t.position.set(0, 0.01, L / 2 - 0.5); decor.add(t);
}

// ---------- Casiers ----------
const racks = {};   // clé -> { group, plane, body, cols, rows, flip, W, H, discs, rings, normal, label }
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
/** Dessin d'un emplacement vide, par type de rangement (vu de face, depuis l'allée). */
const CELL_DRAW = {
  alveoles(g, w, h) {
    g.fillStyle = '#eef3f9'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c2d0e2'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    const r = 0.38 * Math.min(w, h), hole = g.createRadialGradient(w / 2, h / 2 + r * 0.15, r * 0.15, w / 2, h / 2, r);
    hole.addColorStop(0, '#1b2f4c'); hole.addColorStop(0.75, '#2b4467'); hole.addColorStop(1, '#5f7da3');
    g.fillStyle = hole; g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, r + 2, 0.5, 2.6); g.stroke();
  },
  metal(g, w, h) {   // casier en fil de fer : fond sombre, deux fils ondulés
    g.fillStyle = '#d9e1ea'; g.fillRect(0, 0, w, h);
    const hole = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.48);
    hole.addColorStop(0, '#22334a'); hole.addColorStop(1, '#8798ad');
    g.fillStyle = hole; g.fillRect(0, h * 0.08, w, h * 0.84);
    g.strokeStyle = '#3d4b5e'; g.lineWidth = 5;
    for (const y of [h * 0.06, h * 0.94]) {
      g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, y + Math.sin((x / w) * Math.PI * 2) * h * 0.03); g.stroke();
    }
  },
  cases(g, w, h) {   // case maçonnée : montants noirs, étagère en béton, intérieur ombré
    const inner = g.createLinearGradient(0, 0, 0, h);
    inner.addColorStop(0, '#7f8b99'); inner.addColorStop(1, '#b9c1cb');
    g.fillStyle = inner; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f2630'; g.fillRect(0, 0, w * 0.035, h); g.fillRect(w * 0.965, 0, w * 0.035, h);
    g.fillStyle = '#d8dde3'; g.fillRect(0, h * 0.9, w, h * 0.1);
    g.fillStyle = '#2a323d'; g.fillRect(0, h * 0.9, w, h * 0.015);
  },
  caisses(g, w, h) {   // caisse en bois : cadre en planches, intérieur sombre
    g.fillStyle = '#b8875a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4a3426'; g.fillRect(w * 0.06, h * 0.1, w * 0.88, h * 0.8);
    g.strokeStyle = '#8c6239'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
    g.beginPath(); g.moveTo(0, h * 0.5); g.lineTo(w * 0.06, h * 0.5); g.moveTo(w * 0.94, h * 0.5); g.lineTo(w, h * 0.5); g.stroke();
  },
};
const cellTexCache = {};
/** Texture d'un emplacement à la bonne proportion (largeur × hauteur du type de rangement). */
function cellTexture(style) {
  if (!cellTexCache[style]) {
    const st = STYLES[style], W = 256, H = Math.round(256 * st.h / st.w);
    cellTexCache[style] = canvasTex(W, H, CELL_DRAW[style] || CELL_DRAW.alveoles, true);
  }
  return cellTexCache[style];
}
// Reflets : un petit « studio » lumineux que le verre reflète, pour un rendu réaliste.
{
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x1a2a40, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(i, i, i * 0.96), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(5, 5, 0, 4.8, 0, 5); panel(1.2, 7, -4.6, 0.5, 1.5, 9); panel(2.5, 6, 4.6, 0, -1, 3); panel(6, 3, 0, 1, 4.8, 2.5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.03).texture; pmrem.dispose();
}
// Chaque bouteille enregistrée est couchée dans son emplacement : on voit son culot dépasser du casier.
const BOTTLE_OUT = 0.07;
const glassGeo = new THREE.LatheGeometry([[0.0745, -0.07], [0.0745, BOTTLE_OUT - 0.02], [0.073, BOTTLE_OUT - 0.009], [0.068, BOTTLE_OUT - 0.002], [0.06, BOTTLE_OUT],
  [0.052, BOTTLE_OUT - 0.003], [0.044, BOTTLE_OUT - 0.012], [0.03, BOTTLE_OUT - 0.03], [0.014, BOTTLE_OUT - 0.042], [0, BOTTLE_OUT - 0.046]].map(([r, y]) => new THREE.Vector2(r, y)), 36).rotateX(Math.PI / 2);
const glassMat = new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0, envMapIntensity: 1.5 });

// Disposition des bouteilles dans un emplacement : cellLayout() dans lib.js.
const ringGeo = new THREE.RingGeometry(0.08, 0.099, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: C.trouve, transparent: true, depthTest: false });
const edgeMat = new THREE.LineBasicMaterial({ color: C.arete });
function withEdges(mesh) { mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat)); return mesh; }
function makeLabel(text, key) {
  const tex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.beginPath(); if (g.roundRect) g.roundRect(4, 14, w - 8, h - 28, 50); else g.rect(4, 14, w - 8, h - 28); g.fill();   // roundRect : Safari 16+
    g.fillStyle = '#10294a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 50px -apple-system, "Helvetica Neue", sans-serif'; g.fillText(text, w / 2, h / 2 + 3);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.5, 0.375, 1); s.renderOrder = 10; s.userData.rack = key; decor.add(s); return s;
}
function makeRack(key, x, rotY, flip, hasBody, labelText) {
  const { cols, rows, style } = rk[key], { cw, ch, W, H, grid } = dims[key], layout = cellLayout(style), isCases = style === 'cases';
  const group = new THREE.Group(); group.position.set(x, 0, 0); group.rotation.y = rotY; scene.add(group);
  let plane;
  if (isCases) {
    // Cases maçonnées : façade dessinée case par case (tailles inégales) ; ce plan invisible sert au toucher.
    plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  } else {
    const tex = cellTexture(style).clone(); tex.needsUpdate = true; tex.repeat.set(cols, rows);
    plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex }));
  }
  plane.position.set(0, BASE + H / 2, 0.004); plane.userData.rack = key; group.add(plane);
  let body = null;
  if (hasBody) {
    body = withEdges(new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, BASE + H + 0.04, RACK_D), new THREE.MeshBasicMaterial({ color: C.casier })));
    body.position.set(0, (BASE + H + 0.04) / 2, -RACK_D / 2); body.userData.rack = key; group.add(body);
  }
  group.updateMatrixWorld(true);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
  const label = makeLabel(labelText, key);
  label.position.set(x + normal.x * (hasBody ? -RACK_D / 2 : 0.55), BASE + H + (hasBody ? 0.4 : 0.6), (key === 'G' || key === 'ID' ? -1 : 1) * W * 0.22);
  const ringS = Math.min(cw, ch) / 0.2;   // anneaux de sélection et de recherche à la taille de l'emplacement
  racks[key] = { key, group, plane, body, cols, rows, flip, cw, ch, W, H, layout, ringS, normal, label, isCases, grid, facade: null, places: [], glass: null, rings: null };
  buildFacade(racks[key]);
}
/** Places (ordre de la pile) de chaque case d'un casier en cases maçonnées : rack.places[c][r]. */
function computePlaces(rack) {
  rack.places = rack.isCases ? rack.grid.colW.map((w) => rack.grid.rowH.map((h) => casePlaces(w, h))) : [];
}
/**
 * (Re)construit la façade d'un casier en cases maçonnées (cases et séparations) et les pastilles des bouteilles.
 * Appelée à la création et après chaque déplacement d'une séparation (la taille totale ne change pas).
 */
function buildFacade(rack) {
  const { group, cols, rows, layout } = rack;
  // Ne libérer que ce qui appartient à ce casier : les géométries de bouteille et d'anneau sont partagées
  if (rack.facade) { group.remove(rack.facade); rack.facade.traverse((o) => o.geometry?.dispose()); }
  for (const m of [rack.glass, rack.rings]) if (m) { group.remove(m); m.dispose(); }
  rack.facade = null;
  computePlaces(rack);
  rack.seps = [];
  if (rack.isCases) {
    const g = new THREE.Group(), tex = cellTexture('cases'), { colW, rowH, rowY } = rack.grid;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const [cx, cy, w, h] = caseLocal(rack, c, r);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), caseMat(tex)); m.position.set(cx, cy, 0.003); g.add(m);
    }
    // Séparations intérieures : objets fins, qu'on peut toucher et allumer dans « Ajuster les séparations ».
    for (let i = 1; i < cols; i++) {
      const x = caseLocal(rack, i, 0)[0] + (rack.flip ? 1 : -1) * colW[i] / 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(SEP_W, rack.H), sepMat); m.position.set(x, BASE + rack.H / 2, 0.006);
      m.userData.sep = { axis: 'col', i: i - 1 }; g.add(m); rack.seps.push(m);
    }
    for (let j = 1; j < rows; j++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rack.W, SEP_W), sepMat); m.position.set(0, BASE + rowY[j], 0.006);
      m.userData.sep = { axis: 'row', i: j - 1 }; g.add(m); rack.seps.push(m);
    }
    group.add(g); rack.facade = g;
    paintSeps(rack);
  }
  // Nombre maximal de bouteilles visibles : toutes les places des cases maçonnées, sinon selon la disposition.
  const n = rack.isCases ? rack.places.flat().reduce((s, p) => s + p.length, 0) : cols * rows * layout.pts.length;
  // Toutes les bouteilles sont montrées culot vers l'allée (bouchon caché), quel que soit le rangement réel.
  rack.glass = new THREE.InstancedMesh(glassGeo, glassMat, Math.max(1, n));
  rack.rings = new THREE.InstancedMesh(ringGeo, ringMat, Math.max(1, rack.isCases ? n : cols * rows));
  for (const m of [rack.glass, rack.rings]) { m.count = 0; m.frustumCulled = false; group.add(m); }
  rack.rings.renderOrder = 5;
}
const SEP_W = 0.025;   // épaisseur dessinée d'une séparation entre deux cases
const sepMat = new THREE.MeshBasicMaterial({ color: 0x1f2630 });
// Réglage des séparations en cours (déclaré ici : les casiers sont construits avant la section « Ajuster »)
let adjust = null;   // { k, before: { colW, rowH }, sel: { axis, i } | null, drag: { from, sizes } | null }
const sepHlMat = new THREE.MeshBasicMaterial({ color: C.trouve });   // séparation choisie (orange)
/** Séparations épaissies pendant « Ajuster les séparations », celle qui est choisie en orange. */
function paintSeps(rack) {
  const on = adjust?.k === rack.key;
  for (const m of rack.seps || []) {
    const { axis, i } = m.userData.sep, sel = on && adjust.sel?.axis === axis && adjust.sel.i === i;
    m.material = sel ? sepHlMat : sepMat;
    m.scale.set(axis === 'col' && on ? 2.4 : 1, axis === 'row' && on ? 2.4 : 1, 1);
  }
}
const caseMatCache = new Map();
function caseMat(tex) { if (!caseMatCache.has(tex)) caseMatCache.set(tex, new THREE.MeshBasicMaterial({ map: tex })); return caseMatCache.get(tex); }
/**
 * Centre et taille d'une case dans le repère du casier : [cx, cy, largeur, hauteur].
 * Colonne 0 = la plus proche de l'entrée (à droite du casier quand il est « retourné »).
 */
function caseLocal(rack, c, r) {
  const { colW, rowH, colX, rowY } = rack.grid, w = colW[c], h = rowH[r];
  const x0 = rack.flip ? rack.W / 2 - colX[c] - w : -rack.W / 2 + colX[c];
  return [x0 + w / 2, BASE + rowY[r] + h / 2, w, h];
}
/** Position d'une bouteille de case maçonnée dans son casier (selon son rang dans la pile), ou null si elle ne tient pas. */
function bottleLocal(rec) {
  const { k, c, r, u } = parseId(rec.id), rack = racks[k];
  if (!u || !rack?.isCases || !inRack(k, c, r)) return null;
  const p = rack.places[c][r][rec.pile ?? 0]; if (!p) return null;
  const [cx, cy] = caseLocal(rack, c, r);
  return [cx + p[0], cy + p[1]];   // x positif = à droite vu depuis l'allée, comme le repère du casier
}
function slotLocal(rack, c, r) { const [x, y] = caseLocal(rack, c, r); return [x, y]; }
function slotWorld(key, c, r, out = new THREE.Vector3()) {
  const rack = racks[key]; const [lx, ly] = slotLocal(rack, c, r);
  return rack.group.localToWorld(out.set(lx, ly, 0));
}
const inRack = (key, c, r) => racks[key] && c >= 0 && r >= 0 && c < racks[key].cols && r < racks[key].rows;

// Colonne 1 = toujours la plus proche de l'entrée
makeRack('G', -RACK_FRONT_X, Math.PI / 2, false, true, 'Mur gauche');
makeRack('D', RACK_FRONT_X, -Math.PI / 2, true, true, 'Mur droit');
// L'îlot est fait de deux casiers dos à dos, chacun avec son propre meuble (comme les murs) :
// chaque face a sa longueur et sa hauteur, sans grand bloc commun.
makeRack('IG', -ISLAND_W / 2, -Math.PI / 2, true, true, 'Îlot gauche');
makeRack('ID', ISLAND_W / 2, Math.PI / 2, false, true, 'Îlot droit');

// ---------- Pastilles des bouteilles ----------
let hiddenId = null;     // bouteille « sortie » (présentée en gros plan)
const tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), IDQ = new THREE.Quaternion();
/** Redessine les bouteilles enregistrées dans les casiers (plusieurs par emplacement selon la quantité et le type de rangement). */
function rebuildBottles() {
  for (const k of RACK_ORDER) {
    const rack = racks[k], { pts, s } = rack.layout; let i = 0;
    tmpS.setScalar(s);
    if (rack.isCases) {   // une pastille par bouteille, à sa place dans la pile, à taille réelle
      tmpS.setScalar(BOTTLE_D / 0.149);   // 0,149 m : diamètre du culot de glassGeo
      for (const rec of records.values()) {
        if (rec.vide || rec.id === hiddenId || !rec.id.startsWith(k + ':')) continue;
        const pos = bottleLocal(rec); if (!pos) continue;
        rack.glass.setMatrixAt(i, tmpM.compose(tmpP.set(pos[0], pos[1], 0), IDQ, tmpS));
        rack.glass.setColorAt(i, tmpC.setHex(typeOf(rec).verre)); i++;
      }
    } else for (let c = 0; c < rack.cols; c++) for (let r = 0; r < rack.rows; r++) {
      const id = slotId(k, c, r), rec = bottleAt(id);
      if (!rec || id === hiddenId) continue;   // non enregistrée : l'emplacement reste vide à l'écran
      const [lx, ly] = slotLocal(rack, c, r), t = typeOf(rec);
      for (let j = Math.min(pts.length, qty(rec)) - 1; j >= 0; j--) {
        tmpM.compose(tmpP.set(lx + pts[j][0], ly + pts[j][1], pts[j][2]), IDQ, tmpS);
        rack.glass.setMatrixAt(i, tmpM); rack.glass.setColorAt(i, tmpC.setHex(t.verre));
        i++;
      }
    }
    rack.glass.count = i; rack.glass.instanceMatrix.needsUpdate = true; if (rack.glass.instanceColor) rack.glass.instanceColor.needsUpdate = true;
  }
}
let highlighted = [];    // identifiants mis en évidence par la recherche (anneaux orange)
let picked = false;      // un résultat de recherche a été choisi : un enregistrement ne rallume pas toute la recherche
function rebuildRings() {
  const count = {}; for (const k of RACK_ORDER) count[k] = 0;
  for (const id of highlighted) {
    const { k, c, r, u } = parseId(id); if (!inRack(k, c, r)) continue;
    const rack = racks[k];
    // Case maçonnée : un anneau autour de la bouteille trouvée ; ailleurs, autour de l'emplacement.
    const rec = records.get(id);   // une bouteille allumée a pu être retirée depuis
    const pos = u ? (rec ? bottleLocal(rec) : null) : slotLocal(rack, c, r); if (!pos) continue;
    const s = u ? BOTTLE_D / 0.18 : rack.ringS;
    rack.rings.setMatrixAt(count[k]++, tmpM.compose(tmpP.set(pos[0], pos[1], BOTTLE_OUT + 0.004), IDQ, tmpS.setScalar(s)));
  }
  for (const k of RACK_ORDER) { racks[k].rings.count = count[k]; racks[k].rings.instanceMatrix.needsUpdate = true; }
}
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.082, 0.1, 40), new THREE.MeshBasicMaterial({ color: C.sel, transparent: true }));
selRing.visible = false; selRing.renderOrder = 6; scene.add(selRing);

// ---------- Caméra : vue d'ensemble ou casier de face ----------
const view = { mode: 'overview', key: null, az: 0.42, el: 0.9, zoom: 1, u: 0, v: 0, d: 5 };
const cam = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), ready: false };
const goalPos = new THREE.Vector3(), goalTgt = new THREE.Vector3();
const tanH = () => TAN_V * aspect;
const fitDist = () => (Math.hypot(R, L / 2) + 0.4) / (TAN_V * Math.min(1, aspect)) * (aspect > 1 ? 1.25 : 0.8);
const dFor = (width) => (width + 0.35) / 2 / tanH();                       // distance pour voir `width` mètres de casier
// Partie de l'écran réellement libre pour la maquette : sous la barre de recherche, au-dessus de l'aide,
// et de la barre du bas (mesurée sur la page, donc juste sur tous les iPhone).
let freeArea = { top: 0, bottom: 0 };
function measureFreeArea() {
  const h = window.innerHeight, top = $('topbar').getBoundingClientRect().bottom + 8;
  // (offsetParent est toujours nul pour un élément « fixed » : on teste la présence à l'écran avec getClientRects)
  const lows = ['nav', 'hint'].map((id) => $(id)).filter((el) => el && !el.hidden && el.getClientRects().length && el.textContent.trim())
    .map((el) => el.getBoundingClientRect().top).filter((y) => y > h / 2);
  freeArea = { top, bottom: h - (lows.length ? Math.min(...lows) - 8 : h) };
}
/** Part de la hauteur de l'écran où la maquette est visible (le reste est couvert par les boutons). */
const usableRatio = () => clamp((window.innerHeight - freeArea.top - freeArea.bottom) / window.innerHeight, 0.4, 1);
/** En vue casier, recentre l'image dans la partie libre de l'écran, pour que rien ne soit caché sous les boutons. */
function applyViewOffset() {
  measureFreeArea();
  const w = window.innerWidth, h = window.innerHeight, shift = view.mode === 'rack' ? (freeArea.bottom - freeArea.top) / 2 : 0;
  if (shift) camera.setViewOffset(w, h, 0, shift, w, h); else camera.clearViewOffset();
}
window.addEventListener('resize', () => { applyViewOffset(); clampView(); });   // rotation : la partie libre change
const dMax = (rack) => Math.max(dFor(rack.W), (rack.H + 0.5) / 2 / TAN_V / usableRatio());   // tout le casier, dans la partie libre
// Zoom maximal : une case maçonnée peut remplir l'écran ; une place de casier métallique fait ≈ 55 px
const dMin = (rack) => (rack.isCases ? 0.3 / 2 / tanH() : dFor(Math.max(0.25, 1.3 * rack.cw)));
// Largeur montrée à l'ouverture d'un casier : assez d'emplacements pour se repérer, assez grands pour être touchés du doigt.
const viewW = (rack) => clamp(6 * rack.cw, 0.54, 1.4);
function clampView() {
  if (view.mode !== 'rack') { view.zoom = clamp(view.zoom, 0.4, 1.35); view.el = clamp(view.el, 0.3, 1.5); return; }
  const rack = racks[view.key];
  view.d = clamp(view.d, Math.min(dMin(rack), dMax(rack)), dMax(rack));
  const maxU = Math.max(0, rack.W / 2 - view.d * tanH() + 0.18);
  view.u = clamp(view.u, -maxU, maxU);
  view.v = clamp(view.v, -view.d * TAN_V, BASE + rack.H);
}
function computeGoal() {
  if (view.mode === 'overview') {
    const d = fitDist() * view.zoom;
    goalTgt.set(0, 0.9, 0);
    goalPos.set(Math.sin(view.az) * Math.cos(view.el), Math.sin(view.el), Math.cos(view.az) * Math.cos(view.el)).multiplyScalar(d).add(goalTgt);
  } else {
    const rack = racks[view.key];
    rack.group.localToWorld(goalTgt.set(view.u, view.v, 0));
    goalPos.copy(goalTgt).addScaledVector(rack.normal, view.d);
  }
}
function applyVisibility() {
  const ov = view.mode === 'overview', k = view.key;
  decor.visible = ov;
  for (const key of RACK_ORDER) racks[key].group.visible = ov || key === k;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === (ov ? 'overview' : k)));
  document.body.classList.toggle('rack-mode', !ov);
  $('hint').textContent = ov ? 'Touchez un casier pour l\'ouvrir · glissez pour tourner la maquette'
    : racks[k]?.isCases ? 'Touchez une case pour l\'ouvrir · glissez pour faire défiler' : 'Touchez une bouteille · glissez pour faire défiler';
  applyViewOffset();
}
function showOverview() { view.mode = 'overview'; view.key = null; applyVisibility(); }
// Hauteur de visée au repos : casier centré dans la partie libre ; s'il est plus haut qu'elle (casiers métalliques,
// zoomés pour le doigt), on montre le bas (rangée 1) juste au-dessus des boutons : le haut se découvre en glissant.
const restV = (rack) => Math.min(BASE + rack.H / 2 + 0.1, BASE - 0.02 + view.d * TAN_V * usableRatio());
function showRack(key) {
  const rack = racks[key];
  view.mode = 'rack'; view.key = key;
  applyVisibility();   // d'abord : affiche les boutons de la vue casier, puis mesure la partie libre de l'écran
  view.d = Math.min(dFor(Math.min(rack.W, viewW(rack))), dMax(rack)); view.u = 0;
  view.v = restV(rack);
  clampView();
}
/**
 * Cadre une case maçonnée dans la partie de l'écran au-dessus de la fiche (`sheetTop`, en pixels), aussi grande
 * que possible mais sans que le culot d'une bouteille fasse moins de 44 px. Une case trop large pour cela est
 * cadrée sur son coin en bas à droite (le début de la pile) ; on fait glisser pour voir le reste.
 */
function focusCase(k, c, r, sheetTop = window.innerHeight * 0.5) {
  const rack = racks[k], [cx, cy, w, h] = caseLocal(rack, c, r), H = window.innerHeight;
  if (view.mode !== 'rack' || view.key !== k) showRack(k);
  const top = freeArea.top, bottom = Math.max(top + 120, sheetTop - 8), frac = (bottom - top) / H;
  const dFit = Math.max((w + 0.06) / 2 / tanH(), (h + 0.06) / 2 / TAN_V / frac);
  const d44 = BOTTLE_D * H / (88 * TAN_V);   // distance où un culot de 8 cm fait 44 px à l'écran
  view.d = Math.min(dFit, d44);
  const m = 2 * view.d * TAN_V / H, yc = (freeArea.top + H - freeArea.bottom) / 2;   // mètres par pixel ; centre visé à l'écran
  if (dFit <= d44) { view.u = cx; view.v = cy - (yc - (top + bottom) / 2) * m; }
  else { view.u = cx + w / 2 + 0.02 - view.d * tanH(); view.v = cy - h / 2 - (yc - bottom + 4) * m; }
  clampView();
}
function focusSlot(key, c, r) {
  const rack = racks[key], [lx, ly] = slotLocal(rack, c, r);
  if (view.mode !== 'rack' || view.key !== key) showRack(key);
  view.d = Math.min(view.d, dFor(Math.min(rack.W, viewW(rack))));
  view.u = lx; view.v = ly - 0.44 * view.d * TAN_V;   // l'emplacement apparaît dans le haut de l'écran, au-dessus de la fiche
  clampView();
}
function updateCamera(dt) {
  computeGoal();
  if (!cam.ready) { cam.pos.copy(goalPos); cam.tgt.copy(goalTgt); cam.ready = true; }
  const k = 1 - Math.exp(-dt * 7);
  cam.pos.lerp(goalPos, k); cam.tgt.lerp(goalTgt, k);
  camera.position.copy(cam.pos); camera.lookAt(cam.tgt);
}

// ---------- La bouteille présentée en gros plan ----------
const hero = new THREE.Group(); hero.visible = false; scene.add(hero);
const heroGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x14220e, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6 });
const heroCapMat = new THREE.MeshStandardMaterial({ color: 0x6e1020, roughness: 0.34, metalness: 0.75, envMapIntensity: 1.2 });
const labelCanvas = document.createElement('canvas'); labelCanvas.width = 512; labelCanvas.height = 512;
const labelTex = new THREE.CanvasTexture(labelCanvas); labelTex.colorSpace = THREE.SRGBColorSpace;
let heroLabel;
{
  const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y - 0.15)), seg);
  // Profil d'une bouteille bordelaise : piqûre au fond, épaules marquées, bague au goulot
  hero.add(new THREE.Mesh(lathe([[0, 0.016], [0.012, 0.012], [0.024, 0.003], [0.031, 0], [0.0355, 0.0015], [0.0375, 0.007], [0.0375, 0.166], [0.0369, 0.178], [0.0345, 0.191],
    [0.0295, 0.203], [0.0225, 0.214], [0.0178, 0.224], [0.0155, 0.236], [0.0146, 0.25], [0.0142, 0.284], [0.0143, 0.2875], [0.0163, 0.289], [0.0163, 0.2965], [0.015, 0.2995], [0.0098, 0.3], [0, 0.3]], 72), heroGlassMat));
  hero.add(new THREE.Mesh(lathe([[0.0159, 0.236], [0.0151, 0.25], [0.0147, 0.284], [0.0148, 0.2872], [0.0168, 0.2887], [0.0168, 0.297], [0.0154, 0.3008], [0.008, 0.3014], [0, 0.3014]], 48), heroCapMat));
  heroLabel = new THREE.Mesh(new THREE.CylinderGeometry(0.0379, 0.0379, 0.088, 64, 1, true, -1.3, 2.6), new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.9, metalness: 0, envMapIntensity: 0.35 }));
  heroLabel.position.y = -0.058; hero.add(heroLabel);
}
function wrapText(g, text, maxW) {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function drawLabel(b) {
  const g = labelCanvas.getContext('2d'), w = 512, h = 512;
  g.fillStyle = '#f7f1e1'; g.fillRect(0, 0, w, h);
  if (b.photo) {
    const img = new Image();
    img.onload = () => { const s = Math.max(w / img.width, h / img.height); g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s); labelTex.needsUpdate = true; };
    img.src = b.photo;
  }
  g.strokeStyle = '#b08a3c'; g.lineWidth = 4; g.strokeRect(96, 28, w - 192, h - 56);
  g.fillStyle = '#2a1a10'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 40px Georgia, serif';
  const lines = wrapText(g, b.nom || 'Sans nom', 280).slice(0, 4);
  let y = 190 - (lines.length - 1) * 23;
  for (const l of lines) { g.fillText(l, w / 2, y, 290); y += 46; }
  g.font = 'italic 25px Georgia, serif'; g.fillStyle = '#5a4630';
  if (b.appellation) g.fillText(b.appellation, w / 2, y + 8, 285);
  if (b.millesime) { g.font = 'bold 64px Georgia, serif'; g.fillStyle = '#7a1626'; g.fillText(b.millesime, w / 2, 420); }
  labelTex.needsUpdate = true;
}
let heroAnim = null;
// b = fiche de la bouteille, ou null pour une bouteille non enregistrée (sans étiquette)
function presentBottle(b, key, c, r) {
  const inPile = b && parseId(b.id).u, id = inPile ? b.id : slotId(key, c, r);
  heroGlassMat.color.setHex(b ? typeOf(b).verre : UNKNOWN_GLASS);
  heroCapMat.color.setHex(b ? typeOf(b).capsule : 0x1d1f23);
  heroLabel.visible = !!b; if (b) drawLabel(b);
  computeGoal();
  const pos = inPile && bottleLocal(b);   // bouteille de case : elle sort de sa place dans la pile
  const n = racks[key].normal, s = pos ? racks[key].group.localToWorld(new THREE.Vector3(pos[0], pos[1], 0)) : slotWorld(key, c, r);
  const m = new THREE.Matrix4().lookAt(goalPos, goalTgt, camera.up), camQ = new THREE.Quaternion().setFromRotationMatrix(m);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ), up = new THREE.Vector3(0, 1, 0).applyQuaternion(camQ);
  const dh = Math.min(2.2, view.d * 0.5), scale = 1.55 * dh / 2.2;
  heroAnim = {
    t0: performance.now(), camQ, s0: scale * 0.45, s1: scale,
    qIn: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().negate()),
    p0: s.clone().addScaledVector(n, -0.1),
    p1: goalPos.clone().addScaledVector(fwd, dh).addScaledVector(up, 0.42 * dh * TAN_V),
  };
  hero.position.copy(heroAnim.p0); hero.quaternion.copy(heroAnim.qIn); hero.scale.setScalar(heroAnim.s0); hero.visible = true;
  hiddenId = id; rebuildBottles();
}
function hideHero() { hero.visible = false; heroAnim = null; if (hiddenId) { hiddenId = null; rebuildBottles(); } }
const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const qSpin = new THREE.Quaternion(), qTmp = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
function updateHero(now) {
  if (!heroAnim) return;
  const a = heroAnim, t = (now - a.t0) / 1000, u = ease(clamp((t - 0.15) / 1.0, 0, 1));
  hero.position.lerpVectors(a.p0, a.p1, u);
  hero.scale.setScalar(a.s0 + (a.s1 - a.s0) * u);
  qSpin.setFromAxisAngle(Y, t > 1.15 ? Math.sin((t - 1.15) * 0.8) * 0.7 : 0);
  hero.quaternion.slerpQuaternions(a.qIn, qTmp.copy(a.camQ).multiply(qSpin), u);
}

// ---------- Ajuster les séparations d'un casier en cases maçonnées ----------
// On touche une séparation (elle s'allume) et on la fait glisser. Une séparation s'arrête d'elle-même avant
// qu'une case n'ait plus assez de places pour ses bouteilles : aucune bouteille ne peut disparaître.
const sizesOf = (k, axis) => (axis === 'col' ? rk[k].colW : rk[k].rowH);
function startAdjust(k) {
  if (!racks[k]?.isCases) return;
  if (adjust) endAdjust(false);   // un seul réglage à la fois : l'éventuel précédent est abandonné
  closeSheet(); endMode(); $('results').hidden = true;
  const g = racks[k].grid;
  adjust = { k, before: { colW: rk[k].colW, rowH: rk[k].rowH }, sel: null, drag: null };
  rk[k].colW = [...g.colW]; rk[k].rowH = [...g.rowH];   // copie de travail, enregistrée par « Terminé »
  showRack(k); view.d = dMax(racks[k]); clampView();
  document.body.classList.add('adjusting'); $('adjustBar').hidden = false; adjustText();
  paintSeps(racks[k]);
}
function adjustText(extra = '') {
  $('adjustText').textContent = extra || 'Touchez une séparation entre deux cases, puis faites-la glisser.';
}
/** Redessine le casier après un changement de tailles (la taille totale ne change pas). */
function rebuildRack(k) {
  const rack = racks[k]; rack.grid = rackGrid(rk[k]);
  buildFacade(rack); rebuildBottles(); rebuildRings();
}
async function endAdjust(save) {
  if (!adjust) return;
  const { k, before } = adjust;
  if (save) {
    const next = normalizeConfig({ ...config, rev: CONFIG_REV });
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)); }
    catch { toast('Impossible d\'enregistrer le réglage sur cet appareil (stockage bloqué)'); return; }   // le mode reste ouvert
  } else {
    if (before.colW) rk[k].colW = before.colW; else delete rk[k].colW;
    if (before.rowH) rk[k].rowH = before.rowH; else delete rk[k].rowH;
  }
  adjust = null; document.body.classList.remove('adjusting'); $('adjustBar').hidden = true;
  rebuildRack(k); applyVisibility();
  if (save) saved('Séparations enregistrées');
}
$('adjustDone').onclick = () => endAdjust(true);
$('adjustCancel').onclick = () => endAdjust(false);
/** Point du doigt dans le repère du casier (ou null hors du casier). */
function rackPoint(k, cx, cy) {
  ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const h = raycaster.intersectObject(racks[k].plane, false)[0];
  return h ? racks[k].group.worldToLocal(h.point.clone()) : null;
}
/** Séparation la plus proche du doigt, à moins de 24 px (zone de toucher élargie), ou null. */
function sepAt(k, l) {
  const rack = racks[k], mpp = 2 * view.d * TAN_V / window.innerHeight, tol = 24 * mpp;
  let best = null, bd = tol;
  for (const m of rack.seps) {
    const { axis } = m.userData.sep, d = axis === 'col' ? Math.abs(l.x - m.position.x) : Math.abs(l.y - m.position.y);
    if (d <= bd) { bd = d; best = m.userData.sep; }
  }
  return best;
}
/** Une case garde-t-elle assez de places pour ses bouteilles avec cette taille ? (butée des séparations) */
function sizeAccepted(k, axis, index, size) {
  const { colW, rowH } = rk[k], n = axis === 'col' ? rowH.length : colW.length;
  for (let j = 0; j < n; j++) {
    const [c, r] = axis === 'col' ? [index, j] : [j, index];
    const w = axis === 'col' ? size : colW[c], h = axis === 'col' ? rowH[r] : size;
    if (casePlaces(w, h).length < (adjust.drag.counts.get(slotId(k, c, r)) || 0)) return false;
  }
  return true;
}
const cmText = (m) => `${Math.round(m * 100)} cm`;
function dragSeparator(l) {
  const { k, sel, drag } = adjust, rack = racks[k];
  // Déplacement mesuré depuis l'entrée (colonnes) ou depuis le bas (étagères)
  const delta = sel.axis === 'col' ? (rack.flip ? -1 : 1) * (l.x - drag.from.x) : l.y - drag.from.y;
  const next = moveSeparator(drag.sizes, sel.i, delta, (index, size) => sizeAccepted(k, sel.axis, index, size));
  if (sel.axis === 'col') rk[k].colW = next; else rk[k].rowH = next;
  rebuildRack(k);
  const a = next[sel.i], b = next[sel.i + 1];
  adjustText(sel.axis === 'col' ? `Colonne ${sel.i + 1} : ${cmText(a)} · colonne ${sel.i + 2} : ${cmText(b)} de large`
    : `Rangée ${sel.i + 1} : ${cmText(a)} · rangée ${sel.i + 2} : ${cmText(b)} de haut`);
}

// ---------- Toucher : tourner, faire défiler, sélectionner ----------
const pointers = new Map(); let tapStart = null, pinchDist = 0;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  else { tapStart = null; const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  $('search').blur();
  if (adjust) {   // un doigt sur une séparation : elle s'allume et suit le doigt ; ailleurs : on fait défiler
    adjust.drag = null;
    const l = pointers.size === 1 && rackPoint(adjust.k, e.clientX, e.clientY), sep = l && sepAt(adjust.k, l);
    if (sep) {
      // Nombre de bouteilles par case, compté une fois au début du geste (et non à chaque mouvement du doigt)
      const counts = new Map(); for (const b of allBottles()) if (parseId(b.id).u) counts.set(caseIdOf(b.id), (counts.get(caseIdOf(b.id)) || 0) + 1);
      adjust.sel = sep; adjust.drag = { from: l, sizes: [...sizesOf(adjust.k, sep.axis)], counts }; tapStart = null; paintSeps(racks[adjust.k]);
    }
  }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1 && adjust?.drag) { const l = rackPoint(adjust.k, e.clientX, e.clientY); if (l) dragSeparator(l); return; }
  if (pointers.size === 1) {
    if (tapStart && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 8) return;
    tapStart = null;
    if (view.mode === 'overview') { view.az -= dx * 0.007; view.el += dy * 0.005; }
    else { const m = 2 * view.d * TAN_V / window.innerHeight; view.u -= dx * m; view.v += dy * m; }
    clampView();
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomBy(pinchDist / Math.max(d, 1)); pinchDist = d;
  }
});
function endPointer(e) {
  const had = pointers.delete(e.pointerId);
  if (adjust) { adjust.drag = null; tapStart = null; return; }   // en réglage, un toucher n'ouvre rien
  if (had && tapStart && pointers.size === 0 && e.type === 'pointerup' && performance.now() - tapStart.t < 500) onTap(e.clientX, e.clientY);
  tapStart = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
function zoomBy(f) { if (view.mode === 'overview') view.zoom *= f; else view.d *= f; clampView(); }
function pick(cx, cy) {
  ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (view.mode === 'rack') {
    const rack = racks[view.key], h = raycaster.intersectObject(rack.plane, false)[0]; if (!h) return null;
    const l = rack.group.worldToLocal(tmpV.copy(h.point));
    // Colonne et rangée touchées (tailles éventuellement inégales), mesurées depuis l'entrée et depuis le bas
    const fromEntry = rack.flip ? rack.W / 2 - l.x : l.x + rack.W / 2, { colX, rowY } = rack.grid;
    const c = clamp(lastAtMost(colX, fromEntry), 0, rack.cols - 1), r = clamp(lastAtMost(rowY, l.y - BASE), 0, rack.rows - 1);
    const hit = { type: 'slot', key: rack.key, c, r };
    if (rack.isCases) {   // la bouteille la plus proche du doigt dans cette case, s'il y en a une sous le doigt
      let best = null, bd = BOTTLE_D / 2;
      for (const b of pileOf(allBottles(), slotId(rack.key, c, r))) {
        const p = bottleLocal(b); if (!p) continue;
        const d = Math.hypot(p[0] - l.x, p[1] - l.y); if (d <= bd) { bd = d; best = b.id; }
      }
      if (best) hit.id = best;
    }
    return hit;
  }
  const targets = []; for (const k of RACK_ORDER) { const r = racks[k]; targets.push(r.plane); if (r.body) targets.push(r.body); }
  const labelHit = raycaster.intersectObjects(RACK_ORDER.map((k) => racks[k].label), false)[0];
  const h = labelHit || raycaster.intersectObjects(targets, false)[0]; if (!h) return null;
  if (h.object.userData.rack) return { type: 'rack', key: h.object.userData.rack };
  return null;
}

// ---------- État de l'interface ----------
let selected = null;   // { key, c, r, id }
let lastSlot = null;   // dernier emplacement touché, pour pré-remplir les outils « Gérer » d'un casier
let mode = null;       // { type: 'copy' | 'move', source: fiche }
let draftPhoto = null;

// Demande de confirmation affichée dans l'application (les fenêtres du navigateur sont parfois bloquées)
function ask(message, okLabel = 'Continuer', cancelLabel = 'Annuler') {
  return new Promise((res) => {
    $('dialogText').textContent = message; $('dialogOk').textContent = okLabel; $('dialogCancel').textContent = cancelLabel; $('dialog').hidden = false;
    const done = (v) => { $('dialog').hidden = true; $('dialogOk').onclick = $('dialogCancel').onclick = null; res(v); };
    $('dialogOk').onclick = () => done(true); $('dialogCancel').onclick = () => done(false);
  });
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2000); }

async function onTap(cx, cy) {
  const hit = pick(cx, cy);
  if (!hit) { if (!mode && !$('sheet').hidden) closeSheet(); return; }
  if (hit.type === 'rack') { closeSheet(); showRack(hit.key); return; }
  await tapSlot(hit);
}
/** Touche sur un emplacement : en mode « copie/déplacement », range la fiche ici ; sinon ouvre l'emplacement. */
let slotBusy = false;   // évite qu'un double toucher rapide range la même bouteille à deux endroits
async function tapSlot(hit) {
  const id = slotId(hit.key, hit.c, hit.r), inCases = racks[hit.key]?.isCases;
  if (!mode) return inCases ? (hit.id ? selectBottle(hit.id) : showCase(id)) : selectSlot(hit.key, hit.c, hit.r);
  if (slotBusy) return;
  slotBusy = true;
  try {
    // On repart de la fiche actuelle : elle a pu être modifiée ou retirée depuis le début du mode.
    const src = bottleAt(mode.source.id);
    if (!src) { endMode(); return toast('Cette bouteille n\'est plus dans la cave'); }
    // Libère l'ancienne place d'un déplacement (dans une case : celles du dessus descendent)
    const freeSource = () => (parseId(src.id).u ? removeBottles([src.id], '', { undo: false }) : deleteRecord(src.id));
    if (inCases) {   // case maçonnée : la bouteille va en haut de la pile
      if (mode.type === 'move' && caseIdOf(src.id) === id) return toast('Cette bouteille est déjà dans cette case');
      const n = mode.type === 'copy' ? qty(mode.source) : qty(src);
      const added = await addToCase(id, src, n); if (!added) return;   // nouvelle place enregistrée AVANT de libérer l'ancienne
      if (mode.type === 'move') {
        if (!await freeSource()) {
          const undone = await persistBatch([], added.map((b) => b.id));
          return toast(undone ? 'Déplacement impossible : rien n\'a changé' : 'Déplacement incomplet : la bouteille est maintenant aux deux places, retirez-en une');
        }
        endMode(); refresh(); selectBottle(added[0].id); saved('Bouteille déplacée');
      } else { mode.added += n; updateBanner(); refresh(); saved(n > 1 ? `${n} bouteilles ajoutées dans cette case` : 'Enregistrée ici aussi'); }
      return;
    }
    if (bottleAt(id)) return toast('Il y a déjà une bouteille enregistrée ici');
    const copy = { ...src, quantite: mode.type === 'copy' ? qty(mode.source) : src.quantite, id, ajout: Date.now() };
    delete copy.demo; delete copy.pile;                     // une fiche rangée par l'utilisateur n'est plus une bouteille d'exemple
    if (!await saveRecord(copy)) return;                    // on enregistre la nouvelle place AVANT de libérer l'ancienne
    if (mode.type === 'move') {
      if (!await freeSource()) {                            // l'ancienne place n'a pas pu être libérée : retour arrière
        const undone = await deleteRecord(id);
        return toast(undone ? 'Déplacement impossible : rien n\'a changé' : 'Déplacement incomplet : la bouteille est maintenant aux deux places, retirez-en une');
      }
      endMode(); refresh(); selectSlot(hit.key, hit.c, hit.r); saved('Bouteille déplacée');
    } else { mode.added++; updateBanner(); refresh(); saved('Enregistrée ici aussi'); }
  } finally { slotBusy = false; }
}
function refresh() { rebuildBottles(); if ($('search').value.trim()) runSearch(false); }

function selectSlot(key, c, r) {
  if (!inRack(key, c, r)) return toast('Cet emplacement n\'existe plus avec les dimensions actuelles');
  if (racks[key].isCases) return showCase(slotId(key, c, r));   // une case maçonnée s'ouvre sur son contenu
  hideHero();
  const id = slotId(key, c, r); selected = { key, c, r, id }; lastSlot = selected;
  focusSlot(key, c, r);
  slotWorld(key, c, r, selRing.position).addScaledVector(racks[key].normal, BOTTLE_OUT + 0.005);
  selRing.quaternion.copy(racks[key].group.quaternion); selRing.scale.setScalar(racks[key].ringS); selRing.visible = true;
  const b = bottleAt(id);
  presentBottle(b, key, c, r);
  if (b) showCard(b); else showUnknown(id);
}
/** Bouteille d'une case maçonnée : anneau autour d'elle, elle sort de la pile, sa fiche s'ouvre. */
function selectBottle(id) {
  const b = bottleAt(id); if (!b) return;
  const { k, c, r } = parseId(id), pos = racks[k]?.isCases ? bottleLocal(b) : null;
  hideHero();
  selected = { key: k, c, r, id, caseId: caseIdOf(id) }; lastSlot = selected;
  if (pos) {
    focusCase(k, c, r);
    racks[k].group.localToWorld(selRing.position.set(pos[0], pos[1], 0)).addScaledVector(racks[k].normal, BOTTLE_OUT + 0.005);
    selRing.quaternion.copy(racks[k].group.quaternion); selRing.scale.setScalar(BOTTLE_D / 0.18); selRing.visible = true;
    presentBottle(b, k, c, r);
  } else {
    // Bouteille non dessinée (case trop pleine, dimensions réduites, rangement changé) : sa fiche reste accessible
    selRing.visible = false;
    if (racks[k] && (view.mode !== 'rack' || view.key !== k)) showRack(k);
  }
  showCard(b);
}
/**
 * Fiche « Case » : contenu de la case groupé par vin, places libres, « Ajouter des bouteilles », « Vider cette case ».
 * @param {string[]|null} hl bouteilles à allumer (ligne de liste ou de recherche touchée)
 */
function showCase(caseId, hl = null) {
  const { k, c, r } = parseId(caseId);
  if (!inRack(k, c, r)) return toast('Cet emplacement n\'existe plus avec les dimensions actuelles');
  hideHero(); selRing.visible = false;
  selected = { key: k, c, r, id: caseId, caseId }; lastSlot = selected;
  if (view.mode !== 'rack' || view.key !== k) showRack(k);
  if (hl) { highlighted = hl; rebuildRings(); }
  const pile = pileOf(allBottles(), caseId), cap = capacityOf(caseId), groups = new Map();
  for (const b of pile) { const g = `${norm(b.nom)}|${b.millesime || ''}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(b); }
  const lost = bottleAt(caseId);   // ancienne fiche restée « à ranger » faute de place
  openSheet(`${RACK_NAMES[k]} · colonne ${c + 1} · rangée ${r + 1}`, `
    <div class="list">${[...groups.values()].map((g) => `<button class="row" data-hl="${g.map((b) => b.id).join(',')}"><span class="dot" style="background:${typeOf(g[0]).css}"></span>
      <span class="main"><div class="n">${esc(g[0].nom || 'Sans nom')}</div><div class="s">${esc(g[0].appellation || '')}</div></span>
      <span class="y">${esc(g[0].millesime || '')} <small>×${g.length}</small></span></button>`).join('') || '<div class="empty">Cette case est vide.</div>'}</div>
    ${lost ? `<p class="help"><b>À ranger :</b> ${qty(lost)} × ${esc(lost.nom || 'Sans nom')}${lost.millesime ? ' ' + esc(lost.millesime) : ''} (il n'y avait plus de place dans cette case).</p>
      <div class="btns"><button class="btn" data-act="lost-place">Les ranger dans cette case</button><button class="btn danger" data-act="lost-remove">Les retirer</button></div>` : ''}
    ${pile.length > cap ? `<p class="help"><b>${pile.length - cap} bouteille${pile.length - cap > 1 ? 's' : ''} de trop</b> pour cette case : ${pile.length - cap > 1 ? 'elles ne sont pas dessinées' : 'elle n\'est pas dessinée'}. Déplacez-en ou agrandissez la case.</p>
      <div class="btns"><button class="btn" data-act="over-show">Voir la bouteille en trop</button></div>` : ''}
    <p class="help">${pile.length} bouteille${pile.length > 1 ? 's' : ''} · ${Math.max(0, cap - pile.length)} place${cap - pile.length > 1 ? 's' : ''} libre${cap - pile.length > 1 ? 's' : ''}.${pile.length ? ' Touchez une bouteille dans la case pour voir sa fiche, ou une ligne pour la repérer.' : ''}</p>
    <div class="btns"><button class="btn primary block" data-act="add">Ajouter des bouteilles</button>
      ${pile.length ? '<button class="btn danger block" data-act="clear-case">Vider cette case</button>' : ''}</div>`);
  // La case en grand, au-dessus de la fiche. On part de la hauteur de la fiche (pas de sa position : elle est en
  // train de monter, animée) ; une longue liste défile, la case garde au moins 40 % de l'écran.
  focusCase(k, c, r, Math.max(window.innerHeight * 0.4, window.innerHeight - $('sheet').offsetHeight));
}
/** Ouvre ce qu'une ligne de liste désigne : la bouteille, la case (avec ces bouteilles allumées) ou l'emplacement. */
function goTo(id, ids = '') {
  const { k, c, r, u } = parseId(id), list = ids ? ids.split(',') : [id];
  // Seules les bouteilles de la ligne choisie restent entourées : sinon une recherche large (« Chat ») laissait
  // allumés tous les « Château… » alors qu'on venait d'en choisir un.
  highlighted = list; picked = true; rebuildRings();
  // Une bouteille seule, ou une bouteille de case dans un casier qui n'est plus en cases maçonnées : sa fiche
  if (u && (list.length === 1 || !racks[k]?.isCases)) return selectBottle(id);
  if (racks[k]?.isCases) return showCase(caseIdOf(id), list);
  selectSlot(k, c, r);
}

// ---------- Fiche (panneau du bas) ----------
let scanToken = 0;   // invalide une lecture (photo ou voix) arrivée après que le formulaire a été quitté ou redessiné

function openSheet(title, html, tall = false) {
  stopVoice(false);   // une autre fiche (ou la même redessinée) : on n'écoute plus
  $('sheetTitle').textContent = title; $('sheetBody').innerHTML = html;
  $('sheet').classList.toggle('tall', tall); $('sheet').hidden = false; $('sheetBody').scrollTop = 0;
  $('results').hidden = true;
}
function closeSheet() {
  scanToken++; stopVoice(false);
  const had = selected; $('sheet').hidden = true; $('sheetBody').innerHTML = ''; hideHero(); selRing.visible = false; selected = null;
  // Bouteilles allumées depuis une fiche ou une liste : on les éteint en la fermant (sauf recherche en cours,
  // où la bouteille choisie reste entourée pour qu'on la retrouve)
  if (had && !$('search').value.trim() && highlighted.length) { highlighted = []; rebuildRings(); }
  if (had && view.mode === 'rack') {
    // Retour au cadrage du casier (après le zoom sur une case), en restant à hauteur de la case qu'on vient de quitter
    const rack = racks[view.key];
    if (rack.isCases) { view.d = Math.min(dFor(Math.min(rack.W, viewW(rack))), dMax(rack)); view.u = caseLocal(rack, had.c, had.r)[0]; }
    view.v = restV(rack); clampView();
  }
}
$('sheetClose').onclick = closeSheet;

function showUnknown(id) {
  openSheet('Bouteille non enregistrée', `<div class="loc">${locText(id)}</div>
    <p class="help">Cet emplacement n'a pas encore de fiche : la bouteille n'a donc pas d'étiquette et n'apparaît pas dans le casier.</p>
    <div class="btns"><button class="btn primary block" data-act="add">Enregistrer cette bouteille</button></div>`);
}
function showCard(b) {
  const t = typeOf(b), q = qty(b), f = [];
  const add = (k, v) => v && f.push(`<dt>${k}</dt><dd>${esc(v)}</dd>`);
  add('Couleur', t.nom); add('Millésime', b.millesime); add('Appellation', b.appellation); add('Région', b.region);
  add('Cépage', b.cepage); add('À boire', b.apogee); add('Prix', b.prix && `${b.prix} €`); add('Note', b.note && `${b.note} / 20`);
  add('Quantité', q > 1 ? `${q} bouteilles dans cette ${styleOf(parseId(b.id).k).lieu}` : '');
  const undrawn = parseId(b.id).u && !bottleLocal(b);
  openSheet(`${b.nom || 'Sans nom'}${b.millesime ? ' · ' + b.millesime : ''}`, `
    <div class="loc">${locText(b.id)}</div>
    ${undrawn ? '<p class="help">Cette bouteille n\'est pas dessinée dans la maquette : sa case n\'a plus assez de places (ou le rangement a changé). Vous pouvez la déplacer ou la retirer.</p>' : ''}
    ${b.photo ? `<img class="photo" src="${esc(b.photo)}" alt="Étiquette">` : ''}
    <dl class="facts">${f.join('')}</dl>
    ${b.commentaire ? `<p class="note">${esc(b.commentaire)}</p>` : ''}
    <div class="btns">
      <button class="btn primary block" data-act="edit">Modifier la fiche</button>
      <button class="btn" data-act="copy">J'ai la même ailleurs</button>
      <button class="btn" data-act="move">Déplacer</button>
      <button class="btn danger block" data-act="drink">${q > 1 ? `J'ai bu une bouteille (il en restera ${q - 1})` : 'Bouteille bue : la retirer'}</button>
      ${q > 1 ? `<button class="btn danger block" data-act="remove">Vider cette ${styleOf(parseId(b.id).k).lieu} (${q} bouteilles)</button>` : ''}
    </div>`);
}

/**
 * Formulaire de fiche. `draft` permet de le réafficher (après une photo, par exemple)
 * sans perdre ce qui a déjà été saisi.
 */
function showForm(id, draft = null) {
  scanToken++;
  const { k: fk, u: fu } = parseId(id), inCase = isCasesRack(fk), st = styleOf(fk);
  // Dans une case maçonnée, `id` est soit une bouteille (modification), soit la case (ajout de bouteilles, 1 par défaut)
  const existing = inCase && !fu ? null : bottleAt(id), b = draft ?? existing ?? { couleur: 'rouge', quantite: inCase ? 1 : st.defaut };
  draftPhoto = b.photo || null;
  const v = (k) => esc(b[k] ?? ''), hasKey = !!getApiKey();
  const known = allBottles().filter((x) => x.id !== id);
  // Suggestions de saisie : valeurs déjà utilisées dans les autres fiches
  const options = (field) => suggestions(known, field).slice(0, 200).map((x) => `<option value="${esc(x)}"></option>`).join('');
  openSheet(existing ? 'Modifier la fiche' : inCase ? 'Ajouter des bouteilles' : 'Nouvelle fiche', `
    <form id="form" data-id="${id}" autocomplete="off">
      <div class="loc">${locText(id)}</div>
      <div class="field">Remplir automatiquement
        <div class="autofill">
          <button type="button" class="btn" data-act="photo"><span class="ico" aria-hidden="true">📷</span>${draftPhoto ? 'Changer la photo' : 'Photo de l\'étiquette'}</button>
          ${hasKey ? `<button type="button" class="btn" data-act="voice" id="voiceBtn"><span class="ico" aria-hidden="true">🎤</span><span class="lbl">${b._voice ? 'Reparler' : 'Parler'}</span></button>` : ''}
        </div>
        ${hasKey ? '<p class="help">Ce que vous photographiez ou dites est envoyé à Google pour remplir la fiche.</p>' : ''}
        <div id="photoZone">${draftPhoto ? `<img class="photo" src="${esc(draftPhoto)}" alt="">` : ''}</div>
        ${draftPhoto ? `<div class="btns">${hasKey ? '<button type="button" class="btn" data-act="scan">Lire l\'étiquette</button>' : ''}<button type="button" class="btn danger" data-act="nophoto">Retirer la photo</button></div>` : ''}
        <div id="voiceZone"></div>
        <div id="scanStatus" class="scan" role="status" aria-live="polite">${hasKey ? '' : 'Astuce : activez « Lecture automatique » dans le menu pour remplir la fiche à partir d\'une photo ou de la voix.'}</div>
      </div>
      <label>Nom / Domaine / Château<input name="nom" list="dl-nom" value="${v('nom')}" placeholder="Château Margaux" required></label>
      <div class="field">Couleur
        <div class="chips" id="chips">${Object.entries(TYPES).map(([k, t]) =>
          `<button type="button" class="chip${(b.couleur || 'rouge') === k ? ' on' : ''}" data-couleur="${k}"><span class="dot" style="background:${t.css}"></span>${t.nom}</button>`).join('')}</div>
      </div>
      ${st.unique || (inCase && fu) ? '<input type="hidden" name="quantite" value="1">' /* une seule bouteille : place de casier métallique, ou bouteille d'une case */ : `<div class="field">${inCase ? 'Nombre de bouteilles à ajouter (en haut de la pile)' : `Nombre de bouteilles dans cette ${st.lieu}`}
        <div class="stepper">
          <button type="button" class="btn" data-step="-1" aria-label="Une bouteille de moins">−</button>
          <input name="quantite" value="${qty(b)}" inputmode="numeric" pattern="[0-9]*" maxlength="2" aria-label="Nombre de bouteilles">
          <button type="button" class="btn" data-step="1" aria-label="Une bouteille de plus">+</button>
        </div>
      </div>`}
      <div class="two">
        <label>Millésime<input name="millesime" value="${v('millesime')}" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="2015"></label>
        <label>À boire jusqu'en<input name="apogee" value="${v('apogee')}" placeholder="2030"></label>
      </div>
      <label>Appellation<input name="appellation" list="dl-appellation" value="${v('appellation')}" placeholder="Margaux"></label>
      <div class="two">
        <label>Région<input name="region" list="dl-region" value="${v('region')}" placeholder="Bordeaux"></label>
        <label>Cépage<input name="cepage" list="dl-cepage" value="${v('cepage')}" placeholder="Cabernet…"></label>
      </div>
      <div class="two">
        <label>Prix (€)<input name="prix" value="${v('prix')}" inputmode="decimal"></label>
        <label>Note (/20)<input name="note" value="${v('note')}" inputmode="decimal"></label>
      </div>
      <label>Commentaires<textarea name="commentaire" placeholder="Offerte par…, à ouvrir pour…">${v('commentaire')}</textarea></label>
      <datalist id="dl-nom">${options('nom')}</datalist><datalist id="dl-appellation">${options('appellation')}</datalist>
      <datalist id="dl-region">${options('region')}</datalist><datalist id="dl-cepage">${options('cepage')}</datalist>
      <div class="btns">
        <button type="button" class="btn" data-act="cancel">Annuler</button>
        <button type="submit" name="after" value="save" class="btn primary">Enregistrer</button>
        <button type="submit" name="after" value="more" class="btn block">Enregistrer, puis ranger la même ailleurs</button>
      </div>
    </form>`, true);
  if (b._touched) $('form').dataset.colorTouched = '1';
  // Après un nouvel affichage (photo prise, photo retirée) : champs tapés à la main, champs remplis par la voix, texte compris
  if (b._hand) $('form').dataset.hand = b._hand;
  if (b._auto) $('form').dataset.auto = b._auto;
  if (b._voice) showVoiceZone(b._voice);
}
/** Valeurs actuellement saisies dans le formulaire. */
function formDraft() {
  const f = $('form'); if (!f) return null;
  const d = Object.fromEntries(new FormData(f).entries());
  d.couleur = f.querySelector('.chip.on')?.dataset.couleur || 'rouge';
  d._touched = f.dataset.colorTouched === '1';   // l'utilisateur a-t-il choisi la couleur lui-même ?
  d._hand = f.dataset.hand || ''; d._auto = f.dataset.auto || ''; d._voice = $('voiceText')?.value || '';
  return d;
}
/** Réaffiche le formulaire en gardant les saisies et la position de défilement. */
function redrawForm(d) {
  const scroll = $('sheetBody').scrollTop;
  showForm($('form').dataset.id, { ...d, photo: draftPhoto });
  $('sheetBody').scrollTop = scroll;
}
const reselect = () => !selected ? closeSheet()
  : parseId(selected.id).u && bottleAt(selected.id) ? selectBottle(selected.id)
  : selected.caseId && racks[selected.key]?.isCases ? showCase(selected.caseId)
  : selected.caseId ? closeSheet()
  : selectSlot(selected.key, selected.c, selected.r);
const setChip = (couleur) => $('chips')?.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.couleur === couleur));

/**
 * Si le nom correspond à un vin déjà enregistré, reprend ce qui est propre au vin (appellation, région,
 * cépage, couleur) ; le prix et la date limite de garde ne sont repris que pour le même millésime.
 * Ne remplit que les champs vides.
 */
function prefillFromKnown(form) {
  const id = form.dataset.id, known = findKnownWine(allBottles().filter((x) => x.id !== id), form.elements.nom.value, form.elements.millesime.value);
  if (!known) return;
  const inherit = inheritableFields(known, form.elements.millesime.value);
  let n = 0;
  for (const k of ['appellation', 'region', 'cepage', 'apogee', 'prix']) {
    const el = form.elements[k]; if (inherit[k] && !el.value.trim()) { el.value = inherit[k]; n++; }
  }
  if (inherit.couleur && !form.dataset.colorTouched && !bottleAt(id)) { setChip(inherit.couleur); n++; }
  if (n) toast(`Infos reprises de « ${known.nom} »`);
}

// ---------- Lecture de l'étiquette par photo ----------
/** Range les champs lus sur l'étiquette dans le formulaire, sans écraser ce que l'utilisateur a déjà saisi. */
function applyScan(form, out) {
  let n = 0;
  for (const k of ['nom', 'millesime', 'appellation', 'region', 'cepage']) {
    const el = form.elements[k]; if (out[k] && !el.value.trim()) { el.value = out[k]; n++; }
  }
  if (out.couleur && !form.dataset.colorTouched && !bottleAt(form.dataset.id)) { setChip(out.couleur); n++; }
  return n;
}
/** Envoie la photo du formulaire à Gemini puis remplit les champs. Sans clé enregistrée, ne fait rien. */
async function runScan() {
  const form = $('form'), key = getApiKey();
  if (!form || !draftPhoto || !key) return;
  if (form.dataset.scanning) return;   // une lecture est déjà en cours pour ce formulaire
  form.dataset.scanning = '1';
  const scanBtn = form.querySelector('[data-act=scan]'); if (scanBtn) scanBtn.disabled = true;
  const token = ++scanToken, id = form.dataset.id, status = $('scanStatus');
  const say = (cls, text) => { status.className = 'scan ' + cls; status.textContent = text; };
  say('busy', 'Lecture de l\'étiquette…');
  try {
    const out = await scanLabel({ dataUrl: draftPhoto, apiKey: key });
    const f = $('form'); if (token !== scanToken || !f || f.dataset.id !== id) return;   // l'utilisateur est parti entre-temps
    const n = applyScan(f, out);
    if (!n) {
      const read = ['nom', 'millesime', 'appellation', 'region', 'cepage'].some((k) => out[k]);
      return read ? say('ok', 'Étiquette lue : vos saisies ont été conservées.') : say('err', 'Rien de lisible trouvé sur la photo : saisissez les informations à la main.');
    }
    prefillFromKnown(f);
    say('ok', 'Étiquette lue : vérifiez les champs avant d\'enregistrer.');
  } catch (e) {
    console.error(e);
    if (token === scanToken && $('form')) say('err', scanErrorMessage(e));
  } finally {
    delete form.dataset.scanning; if (scanBtn) scanBtn.disabled = false;
  }
}

// ---------- Saisie à la voix ----------
let voice = null;              // enregistrement en cours : { rec, stream, chunks, timer, started, token, send }
const VOICE_MAX_S = 60;        // au-delà, l'enregistrement s'arrête et part tout seul
// Boutons photo désactivés pendant l'écoute : une photo (ou sa lecture) redessinerait la fiche ou changerait le jeton,
// et l'enregistrement serait perdu
const PHOTO_ACTS = '[data-act=photo], [data-act=scan], [data-act=nophoto]';
const listOf = (s) => (s ? s.split(',').filter(Boolean) : []);
function markHand(form, name) { const h = listOf(form.dataset.hand); if (!h.includes(name)) { h.push(name); form.dataset.hand = h.join(','); } }

/** Zone « J'ai compris » : texte modifiable (secours : dictée du clavier ou saisie) et « Remplir la fiche ». */
function showVoiceZone(text, hint = '') {
  const zone = $('voiceZone'); if (!zone) return;
  zone.innerHTML = `${hint ? `<p class="help">${esc(hint)}</p>` : ''}
    <label class="field">J'ai compris :<textarea id="voiceText" rows="3" placeholder="Château Talbot 2016, Saint-Julien, j'en ai six…"></textarea></label>
    <div class="btns"><button type="button" class="btn primary" data-act="voice-text">Remplir la fiche</button></div>`;
  $('voiceText').value = text;   // posé comme valeur, jamais comme HTML
  const lbl = $('voiceBtn')?.querySelector('.lbl'); if (lbl && text) lbl.textContent = 'Reparler';
}
/** Libellé du bouton pendant l'enregistrement, et arrêt automatique au bout d'une minute. */
function tickVoice() {
  if (!voice) return;
  const s = Math.floor((Date.now() - voice.started) / 1000), btn = $('voiceBtn');
  if (s >= VOICE_MAX_S) { stopVoice(true); return; }
  $('form')?.querySelectorAll(PHOTO_ACTS).forEach((b) => { b.disabled = true; });
  if (btn) { btn.classList.add('rec'); btn.querySelector('.ico').textContent = '■'; btn.querySelector('.lbl').textContent = `J'ai fini (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`; }
}
/** Commence l'écoute. Sans micro (refusé, ou impossible sur cet appareil) : le champ texte prend le relais. */
async function startVoice() {
  const form = $('form'); if (!form || voice || form.dataset.scanning) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return showVoiceZone($('voiceText')?.value || '', 'Touchez le champ ci-dessous puis le micro du clavier pour dicter, ou écrivez.');
  }
  const token = scanToken, id = form.dataset.id;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) {
    return showVoiceZone($('voiceText')?.value || '', e?.name === 'NotAllowedError'
      ? 'Le micro n\'est pas autorisé : touchez « Autoriser » quand l\'iPhone le demande, ou dictez avec le micro du clavier ci-dessous.'
      : 'Micro indisponible : touchez le champ ci-dessous puis le micro du clavier pour dicter, ou écrivez.');
  }
  // Fiche quittée pendant la demande d'autorisation : on libère le micro tout de suite
  if (token !== scanToken || $('form')?.dataset.id !== id || voice) { stream.getTracks().forEach((t) => t.stop()); return; }
  const type = ['audio/mp4', 'audio/webm', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t));
  let rec;
  try { rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined); } catch (e) {
    console.error(e); stream.getTracks().forEach((t) => t.stop());
    return showVoiceZone($('voiceText')?.value || '', 'Enregistrement impossible : touchez le champ ci-dessous puis le micro du clavier pour dicter.');
  }
  const v = { rec, stream, chunks: [], started: Date.now(), token, send: false };
  rec.ondataavailable = (e) => { if (e.data?.size) v.chunks.push(e.data); };
  rec.onstop = () => {
    v.stream.getTracks().forEach((t) => t.stop());
    if (voice === v) {   // arrêté par l'iPhone lui-même (appel, écran verrouillé) : on remet le bouton et on propose d'écrire
      voice = null; clearInterval(v.timer); resetVoiceBtn();
      if (v.token === scanToken && $('form')) voiceError('L\'enregistrement a été interrompu : touchez « Parler » pour recommencer, ou écrivez ci-dessous.');
      return;
    }
    if (!v.send) return;
    const blob = new Blob(v.chunks, { type: rec.mimeType || type || 'audio/mp4' });
    if (!blob.size) { if (v.token === scanToken && $('form')) voiceError(scanErrorMessage({ kind: 'empty' })); return; }
    const fr = new FileReader();
    fr.onerror = () => { if (v.token === scanToken && $('form')) voiceError('L\'enregistrement n\'a pas pu être lu : réessayez, ou écrivez ci-dessous.'); };
    fr.onload = () => {
      const m = /^data:([^;,]+)[^,]*;base64,(.*)$/.exec(String(fr.result));
      if (m && v.token === scanToken) runVoice({ audio: { mimeType: m[1], data: m[2] } });
    };
    fr.readAsDataURL(blob);
  };
  voice = v; rec.start(); v.timer = setInterval(tickVoice, 1000); tickVoice();
  const st = $('scanStatus'); if (st) { st.className = 'scan busy'; st.textContent = 'Je vous écoute… touchez « J\'ai fini » quand c\'est dit.'; }
}
/** Arrête l'écoute ; `send` : envoyer ce qui a été dit (sinon on jette, et le micro est libéré). */
function stopVoice(send) {
  if (!voice) return;
  const v = voice; voice = null; clearInterval(v.timer); v.send = send;
  try { if (v.rec.state !== 'inactive') v.rec.stop(); else v.stream.getTracks().forEach((t) => t.stop()); } catch { v.stream.getTracks().forEach((t) => t.stop()); }
  if (!send) v.stream.getTracks().forEach((t) => t.stop());
  resetVoiceBtn();
  const st = $('scanStatus'); if (send && st) { st.className = 'scan busy'; st.textContent = 'Envoi de ce que vous avez dit…'; }
}
function resetVoiceBtn() {
  $('form')?.querySelectorAll(PHOTO_ACTS).forEach((b) => { b.disabled = false; });
  const btn = $('voiceBtn');
  if (btn) { btn.classList.remove('rec'); btn.querySelector('.ico').textContent = '🎤'; btn.querySelector('.lbl').textContent = $('voiceText')?.value ? 'Reparler' : 'Parler'; }
}
/** Message d'erreur de la voix, avec le champ texte pour écrire ou dicter à la place. */
function voiceError(msg) {
  const st = $('scanStatus'); if (st) { st.className = 'scan err'; st.textContent = msg; }
  if (!$('voiceText')) showVoiceZone('');
}
/**
 * Fait comprendre ce qui a été dit (audio) ou écrit (texte) puis remplit la fiche. Le texte affiché fait foi : en texte,
 * il est renvoyé tel quel ; en audio, la nouvelle phrase s'ajoute à ce qui avait déjà été compris (« Reparler »).
 */
async function runVoice({ audio, text }) {
  const form = $('form'), key = getApiKey();
  if (!form || !key) return;
  if (form.dataset.scanning) {   // une lecture (photo ou voix) est en cours : on attend qu'elle finisse, sans perdre ce qui a été dit
    for (let i = 0; i < 120 && $('form') === form && form.dataset.scanning; i++) await new Promise((r) => setTimeout(r, 250));
    if ($('form') !== form || form.dataset.scanning) return;   // fiche quittée, ou lecture toujours bloquée après 30 s
  }
  const before = audio ? ($('voiceText')?.value || '').trim() : '';
  if (!audio && !String(text).trim()) { showVoiceZone('', 'Écrivez ou dictez quelques mots sur la bouteille, puis touchez « Remplir la fiche ».'); return; }
  form.dataset.scanning = '1';
  const btns = form.querySelectorAll('[data-act=voice], [data-act=voice-text], [data-act=scan]'); btns.forEach((b) => { b.disabled = true; });
  const token = ++scanToken, id = form.dataset.id, status = $('scanStatus');
  const say = (cls, msg) => { status.className = 'scan ' + cls; status.textContent = msg; };
  say('busy', 'Je remplis la fiche…');
  try {
    const out = await readVoice({ audio, text, before, apiKey: key, year: new Date().getFullYear() });
    const f = $('form'); if (token !== scanToken || !f || f.dataset.id !== id) return;   // l'utilisateur est parti entre-temps
    showVoiceZone(audio ? [before, out.transcription].filter(Boolean).join(' ') : String(text));
    const fields = [...f.elements].filter((el) => el.name && el.type !== 'hidden' && el.type !== 'submit').map((el) => el.name).concat('couleur');
    const { set, auto } = mergeVoice(out, { hand: listOf(f.dataset.hand), auto: listOf(f.dataset.auto), fields });
    for (const [k, val] of Object.entries(set)) {
      if (k === 'couleur') { setChip(val); continue; }
      const el = f.elements[k]; if (!el) continue;
      el.value = val; el.classList.add('filled'); setTimeout(() => el.classList.remove('filled'), 1500);
    }
    f.dataset.auto = auto.join(',');
    prefillFromKnown(f);
    say('ok', auto.length ? 'Fiche remplie : vérifiez les champs avant d\'enregistrer.' : 'Compris, mais rien de nouveau à mettre dans la fiche.');
  } catch (e) {
    console.error(e);
    if (token === scanToken && $('form')) {
      say('err', scanErrorMessage(e, 'voix'));
      if (!$('voiceText')) showVoiceZone(text || '', 'Vous pouvez aussi dicter avec le micro du clavier ou écrire ci-dessous.');
    }
  } finally {
    // Pendant une écoute (texte envoyé en parallèle), les boutons photo restent désactivés : voir PHOTO_ACTS
    delete form.dataset.scanning; btns.forEach((b) => { if (!(voice && b.matches(PHOTO_ACTS))) b.disabled = false; });
  }
}

/** Réglages de la lecture automatique (photo et voix) : clé Google, test, désactivation. */
function showScanSettings(msg = '') {
  const has = !!getApiKey();
  openSheet('Lecture automatique (photo et voix)', `
    <p class="help">Quand vous photographiez une étiquette, ou quand vous décrivez la bouteille à voix haute (« 🎤 Parler »), l'application peut remplir la fiche toute seule : nom, millésime, appellation, nombre de bouteilles… Vous vérifiez, puis vous enregistrez. Elle utilise pour cela l'IA gratuite de Google (Gemini).</p>
    <p class="scan ${has ? 'ok' : ''}" role="status">${esc(msg || (has ? 'Lecture automatique activée.' : 'Lecture automatique non activée.'))}</p>
    <h3>Activer en 3 étapes</h3>
    <p class="help">1. Ouvrez <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> et connectez-vous avec un compte Google.<br>2. Touchez « Create API key » (gratuit, sans carte bancaire).<br>3. Copiez la clé et collez-la ci-dessous.</p>
    <label class="field">Clé Google AI Studio<input id="scanKey" type="text" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="${has ? 'Une clé est déjà enregistrée' : 'AIza…'}"></label>
    <div class="btns"><button class="btn primary block" data-act="scan-save">Enregistrer la clé</button><button class="btn" data-act="scan-test">Tester</button>${has ? '<button class="btn danger" data-act="scan-clear">Désactiver</button>' : ''}</div>
    <p class="help"><b>À savoir :</b> la photo, ou ce que vous dites, est envoyé à Google pour être compris. Avec l'offre gratuite, Google peut réutiliser ces contenus pour améliorer ses produits : ne photographiez que des étiquettes, et ne dites que ce qui concerne la bouteille. La clé reste uniquement sur cet appareil et n'apparaît dans aucune sauvegarde.</p>
    <div class="btns"><button class="btn block" data-act="menu">Retour</button></div>`, true);
}
/** Teste la clé (saisie ou enregistrée) et affiche le résultat dans l'écran de réglages. */
async function checkScanKey(key, { keep }) {
  const status = $('sheetBody').querySelector('.scan');
  if (status) { status.className = 'scan busy'; status.textContent = 'Test de la clé en cours…'; }
  $('sheetBody').querySelectorAll('[data-act^="scan-"]').forEach((b) => { b.disabled = true; });   // évite les appels multipliés
  try { await testApiKey(key); showScanSettings('Clé acceptée par Google : la lecture automatique fonctionne.'); }
  catch (e) {
    if (e.kind === 'key' && keep) clearApiKey();   // une clé refusée n'est pas conservée
    showScanSettings(e.kind === 'format' ? 'Réponse inattendue de Google : réessayez plus tard.' : scanErrorMessage(e));
  }
}

// ---------- Actions de la fiche ----------
$('sheetBody').addEventListener('click', async (e) => {
  const styleChip = e.target.closest('[data-style]');
  if (styleChip) { pickStyle(styleChip); return; }
  const tstep = e.target.closest('[data-tstep]');
  if (tstep) { stepTool(tstep); return; }
  const chip = e.target.closest('[data-couleur]');
  if (chip) { setChip(chip.dataset.couleur); $('form').dataset.colorTouched = '1'; markHand($('form'), 'couleur'); return; }
  const step = e.target.closest('[data-step]');
  if (step) { const el = $('form').elements.quantite; el.value = clamp(qty({ quantite: el.value }) + (+step.dataset.step), 1, 99); markHand($('form'), 'quantite'); return; }
  const row = e.target.closest('[data-goto]');
  if (row) { goTo(row.dataset.goto, row.dataset.ids); return; }
  const hl = e.target.closest('[data-hl]');   // fiche Case : allumer les bouteilles d'un vin
  if (hl) { highlighted = hl.dataset.hl.split(','); rebuildRings(); return; }
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
  const id = selected?.id, b = id && bottleAt(id);
  if (['add', 'edit', 'remove', 'drink', 'copy', 'move'].includes(act) && (!id || (act !== 'add' && !b))) return closeSheet();
  if (act === 'add' || act === 'edit') showForm(id);
  else if (act === 'cancel') reselect();
  else if (act === 'photo') $('photoInput').click();
  else if (act === 'nophoto') { const d = formDraft(); draftPhoto = null; redrawForm(d); }
  else if (act === 'scan') runScan();
  else if (act === 'voice') { if (voice) stopVoice(true); else startVoice(); }
  else if (act === 'voice-text') runVoice({ text: $('voiceText')?.value || '' });
  else if ((act === 'drink' || act === 'remove') && parseId(id).u) {   // bouteille de case : celles du dessus descendent
    if (!await ask(`Retirer « ${b.nom} » de la cave ? Sa fiche sera supprimée, et les bouteilles posées dessus descendront d'une place.`, 'Retirer')) return;
    if (await removeBottles([id], 'Bouteille retirée')) { if (racks[parseId(id).k]?.isCases) showCase(caseIdOf(id)); else closeSheet(); }
  }
  else if (act === 'clear-case') {   // toute la case, y compris une ancienne fiche « à ranger »
    const caseId = selected?.caseId, pile = caseId ? pileOf(allBottles(), caseId) : [], lost = caseId && bottleAt(caseId);
    const n = pile.length + (lost ? qty(lost) : 0); if (!n) return;
    if (!await ask(`Vider cette case ? ${n} bouteille${n > 1 ? 's seront retirées' : ' sera retirée'} de la cave.`, 'Vider')) return;
    if (await removeBottles([...pile.map((b) => b.id).reverse(), ...(lost ? [lost.id] : [])], 'Case vidée')) showCase(caseId);
  }
  else if (act === 'lost-place') {   // ranger dans la pile les bouteilles d'une ancienne fiche, s'il y a de la place
    const caseId = selected?.caseId, lost = caseId && bottleAt(caseId); if (!lost) return;
    const { put, remove } = placeLost(allBottles(), lost, capacityOf(caseId));
    if (!put.length) return toast('Cette case est pleine : retirez ou déplacez d\'abord des bouteilles');
    // Une seule transaction : les nouvelles fiches et l'ancienne (réduite ou supprimée), jamais l'un sans l'autre
    if (!await persistBatch(put, remove)) return;
    const recs = put.filter((b) => b.id !== lost.id), q = qty(lost), n = recs.length;
    refresh(); showCase(caseId, recs.map((b) => b.id)); saved(n < q ? `${n} rangées, ${q - n} encore à ranger` : `${n} bouteille${n > 1 ? 's rangées' : ' rangée'}`);
    offerUndoAction(n > 1 ? 'Bouteilles rangées' : 'Bouteille rangée', async () => {
      const u = undoPlaceLost([...records.values()], lost, { put, remove });   // null si quelque chose a changé depuis
      if (!u) return toast('Annulation impossible : ces bouteilles ont été modifiées depuis');
      if (!await persistBatch(u.put, u.remove)) return;
      refresh(); if (selected?.caseId === caseId) showCase(caseId); saved('Annulé : bouteilles remises « à ranger »');
    });
  }
  else if (act === 'lost-remove') {
    const caseId = selected?.caseId, lost = caseId && bottleAt(caseId); if (!lost) return;
    if (!await ask(qty(lost) > 1 ? `Retirer ces ${qty(lost)} bouteilles « ${lost.nom || 'Sans nom'} » de la cave ?` : `Retirer la bouteille « ${lost.nom || 'Sans nom'} » de la cave ?`, 'Retirer')) return;
    if (!await deleteRecord(lost.id)) return;
    refresh(); showCase(caseId); offerUndo('Bouteilles retirées', [lost]);
  }
  else if (act === 'over-show') {   // la bouteille du haut, qui n'a plus de place dans la case
    const pile = selected?.caseId ? pileOf(allBottles(), selected.caseId) : []; if (pile.length) selectBottle(pile[pile.length - 1].id);
  }
  else if (act === 'drink' && qty(b) > 1) { const after = { ...b, quantite: qty(b) - 1 }; if (await saveRecord(after)) { refresh(); reselect(); offerUndo('Une bouteille de moins', [b], [after]); } }
  else if (act === 'drink' || act === 'remove') {
    if (!await ask(`Retirer « ${b.nom} » de la cave ? Sa fiche sera supprimée.`)) return;
    if (!await deleteRecord(id)) return;
    refresh(); closeSheet(); offerUndo('Bouteille retirée', [b]);
  }
  else if (act === 'copy' || act === 'move') startMode(act, b);
  else if (act === 'inventory') showInventory();
  else if (act === 'config') showConfig();
  else if (act === 'export') exportData();
  else if (act === 'import') $('importInput').click();
  else if (act === 'snapshots') showCopies();
  else if (act === 'snap-restore') await restoreCopy(e.target.closest('[data-snap]')?.dataset.snap);
  else if (act === 'install') showInstall();
  else if (act === 'menu') showMenu();
  else if (act === 'config-focus') showConfig(e.target.closest('[data-rack]')?.dataset.rack);
  else if (act === 'adjust') startAdjust(e.target.closest('[data-rack]')?.dataset.rack);
  else if (act === 'rack-tools') { const k = e.target.closest('[data-rack]')?.dataset.rack; if (racks[k]) { showRack(k); showRackTools(k); } }
  else if (act === 'scan-settings') showScanSettings();
  else if (act === 'clear-col' || act === 'clear-row' || act === 'clear-rack') await clearPart(act);
  else if (act === 'soon') showSoon();
  else if (act === 'update-check') await checkForUpdate({ manual: true });
  else if (act === 'help') showWelcome();
  else if (act === 'welcome-ok') { try { localStorage.setItem('cave-bienvenue', '1'); } catch { /* sans stockage : réaffichée au prochain lancement */ } closeSheet(); }
  else if (act === 'inv-filter') showInventory(e.target.closest('[data-color]')?.dataset.color || '');
  else if (act === 'scan-save') {
    const key = cleanApiKey($('scanKey').value);
    if (!key) return toast('Collez la clé en entier (elle fait une quarantaine de caractères)');
    try { setApiKey(key); } catch { return toast('Impossible d\'enregistrer la clé sur cet appareil'); }
    await checkScanKey(key, { keep: true });
  }
  else if (act === 'scan-test') {
    const key = cleanApiKey($('scanKey').value) || getApiKey();
    if (!key) return toast('Collez d\'abord la clé');
    await checkScanKey(key, { keep: key === getApiKey() });
  }
  else if (act === 'scan-clear') { if (await ask('Désactiver la lecture automatique et effacer la clé de cet appareil ?', 'Désactiver')) { clearApiKey(); showScanSettings(); } }
  else if (act === 'demo' && DEV) {
    // Exemples par-dessus de vraies fiches : sans danger pour elles (places vides seulement), mais cela mélange
    // de fausses bouteilles aux vraies dans la cave : on demande confirmation.
    const real = realRecordCount([...records.values()]);
    if (real && !await ask(`Vous avez déjà ${real} vraie(s) fiche(s). Des bouteilles d'exemple vont se mélanger aux vôtres dans la cave.\n\nVos fiches ne sont pas modifiées : les exemples ne vont que dans les places vides, et « Retirer les bouteilles d'exemple » les enlève toutes.`, 'Ajouter quand même')) return;
    await seedDemo(); refresh(); showMenu(); toast('Bouteilles d\'exemple ajoutées');
  }
  else if (act === 'cleardemo') {
    const n = totalBottles([...records.values()].filter((b) => b.demo));
    if (!await ask(`Retirer les ${n} bouteille(s) d'exemple ? Vos vraies fiches ne sont pas touchées.`, 'Retirer')) return;
    const removed = await clearDemo(); refresh(); showMenu();
    if (removed.length) offerUndo('Exemples retirés', removed);
  }
});
// Quand on choisit (ou saisit) le nom d'un vin déjà connu, le reste de la fiche se pré-remplit.
$('sheetBody').addEventListener('change', (e) => {
  if (['nom', 'millesime'].includes(e.target.name) && e.target.form?.id === 'form') prefillFromKnown(e.target.form);
});
$('sheetBody').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id === 'form') {
    const id = e.target.dataset.id, old = bottleAt(id), more = e.submitter?.value === 'more';
    const d = Object.fromEntries(Object.entries(formDraft()).filter(([k]) => !k.startsWith('_')));   // pas l'état du formulaire
    for (const k in d) d[k] = String(d[k]).trim();
    if (!d.nom) return toast('Indiquez au moins le nom');
    if (isCasesRack(parseId(id).k)) { await submitCaseForm(id, d, more); return; }
    const rec = { ...old, ...d, quantite: qty(d), id, photo: draftPhoto, ajout: old?.ajout || Date.now() };
    delete rec.vide; delete rec.demo;   // une fiche modifiée par l'utilisateur n'est plus une bouteille d'exemple
    if (!await saveRecord(rec)) return;   // enregistré sur l'appareil avant de confirmer
    refresh(); const { k, c, r } = parseId(id); selectSlot(k, c, r); saved('Fiche enregistrée');
    if (more) startMode('copy', rec);
  } else if (e.target.id === 'configForm') {
    const d = Object.fromEntries(new FormData(e.target).entries()), racksIn = {};
    // On garde les séparations réglées à la main (normalizeConfig les ajuste au nouveau nombre de colonnes et rangées)
    for (const k of RACK_ORDER) racksIn[k] = { style: d[`${k}_style`], cols: d[`${k}_cols`], rows: d[`${k}_rows`], colW: rk[k].colW, rowH: rk[k].rowH };
    const next = normalizeConfig({ nom: (d.nom || '').trim(), rev: CONFIG_REV, racks: racksIn });   // rev : valeurs choisies à l'instant, aucune conversion
    if (!await confirmConfigChange(next)) return;
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)); } catch { return toast('Impossible d\'enregistrer le réglage sur cet appareil (stockage bloqué)'); }
    location.reload();
  }
});

/**
 * Formulaire dans une case maçonnée. Nouvelle saisie (`id` = la case) : N bouteilles en haut de la pile.
 * Modification d'une bouteille : elle seule, ou aussi ses jumelles de la même case si l'utilisateur le veut.
 */
async function submitCaseForm(id, d, more) {
  const wine = wineOf({ ...d, photo: draftPhoto });
  if (!parseId(id).u) {
    const n = qty(d), added = await addToCase(id, wine, n); if (!added) return;
    refresh(); showCase(id, added.map((b) => b.id)); saved(n > 1 ? `${n} bouteilles ajoutées` : 'Bouteille ajoutée');
    if (more) startMode('copy', added[0]);
    return;
  }
  const old = bottleAt(id); if (!old) return closeSheet();
  const rec = { ...old, ...wine, id, pile: old.pile }; delete rec.demo;   // modifiée par l'utilisateur : plus un exemple
  const changed = WINE_FIELDS.filter((f) => (rec[f] ?? '') !== (old[f] ?? ''));
  const twins = pileOf(allBottles(), caseIdOf(id)).filter((x) => x.id !== id && norm(x.nom) === norm(old.nom) && (x.millesime || '') === (old.millesime || ''));
  let others = [];
  if (changed.length && twins.length && await ask(`Appliquer aussi ces changements aux ${twins.length} autre${twins.length > 1 ? 's' : ''} bouteille${twins.length > 1 ? 's' : ''} identique${twins.length > 1 ? 's' : ''} (même vin, même millésime) de cette case ?`, 'Oui, à toutes', 'Non, celle-ci')) {
    others = twins.map((x) => { const y = { ...x }; for (const f of changed) y[f] = rec[f]; delete y.demo; return y; });
  }
  if (!await persistBatch([rec, ...others], [])) return;   // enregistré sur l'appareil avant de confirmer
  refresh(); selectBottle(id); saved(others.length ? `${others.length + 1} fiches enregistrées` : 'Fiche enregistrée');
  if (more) startMode('copy', rec);
}

// Photo de l'étiquette : réduite, stockée dans la fiche, puis lue automatiquement si la lecture est activée
$('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file || !$('form')) return;
  try {
    const d = formDraft();
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }));
    const s = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    draftPhoto = c.toDataURL('image/jpeg', 0.78);
    redrawForm(d);
  } catch { return toast('Impossible de lire cette photo'); }
  runScan();
});

// ---------- Modes « j'ai la même ailleurs » (copie) et « déplacer » ----------
/** Entre dans un mode où chaque touche sur un emplacement libre y range la fiche. */
function startMode(type, b) {
  if (!b) return;
  mode = { type, source: { ...b }, added: 0 };
  $('bannerQty').hidden = type !== 'copy';
  updateBanner(); $('banner').hidden = false; closeSheet();
}
function updateBanner() {
  if (!mode) return;
  const nom = mode.source.nom || 'cette bouteille';
  $('bannerText').textContent = mode.type === 'copy'
    ? `Touchez chaque emplacement où ranger aussi « ${nom} »${mode.added ? ` (${mode.added} ajouté${mode.added > 1 ? 's' : ''})` : ''}`
    : `Touchez le nouvel emplacement de « ${nom} »`;
  $('bannerQtyVal').textContent = qty(mode.source);
}
function endMode() { mode = null; $('banner').hidden = true; }
$('bannerDone').onclick = endMode;
// Nombre de bouteilles rangées à chaque emplacement touché (mode copie)
$('banner').addEventListener('click', (e) => {
  const s = e.target.closest('[data-bstep]'); if (!s || !mode) return;
  mode.source.quantite = clamp(qty(mode.source) + (+s.dataset.bstep), 1, 99); updateBanner();
});

// ---------- Recherche ----------
function haystack(b) { return norm([b.nom, b.millesime, b.appellation, b.region, b.cepage, typeOf(b).nom, b.commentaire].join(' ')); }
function sortBottles(a, b) { return norm(a.nom).localeCompare(norm(b.nom)) || String(a.millesime).localeCompare(String(b.millesime)) || a.id.localeCompare(b.id); }
/** Regroupe en une ligne (« × 6 ») les bouteilles identiques (même vin, même millésime) d'une même case maçonnée. */
function groupRows(list) {
  const out = [], seen = new Map();
  for (const b of list) {
    if (!parseId(b.id).u) { out.push({ b, ids: [b.id], n: qty(b) }); continue; }
    const key = `${caseIdOf(b.id)}|${norm(b.nom)}|${b.millesime || ''}`, g = seen.get(key);
    if (g) { g.ids.push(b.id); g.n++; } else { const ng = { b, ids: [b.id], n: 1 }; seen.set(key, ng); out.push(ng); }
  }
  return out;
}
/** Emplacement qui n'existe plus avec les dimensions actuelles (casier réduit) : la fiche est gardée, mais pas dessinée. */
function outOfLayout(id) { const { k, c, r } = parseId(id); return !inRack(k, c, r); }
function rowHtml({ b, ids, n }) {
  return `<button class="row" data-goto="${b.id}" data-ids="${ids.join(',')}"><span class="dot" style="background:${typeOf(b).css}"></span>
    <span class="main"><div class="n">${esc(b.nom || 'Sans nom')}</div><div class="s">${esc(b.appellation ? b.appellation + ' — ' : '')}${esc(locShort(b.id))}${b.aRanger ? ' · <b>à ranger</b>' : ''}${outOfLayout(b.id) ? ' · <b>hors du rangement actuel</b>' : ''}</div></span>
    <span class="y">${esc(b.millesime || '')}${n > 1 ? ` <small>×${n}</small>` : ''}</span></button>`;
}
function runSearch(show = true) {
  const q = norm($('search').value.trim()); $('searchClear').hidden = !q;
  if (!q) { highlighted = []; picked = false; rebuildRings(); $('results').hidden = true; return; }
  const words = q.split(/\s+/);
  const found = allBottles().filter((b) => { const h = haystack(b); return words.every((w) => h.includes(w)); }).sort(sortBottles);
  // Après le choix d'un résultat, refresh() (enregistrement, déplacement…) garde seulement ce vin entouré ;
  // retaper ou rouvrir la recherche (show) remontre tous les résultats.
  if (show) picked = false;
  // (une bouteille choisie puis bue ou déplacée perd son anneau : pas d'anneau orange sur une place vide)
  highlighted = picked ? highlighted.filter((id) => bottleAt(id)) : found.map((b) => b.id); rebuildRings();
  if (!show) return;
  const rows = groupRows(found);
  $('results').innerHTML = rows.length ? rows.slice(0, 80).map(rowHtml).join('') + (rows.length > 80 ? `<div class="empty">… et ${rows.length - 80} autres</div>` : '')
    : '<div class="empty">Aucune bouteille enregistrée ne correspond</div>';
  // La fiche est masquée (pas fermée) : on cesse d'écouter et on ignore une lecture en cours, sinon l'enregistrement
  // continuerait à l'insu de l'utilisateur et partirait seul au bout d'une minute
  if (!$('sheet').hidden) { stopVoice(false); scanToken++; }
  $('results').hidden = false; $('sheet').hidden = true; hideHero();
}
$('search').addEventListener('input', () => runSearch());
$('search').addEventListener('focus', () => { if ($('search').value.trim()) runSearch(); });
$('search').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('search').blur(); });
$('searchClear').onclick = () => { $('search').value = ''; runSearch(); };
$('results').addEventListener('click', (e) => {
  const row = e.target.closest('[data-goto]'); if (!row) return;
  $('search').blur(); $('results').hidden = true;
  goTo(row.dataset.goto, row.dataset.ids);
});

// ---------- Barre du bas : choisir la vue ----------
$('nav').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.view; if (!v) return;
  if (adjust) endAdjust(false);   // changer de vue abandonne le réglage en cours
  closeSheet(); $('results').hidden = true;
  if (v === 'overview') showOverview(); else showRack(v);
});

// ---------- Menu ----------
$('menuBtn').onclick = showMenu;
function showMenu() {
  closeSheet();
  const total = Object.values(racks).reduce((s, r) => s + r.cols * r.rows, 0);
  const shown = allBottles().filter((b) => { const p = parseId(b.id); return inRack(p.k, p.c, p.r); });
  const filled = new Set(shown.map((b) => caseIdOf(b.id))).size;   // une case maçonnée compte une fois, quel que soit le nombre de bouteilles
  openSheet(config.nom, `
    <div class="verline"><span>Version installée : <b>${esc(APP_VERSION)}</b></span><button class="btn" data-act="update-check">Mettre à jour</button></div>
    <div class="stats"><div class="stat"><b>${totalBottles(shown)}</b><span>bouteilles</span></div><div class="stat"><b>${filled}</b><span>emplacements occupés</span></div><div class="stat"><b>${total - filled}</b><span>emplacements vides</span></div></div>
    <div class="btns">
      <button class="btn block" data-act="inventory">Liste de mes bouteilles</button>
      <button class="btn block" data-act="soon">À boire bientôt</button>
      <button class="btn block" data-act="scan-settings">Lecture automatique (photo et voix)${getApiKey() ? ' (activée)' : ''}</button>
      <button class="btn block" data-act="config">Rangement de la cave</button>
      <button class="btn block" data-act="export">Sauvegarder mes données</button>
      <p class="help">${safetyLine()}</p>
      <button class="btn block" data-act="import">Restaurer une sauvegarde</button>
      ${copiesInfo.length ? '<button class="btn block" data-act="snapshots">Revenir en arrière (copies de sécurité)</button>' : ''}
      <button class="btn block" data-act="install">Installer sur l'iPhone</button>
      <button class="btn block" data-act="help">Mode d'emploi</button>
      ${[...records.values()].some((b) => b.demo) ? '<button class="btn danger block" data-act="cleardemo">Test : retirer les bouteilles d\'exemple</button>' : DEV ? '<button class="btn block" data-act="demo">Test : ajouter des bouteilles d\'exemple</button>' : ''}
    </div>`, true);
}
/** Liste de toutes les fiches ; toucher une couleur filtre la liste. */
function showInventory(filter = '') {
  const all = allBottles().sort(sortBottles), by = {};
  for (const b of all) by[b.couleur || 'rouge'] = (by[b.couleur || 'rouge'] || 0) + qty(b);
  const shown = filter ? all.filter((b) => (b.couleur || 'rouge') === filter) : all;
  openSheet(`Mes bouteilles (${totalBottles(shown)})`, `
    <div class="stats">${Object.entries(TYPES).filter(([k]) => by[k]).map(([k, t]) => `<button class="stat${filter === k ? ' on' : ''}" data-act="inv-filter" data-color="${filter === k ? '' : k}"><b>${by[k]}</b><span>${t.nom}</span></button>`).join('')}</div>
    ${filter ? `<p class="help">Filtre : ${TYPES[filter].nom}. Touchez-le à nouveau pour tout afficher.</p>` : ''}
    <div class="list">${shown.length ? groupRows(shown).map(rowHtml).join('') : '<div class="empty">Aucune bouteille enregistrée pour l\'instant. Ouvrez un casier et touchez une bouteille pour créer sa fiche.</div>'}</div>
    <div class="btns"><button class="btn block" data-act="menu">Retour</button></div>`, true);
}
/** Réglage du rangement : pour chaque casier, type de rangement, colonnes et rangées. */
function showConfig(focus = null) {
  const block = (k) => {
    const r = rk[k], lim = rackLimits(k, r.style);
    return `<fieldset class="rackcfg" data-rack="${k}"${focus === k ? ' id="cfgFocus"' : ''}><legend>${RACK_NAMES[k]}</legend>
      <div class="chips">${Object.entries(STYLES).map(([sk, st]) => `<button type="button" class="chip${sk === r.style ? ' on' : ''}" data-style="${sk}">${st.nom}</button>`).join('')}</div>
      <input type="hidden" name="${k}_style" value="${r.style}">
      <p class="help small" data-aide>${esc(STYLES[r.style].aide)}</p>
      <p class="size" data-size>${sizeText(r.style, r.cols, r.rows, k)}</p>
      <div class="two">
        <label><span data-lab="cols">Colonnes (max ${lim.cols})</span><input name="${k}_cols" value="${r.cols}" inputmode="numeric" pattern="[0-9]*"></label>
        <label><span data-lab="rows">Rangées (max ${lim.rows})</span><input name="${k}_rows" value="${r.rows}" inputmode="numeric" pattern="[0-9]*"></label>
      </div>
      <div class="btns"><button type="button" class="btn" data-act="rack-tools" data-rack="${k}">Gérer (vider…)</button>
        ${r.style === 'cases' ? `<button type="button" class="btn" data-act="adjust" data-rack="${k}">Ajuster les séparations</button>` : ''}</div></fieldset>`;
  };
  openSheet('Rangement de la cave', `
    <p class="help">Pour chaque casier, choisissez le type de rangement puis le nombre de <b>colonnes</b> (en longueur, depuis l'entrée) et de <b>rangées</b> (en hauteur). La maquette s'adapte. Chaque casier a sa propre taille : l'îlot peut être plus court ou plus long que les murs, et les deux murs peuvent être différents.</p>
    <form id="configForm">
      <label>Nom de la cave<input name="nom" value="${esc(config.nom)}" maxlength="40"></label>
      ${RACK_ORDER.map(block).join('')}
      <div class="btns"><button type="button" class="btn" data-act="menu">Annuler</button><button type="submit" class="btn primary">Appliquer</button></div>
    </form>`, true);
  $('cfgFocus')?.scrollIntoView({ block: 'start' });
}
/** « Longueur ≈ 3,6 m · hauteur ≈ 1,9 m » pour un casier. */
function sizeText(style, cols, rows, k = null) {
  // Cases maçonnées déjà réglées à la main : la taille tient compte des séparations déplacées
  const g = k && style === 'cases' && rk[k].style === 'cases' ? rackGrid({ ...rk[k], cols, rows }) : null;
  const { length, height } = g ? { length: g.W, height: g.H } : rackSize(style, cols, rows);
  return `Longueur ≈ ${meters(length)} · hauteur ≈ ${meters(height)}`;
}
/** Met à jour la taille affichée d'un casier pendant le réglage. */
function updateSize(box) {
  const k = box.dataset.rack, v = (f) => box.querySelector(`[name="${k}_${f}"]`).value, style = v('style'), lim = rackLimits(k, style);
  // Taille bornée aux maximums du type : c'est ce qui sera réellement appliqué.
  box.querySelector('[data-size]').textContent = sizeText(style, clamp(parseInt(v('cols')) || 0, 0, lim.cols), clamp(parseInt(v('rows')) || 0, 0, lim.rows), k);
}
$('sheetBody').addEventListener('input', (e) => { const box = e.target.closest('#configForm [data-rack]'); if (box) updateSize(box); });
// Fiche : un champ tapé à la main n'est plus jamais remplacé par la voix (les valeurs posées par le code ne déclenchent pas « input »)
$('sheetBody').addEventListener('input', (e) => { if (e.target.form?.id === 'form' && e.target.name) markHand(e.target.form, e.target.name); });
/** Choix d'un type de rangement dans les réglages : met à jour l'aide et les maximums affichés. */
function pickStyle(chip) {
  const box = chip.closest('[data-rack]'), k = box.dataset.rack, style = chip.dataset.style, lim = rackLimits(k, style);
  box.querySelectorAll('[data-style]').forEach((c) => c.classList.toggle('on', c === chip));
  box.querySelector(`[name="${k}_style"]`).value = style;
  box.querySelector('[data-aide]').textContent = STYLES[style].aide;
  box.querySelector('[data-lab="cols"]').textContent = `Colonnes (max ${lim.cols})`;
  box.querySelector('[data-lab="rows"]').textContent = `Rangées (max ${lim.rows})`;
  for (const [f, max] of [['cols', lim.cols], ['rows', lim.rows]]) {   // valeur trop grande pour ce type : ramenée au maximum, et on le dit
    const el = box.querySelector(`[name="${k}_${f}"]`);
    if ((parseInt(el.value) || 0) > max) { el.value = max; toast(`${f === 'cols' ? 'Colonnes' : 'Rangées'} ramenées à ${max} pour ce type de rangement`); }
  }
  updateSize(box);
}
/**
 * Avant d'appliquer un nouveau rangement : prévient clairement si des fiches risquent d'être mélangées
 * (type de rangement changé alors que le casier contient des fiches) ou masquées (dimensions réduites).
 */
async function confirmConfigChange(next) {
  const all = allBottles(), warnings = [];
  for (const k of RACK_ORDER) {
    const before = rk[k], after = next.racks[k], inRackNow = recordsIn(all, k);
    if (!inRackNow.length) continue;
    if (before.style !== after.style) {
      warnings.push(`• ${RACK_NAMES[k]} : passe de « ${STYLES[before.style].nom} » à « ${STYLES[after.style].nom} » alors qu'il contient ${inRackNow.length} fiche(s). Chaque fiche reste attachée à son numéro de colonne et de rangée : avec un autre rangement, ces numéros ne désignent plus les mêmes endroits, et les bouteilles risquent d'être mélangées.`);
    }
    const hidden = inRackNow.filter((b) => { const p = parseId(b.id); return p.c >= after.cols || p.r >= after.rows; }).length;
    if (hidden) warnings.push(`• ${RACK_NAMES[k]} : ${hidden} fiche(s) seront hors des nouvelles dimensions. Elles sont conservées mais invisibles tant que vous n'agrandissez pas.`);
  }
  if (!warnings.length) return true;
  return ask(`Attention, l'arrangement risque d'être mélangé :\n\n${warnings.join('\n\n')}\n\nConseil : notez ces bouteilles ou videz d'abord le casier (menu, « Rangement de la cave », bouton « Gérer » du casier).`, 'Appliquer quand même');
}

// ---------- Gérer un casier : vider une colonne, une rangée ou tout le casier ----------
/** Outils d'un casier. Colonne et rangée sont pré-remplies avec le dernier emplacement touché. */
function showRackTools(k) {
  if (!racks[k]) return;
  const rack = racks[k], st = styleOf(k), inIt = recordsIn(allBottles(), k);
  const last = lastSlot && lastSlot.key === k ? lastSlot : { c: 0, r: 0 };
  const stepper = (name, value, max, label) => `<div class="field">${label}
      <div class="stepper"><button type="button" class="btn" data-tstep="-1" data-for="${name}" aria-label="Moins">−</button>
      <input name="${name}" id="${name}" value="${value}" inputmode="numeric" pattern="[0-9]*" data-max="${max}" aria-label="${label}">
      <button type="button" class="btn" data-tstep="1" data-for="${name}" aria-label="Plus">+</button></div></div>`;
  openSheet(`Gérer : ${RACK_NAMES[k]}`, `
    <div class="loc">${esc(st.nom)} · ${rack.cols} colonnes × ${rack.rows} rangées · <b>${totalBottles(inIt)}</b> bouteille(s) dans <b>${inIt.length}</b> ${st.lieu}(s)</div>
    <h3>Vider une colonne</h3>
    ${stepper('toolCol', last.c + 1, rack.cols, 'Colonne (depuis l\'entrée)')}
    <div class="btns"><button class="btn danger block" data-act="clear-col">Vider cette colonne</button></div>
    <h3>Vider une rangée</h3>
    ${stepper('toolRow', last.r + 1, rack.rows, 'Rangée (depuis le bas)')}
    <div class="btns"><button class="btn danger block" data-act="clear-row">Vider cette rangée</button></div>
    <h3>Tout le casier</h3>
    <div class="btns"><button class="btn danger block" data-act="clear-rack">Vider tout le casier</button>
      <button class="btn block" data-act="config-focus" data-rack="${k}">Changer le type de rangement ou les dimensions</button></div>
    <p class="help">Vider retire les fiches (les bouteilles disparaissent de la maquette). Vous pourrez annuler juste après.</p>`, true);
  $('sheetBody').dataset.rack = k;
}
function stepTool(btn) {
  const el = $(btn.dataset.for);
  el.value = clamp((parseInt(el.value) || 1) + (+btn.dataset.tstep), 1, +el.dataset.max);
}
/** Vide une colonne, une rangée ou tout le casier, après confirmation, avec possibilité d'annuler. */
async function clearPart(act) {
  const k = $('sheetBody').dataset.rack, rack = racks[k]; if (!rack) return;
  const col = clamp((parseInt($('toolCol')?.value) || 1), 1, rack.cols) - 1, row = clamp((parseInt($('toolRow')?.value) || 1), 1, rack.rows) - 1;
  const what = act === 'clear-col' ? { col } : act === 'clear-row' ? { row } : {};
  const label = act === 'clear-col' ? `la colonne ${col + 1}` : act === 'clear-row' ? `la rangée ${row + 1}` : 'tout le casier';
  const list = recordsIn(allBottles(), k, what);
  if (!list.length) return toast(`Rien à vider dans ${label}`);
  if (!await ask(`Vider ${label} (${RACK_NAMES[k]}) ? ${list.length} fiche(s), ${totalBottles(list)} bouteille(s) seront retirées de la cave.`, 'Vider')) return;
  list.sort((a, b) => (b.pile ?? 0) - (a.pile ?? 0));   // cases maçonnées : « Annuler » rejoue du haut vers le bas
  const ids = list.map((b) => b.id);
  if (!await persist((st) => st.removeMany(ids))) return;
  for (const id of ids) records.delete(id);
  refresh(); showRackTools(k); offerUndo(`${totalBottles(list)} bouteille(s) retirée(s)`, list);
}

// ---------- Annuler la dernière suppression ----------
let undoTimer = null, undoState = null;   // { previous, after, count } : suppressions encore annulables
/**
 * Propose « Annuler » pendant 10 secondes après une suppression. Plusieurs suppressions rapprochées
 * s'additionnent : « Annuler » les remet toutes en place.
 * `previous` : fiches à remettre ; `after` : versions écrites par l'opération (une fiche modifiée depuis n'est pas écrasée).
 */
function offerUndo(message, previous, after = []) {
  undoState = undoState && !undoState.run ? { previous: [...undoState.previous, ...previous], after: [...undoState.after, ...after], count: undoState.count + 1 } : { previous, after, count: 1 };
  $('undoText').textContent = undoState.count > 1 ? `${message} (${undoState.count} actions annulables)` : message;
  $('undo').hidden = false; document.body.classList.add('undo-on');
  clearTimeout(undoTimer); undoTimer = setTimeout(hideUndo, 10000);
}
/**
 * « Annuler » qui exécute sa propre remise en état (quand il ne suffit pas de remettre d'anciennes fiches). Il remplace
 * une annulation encore proposée : les deux ne se cumulent pas.
 */
function offerUndoAction(message, run) {
  undoState = { run, previous: [], after: [], count: 1 };
  $('undoText').textContent = message;
  $('undo').hidden = false; document.body.classList.add('undo-on');
  clearTimeout(undoTimer); undoTimer = setTimeout(hideUndo, 10000);
}
function hideUndo() { clearTimeout(undoTimer); undoState = null; $('undo').hidden = true; document.body.classList.remove('undo-on'); }
$('undoBtn').onclick = async () => {
  const st = undoState; hideUndo(); if (!st) return;
  if (st.run) { try { await st.run(); } catch (e) { console.error(e); toast('Annulation impossible'); } return; }
  // Pour chaque emplacement, on remet la version la plus ancienne (avant la première suppression)
  const first = new Map(); for (const b of st.previous) if (!first.has(b.id)) first.set(b.id, b);
  // Bouteilles de cases : elles reprennent leur rang, et celles posées dessus entre-temps remontent (lib.js)
  const inPiles = [...first.values()].filter((b) => parseId(b.id).u && !records.has(b.id));
  const others = [...first.values()].filter((b) => !parseId(b.id).u);
  const ok = others.filter((b) => { const now = records.get(b.id); return !now || st.after.some((a) => a === now); });
  if (ok.length < others.length) toast('Certains emplacements ont été réutilisés entre-temps : ils sont gardés tels quels');
  const back = [...ok, ...undoRemoval(allBottles(), inPiles)];
  if (!back.length || !await persistBatch(back, [])) return;
  refresh(); if (selected) reselect(); saved('Annulé : bouteilles remises en place');
};

// ---------- Mises à jour de l'application ----------
/** Version publiée sur le site, lue sans aucun cache ; null sans réseau. */
async function latestVersion() {
  try {
    const res = await fetch(`version.js?v=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? (/APP_VERSION\s*=\s*'([^']+)'/.exec(await res.text())?.[1] || null) : null;
  } catch { return null; }
}
/**
 * Compare la version installée à celle du site. Au démarrage, affiche un bandeau si une nouvelle version existe ;
 * depuis le menu (`manual`), propose directement de mettre à jour.
 */
async function checkForUpdate({ manual = false } = {}) {
  if (manual) toast('Recherche d\'une mise à jour…');
  const latest = await latestVersion();
  if (!latest) { if (manual) toast('Pas de réseau : impossible de vérifier les mises à jour'); return; }
  if (!isNewerVersion(latest, APP_VERSION)) { if (manual) toast(`Vous avez la dernière version (${APP_VERSION})`); return; }
  if (manual) {
    if (await ask(`Une nouvelle version (${latest}) est disponible. La télécharger maintenant ? Vos bouteilles et réglages sont conservés.`, 'Mettre à jour')) forceUpdate(latest);
    return;
  }
  $('updateText').textContent = `Nouvelle version ${latest} disponible`;
  $('updateBar').hidden = false;
  $('updateBtn').onclick = () => forceUpdate(latest);
}
/**
 * Mise à jour forcée : retélécharge chaque fichier depuis le site (sans cache) ; seulement si TOUS sont arrivés,
 * efface les copies hors-ligne, désinscrit le service worker puis recharge. Sinon on ne touche à rien :
 * l'app reste utilisable hors-ligne. Les fiches (IndexedDB) et les réglages (localStorage) ne sont jamais touchés.
 * @param {string} expected version attendue après la mise à jour (pour confirmer qu'elle a bien pris)
 */
async function forceUpdate(expected) {
  $('updateBar').hidden = true; toast('Mise à jour en cours…');
  const results = await Promise.all(APP_FILES.map((f) => fetch(f, { cache: 'reload' }).then((r) => r.ok).catch(() => false)));
  if (results.includes(false)) return toast('Mise à jour impossible : vérifiez la connexion et réessayez');
  try {
    if ('caches' in self) for (const k of await caches.keys()) await caches.delete(k);
    for (const reg of (await navigator.serviceWorker?.getRegistrations?.()) || []) await reg.unregister();
    sessionStorage.setItem('cave-maj-attendue', expected || '');
  } catch (e) { console.error(e); }
  location.replace(`./?maj=${Date.now()}`);   // adresse neuve : la page elle-même est rechargée depuis le site
}

// Le service worker annonce qu'une nouvelle version vient de s'activer : on recharge tout de suite,
// sauf si une fiche ou un menu est ouvert (saisie en cours) : dans ce cas, un bandeau propose de le faire.
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type !== 'nouvelle-version') return;
  e.ports?.[0]?.postMessage('ok');   // « je m'en occupe » : le service worker ne recharge pas la page d'office
  if (e.data.version && !isNewerVersion(e.data.version, APP_VERSION)) return;   // déjà à jour
  // Rien en cours (fiche, menu, dialogue, mode copie/déplacement, recherche, lecture d'étiquette, saisie) : on recharge.
  const busy = !$('sheet').hidden || mode || !$('dialog').hidden || !$('banner').hidden || $('search').value.trim()
    || document.querySelector('[data-scanning]') || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (!busy) { location.reload(); return; }
  $('updateText').textContent = `Nouvelle version ${e.data.version || ''} prête`;
  $('updateBtn').onclick = () => location.reload();
  $('updateBar').hidden = false;
});

// Rouvrir l'app depuis l'icône reprend souvent la page restée en mémoire, sans la recharger : aucune mise à jour
// n'est alors cherchée. On vérifie donc aussi à chaque retour au premier plan (au plus toutes les 2 minutes).
// Si une nouvelle version existe, le service worker l'installe puis prévient la page (voir l'écouteur ci-dessus).
const UPDATE_CHECK_EVERY = 2 * 60 * 1000;
let lastUpdateCheck = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || ['localhost', '127.0.0.1'].includes(location.hostname)) return;
  if (Date.now() - lastUpdateCheck < UPDATE_CHECK_EVERY) return;
  lastUpdateCheck = Date.now();
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
  checkForUpdate();   // bandeau de secours si le service worker ne peut pas se mettre à jour
});

// ---------- Aides à la prise en main ----------
/** Mode d'emploi en 4 étapes, affiché au premier lancement et depuis le menu. */
function showWelcome() {
  openSheet('Bienvenue dans Ma Cave', `
    <ol class="steps">
      <li><b>Choisissez un casier</b> : touchez-le sur la maquette, ou utilisez les boutons en bas de l'écran.</li>
      <li><b>Touchez une case</b> : elle s'affiche en grand avec ce qu'elle contient, et « Ajouter des bouteilles ». Touchez ensuite une bouteille pour voir sa fiche. Dans les casiers métalliques, touchez directement une place.</li>
      <li><b>Photographiez l'étiquette ou parlez</b> : « 🎤 Parler », puis dites ce que vous savez de la bouteille (« Château Talbot 2016, j'en ai six, offert par Paul »). La fiche se remplit toute seule ; vérifiez, puis enregistrez (menu, « Lecture automatique »).</li>
      <li><b>Cherchez</b> une bouteille en haut de l'écran : elle s'entoure d'orange dans la cave.</li>
    </ol>
    <p class="help">Glissez un doigt pour tourner la maquette ou faire défiler un casier, écartez deux doigts pour zoomer. Tout est enregistré sur ce téléphone, au fur et à mesure.</p>
    <div class="btns"><button class="btn primary block" data-act="welcome-ok">C'est parti</button></div>`, true);
}
/** Bouteilles à boire bientôt (date « à boire jusqu'en » dépassée ou dans l'année qui vient). */
function showSoon() {
  const year = new Date().getFullYear(), list = drinkSoon(allBottles(), year);
  openSheet(`À boire bientôt (${totalBottles(list)})`, `
    <p class="help">Bouteilles dont la date « à boire jusqu'en » est ${year + 1} ou avant.</p>
    <div class="list">${list.length ? groupRows(list).map(rowHtml).join('') : '<div class="empty">Rien d\'urgent. Pensez à remplir « À boire jusqu\'en » dans les fiches.</div>'}</div>
    <div class="btns"><button class="btn block" data-act="menu">Retour</button></div>`, true);
}
function showInstall() {
  openSheet('Installer sur l\'iPhone', `
    <p class="help">1. Ouvrez cette page dans <b>Safari</b>.<br>2. Touchez le bouton <b>Partager</b> (le carré avec une flèche vers le haut).<br>3. Choisissez <b>« Sur l'écran d'accueil »</b>, puis <b>Ajouter</b>.</p>
    <p class="help">L'icône « Ma Cave » apparaît alors comme une vraie application, en plein écran, et fonctionne même sans réseau dans la cave. Les fiches sont enregistrées sur l'iPhone : pensez à faire une sauvegarde de temps en temps depuis le menu.</p>
    <div class="btns"><button class="btn block" data-act="menu">Retour</button></div>`, true);
}
async function exportData() {
  const data = JSON.stringify({ app: 'ma-cave', version: 2, appVersion: APP_VERSION, date: new Date().toISOString(), config, bouteilles: [...records.values()] });
  const name = `ma-cave-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: 'application/json' });
  // Date de la dernière sauvegarde (pour le rappel) : seulement si le partage a abouti ou le fichier est parti
  const done = () => { try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch { /* stockage bloqué */ } };
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Sauvegarde Ma Cave' }); done(); toast('Sauvegarde faite'); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000); done(); toast('Sauvegarde téléchargée');
}
$('importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  let d;
  try { d = JSON.parse(await file.text()); if (!Array.isArray(d.bouteilles)) throw new Error('format'); } catch { return toast('Ce fichier n\'est pas une sauvegarde valide'); }
  await restoreData(d, 'cette sauvegarde');
});
/**
 * Remplace les fiches et le rangement par ceux d'une sauvegarde (fichier ou copie de sécurité).
 * L'état actuel est d'abord copié sur l'appareil : si cette copie échoue, rien n'est remplacé.
 */
async function restoreData(d, what) {
  const list = (Array.isArray(d.bouteilles) ? d.bouteilles : []).filter((b) => b && !b.vide && isValidId(b.id))
    .map((b) => ({ ...b, ...(b.pile != null ? { pile: Math.max(0, parseInt(b.pile) || 0) } : {}),   // rang : un nombre, jamais du texte
      photo: typeof b.photo === 'string' && b.photo.startsWith('data:image/') ? b.photo : null }));
  if (!store) return toast('Stockage indisponible : impossible de restaurer');
  const current = [...records.values()], real = realRecordCount(current);
  // Compte en bouteilles, sans les exemples (sinon « 1039 fiches » pour une seule vraie bouteille)
  const count = (l) => { const n = totalBottles(l.filter((b) => !b.demo && !b.vide)); return `${n} bouteille${n > 1 ? 's' : ''}${l.some((b) => b.demo) ? ', plus des exemples' : ''}`; };
  const warn = real ? `Le contenu actuel de ce téléphone (${count(current)}) sera remplacé. Une copie de l'état actuel est gardée (menu, « Revenir en arrière »).`
    : 'Le rangement et les fiches de ce téléphone seront remplacés.';
  if (!await ask(`Revenir à ${what} : ${count(list)} ?\n\n${warn}`, 'Remplacer')) return;
  if (real && !await takeCopy({ raison: 'restauration' }, config, current)) return toast('Impossible de copier l\'état actuel : rien n\'a été remplacé');
  const oldConfig = lsGet(CONFIG_KEY);
  if (d.config) {   // réglage d'abord : s'il ne peut pas être écrit, on n'a encore rien remplacé
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(normalizeConfig(d.config))); } catch { return toast('Impossible d\'enregistrer le réglage sur cet appareil : rien n\'a été restauré'); }
  }
  if (!await persist((st) => st.replaceAll(list))) {   // fiches non remplacées : on remet aussi l'ancien réglage
    if (d.config && oldConfig !== null) lsSet(CONFIG_KEY, oldConfig);
    return;
  }
  location.reload();
}

// ---------- Copies de sécurité (sur l'appareil, avant chaque nouvelle version et avant une restauration) ----------
const KEEP_COPIES = 4;                              // plusieurs : la copie d'une version qui aurait abîmé les fiches ne chasse pas la bonne
const VERSION_KEY = 'cave-version-lancee';         // dernière version lancée sur cet appareil
const BACKUP_KEY = 'cave-derniere-sauvegarde';     // date (ms) de la dernière sauvegarde en fichier
const REMINDER_KEY = 'cave-dernier-rappel';        // date (ms) du dernier rappel de sauvegarde
let copiesInfo = [];                                // résumé des copies gardées (sans les fiches), pour le menu
let storageProtected = null;                        // réponse de l'iPhone à « protéger le stockage » (null : inconnue)
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

/**
 * Copie fiches + rangement dans la base des copies ; renvoie true seulement si la copie est réellement écrite.
 * Si l'écriture échoue (téléphone plein : les photos pèsent lourd), on ne garde que la copie la plus récente
 * et on réessaie une fois, plutôt que de rester bloqué à chaque lancement.
 */
async function takeCopy(info, cfg, list) {
  let copies;
  try { copies = await openCopies(); } catch (e) { console.error(e); return false; }
  const date = new Date().toISOString();
  const write = () => copies.add({ app: 'ma-cave', version: 2, ...info, date, config: cfg, bouteilles: list },
    { ...info, date, n: totalBottles(list.filter((b) => !b.demo && !b.vide)) }, (ids) => copiesToDrop(ids, KEEP_COPIES));
  try { await write(); } catch (e) {
    console.error(e);
    try { await copies.trim((ids) => copiesToDrop(ids, 1)); await write(); } catch (e2) { console.error(e2); await loadCopiesInfo(copies); return false; }
  }
  await loadCopiesInfo(copies);
  return true;
}
async function loadCopiesInfo(copies) {
  try {
    copiesInfo = (await (copies || await openCopies()).summaries()).sort((a, b) => b.id - a.id);
  } catch (e) { console.error(e); copiesInfo = []; }
}
function copyLabel(c) {
  const d = new Date(c.date), when = `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  const why = c.raison === 'restauration' ? 'Avant une restauration' : `Avant la version ${c.vers || '?'}`;
  return { why, sub: `${when} · ${c.n} bouteille${c.n > 1 ? 's' : ''}` };
}
function showCopies() {
  openSheet('Revenir en arrière', `
    <p class="help">Ce téléphone garde une copie de vos bouteilles avant chaque nouvelle version de l'application et avant chaque restauration (les ${KEEP_COPIES} plus récentes). Touchez une copie pour y revenir.</p>
    <div class="list">${copiesInfo.length ? copiesInfo.map((c) => { const l = copyLabel(c); return `<button class="row" data-act="snap-restore" data-snap="${esc(String(c.id))}">
      <span class="main"><div class="n">${esc(l.why)}</div><div class="s">${esc(l.sub)}</div></span></button>`; }).join('') : '<div class="empty">Aucune copie pour l\'instant.</div>'}</div>
    <p class="help">Ces copies restent sur ce téléphone : elles ne remplacent pas « Sauvegarder mes données », qui protège aussi d'une perte du téléphone.</p>
    <div class="btns"><button class="btn block" data-act="menu">Retour</button></div>`, true);
}
async function restoreCopy(id) {
  let copy;
  try { copy = await (await openCopies()).get(Number(id)); } catch (e) { console.error(e); }
  if (!copy) return toast('Copie introuvable');
  await restoreData(copy, `la copie « ${copyLabel(copy).why.toLowerCase()} »`);
}
/** Texte du menu : date de la dernière sauvegarde et protection du stockage. */
function safetyLine() {
  const last = Number(lsGet(BACKUP_KEY)), days = last ? Math.floor((Date.now() - last) / DAY_MS) : null;
  const when = days === null ? 'jamais' : days < 1 ? 'aujourd\'hui' : days < 2 ? 'hier' : `il y a ${days} jours`;
  return `Dernière sauvegarde : <b>${when}</b>${storageProtected === null ? '' : ` · Stockage protégé par l'iPhone : <b>${storageProtected ? 'oui' : 'non'}</b>${storageProtected ? '' : ' (ouvrez l\'app depuis son icône sur l\'écran d\'accueil)'}`}`;
}

// ---------- Bouteilles d'exemple (uniquement pour tester) ----------
const DEMO = [
  ['Château Margaux', 'Margaux', 'Bordeaux', 'rouge'], ['Château Lynch-Bages', 'Pauillac', 'Bordeaux', 'rouge'], ['Domaine Tempier', 'Bandol', 'Provence', 'rose'],
  ['Clos des Papes', 'Châteauneuf-du-Pape', 'Rhône', 'rouge'], ['Domaine Leflaive', 'Puligny-Montrachet', 'Bourgogne', 'blanc'], ['William Fèvre', 'Chablis Grand Cru', 'Bourgogne', 'blanc'],
  ['Bollinger', 'Champagne', 'Champagne', 'bulles'], ['Château d\'Yquem', 'Sauternes', 'Bordeaux', 'liquoreux'], ['Domaine Huet', 'Vouvray', 'Loire', 'blanc'],
  ['Château de Beaucastel', 'Châteauneuf-du-Pape', 'Rhône', 'rouge'], ['Domaine Ott', 'Côtes de Provence', 'Provence', 'rose'], ['Louis Jadot', 'Gevrey-Chambertin', 'Bourgogne', 'rouge'],
];
async function seedDemo() {
  const list = [];
  for (const k of RACK_ORDER) {
    const st = styleOf(k);
    if (racks[k].isCases) {   // cases maçonnées : des piles de 1 à 20 bouteilles, par séries d'un même vin
      for (let c = 0; c < racks[k].cols; c++) for (let r = 0; r < racks[k].rows; r++) {
        if (Math.random() > 0.7) continue;
        const caseId = slotId(k, c, r), have = pileOf([...records.values(), ...list], caseId).length, base = newBottleId(caseId);
        const n = Math.min(capacityOf(caseId) - have, 1 + Math.floor(Math.random() * 20));
        for (let i = 0; i < n;) {
          const w = DEMO[Math.floor(Math.random() * DEMO.length)], run = 1 + Math.floor(Math.random() * 6), year = String(1998 + Math.floor(Math.random() * 25));
          for (let j = 0; j < run && i < n; j++, i++) list.push({ id: base + i.toString(36), pile: have + i, nom: w[0], appellation: w[1], region: w[2], couleur: w[3], millesime: year, apogee: String(2024 + Math.floor(Math.random() * 12)), demo: true, ajout: Date.now() });
        }
      }
      continue;
    }
    for (let c = 0; c < racks[k].cols; c++) for (let r = 0; r < racks[k].rows; r++) {
      const id = slotId(k, c, r); if (records.has(id) || Math.random() > 0.6) continue;
      const w = DEMO[Math.floor(Math.random() * DEMO.length)];
      const quantite = st.defaut > 1 ? 1 + Math.floor(Math.random() * (st.defaut + 2)) : 1;
      list.push({ id, nom: w[0], appellation: w[1], region: w[2], couleur: w[3], millesime: String(1998 + Math.floor(Math.random() * 25)), apogee: String(2024 + Math.floor(Math.random() * 12)), quantite, demo: true, ajout: Date.now() });
    }
  }
  if (await persist((st) => st.putMany(list))) for (const b of list) records.set(b.id, b);
}
/** Retire les bouteilles d'exemple (jamais les vraies fiches) ; renvoie les fiches retirées, pour « Annuler ». */
async function clearDemo() {
  const list = [...records.values()].filter((b) => b.demo), ids = new Set(list.map((b) => b.id));
  // Une vraie bouteille posée sur des exemples descend : la pile reste sans trou (même transaction)
  const left = allBottles().filter((b) => !ids.has(b.id)), fixes = [];
  for (const caseId of new Set(list.filter((b) => parseId(b.id).u).map((b) => caseIdOf(b.id)))) fixes.push(...normalizePile(left, caseId));
  if (!await persistBatch(fixes, [...ids])) return [];
  // Pour « Annuler » : comme si on les avait retirées du haut vers le bas (chaque rang reste alors valable)
  return list.sort((a, b) => (b.pile ?? 0) - (a.pile ?? 0));
}
/**
 * Passage aux cases en pile (0.4.0). Appareil de test (seulement des exemples) : exemples régénérés au nouveau
 * format. Sinon, les anciennes fiches de cases maçonnées sont converties (une fiche par bouteille) et les rangs
 * de chaque pile remis en ordre. Rien n'est perdu : ce qui ne tient pas reste « à ranger ».
 */
async function upgradeCases() {
  let regenerated = true; try { regenerated = !!localStorage.getItem('cave-demo-v4'); } catch { /* stockage bloqué */ }
  const all = [...records.values()];
  if (!regenerated && all.length && !realRecordCount(all)) {
    try { localStorage.setItem('cave-demo-v4', '1'); } catch { return; }
    if (await persistBatch([], all.map((b) => b.id)) && DEV) await seedDemo();   // exemples : en développement seulement
    return;
  }
  const mig = migrateCaseRecords(allBottles(), isCasesRack, capacityOf);
  if (mig.put.length || mig.remove.length) await persistBatch(mig.put, mig.remove);
  const fixes = [];
  for (const caseId of new Set(allBottles().filter((b) => parseId(b.id).u).map((b) => caseIdOf(b.id)))) fixes.push(...normalizePile(allBottles(), caseId));
  if (fixes.length) await persistBatch(fixes, []);
  try { localStorage.setItem('cave-demo-v4', '1'); } catch { /* stockage bloqué */ }
}

document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- Boucle d'animation ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  updateCamera(dt); updateHero(now);
  const pulse = 0.5 + 0.5 * Math.sin(now / 240);
  ringMat.opacity = 0.55 + 0.45 * pulse; selRing.material.opacity = 0.6 + 0.4 * pulse;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

if (new URLSearchParams(location.search).has('debug')) window.__cave = { tapSlot, selectSlot, saveRecord, deleteRecord, get store() { return store; }, records, view, hero, camera, get heroAnim() { return heroAnim; } };   // pour les tests automatiques

// ---------- Démarrage ----------
(async function start() {
  try {
    store = await openStore();
    for (const b of await store.getAll()) if (!b.vide) records.set(b.id, b);
  } catch (e) { console.error(e); toast('Stockage indisponible : les fiches ne seront pas enregistrées'); }
  let hasStoredConfig = true, storedConfig = null;
  try {
    const raw = localStorage.getItem(CONFIG_KEY) || localStorage.getItem('cave-config-v3') || localStorage.getItem('cave-config-v2');
    hasStoredConfig = !!raw; storedConfig = raw ? JSON.parse(raw) : null;
  } catch { /* stockage bloqué ou réglage illisible */ }
  const all = [...records.values()];
  // Nouvelle version : copie des fiches AVANT toute transformation au démarrage. Si la copie échoue, on ne
  // transforme rien (les fiches restent telles quelles), on demande une sauvegarde en fichier et on réessaiera
  // au prochain lancement ; une sauvegarde en fichier faite depuis moins d'un jour suffit alors à continuer.
  await loadCopiesInfo();   // pour le bouton « Revenir en arrière » et la dernière version lancée
  const lastVersion = lastLaunchedVersion(lsGet(VERSION_KEY), copiesInfo);
  let copyOk = true;
  if (store && needsSnapshot(lastVersion, APP_VERSION, realRecordCount(all))) {
    toast('Copie de sécurité de vos bouteilles…');
    copyOk = await takeCopy({ raison: 'version', de: lastVersion, vers: APP_VERSION }, storedConfig || config, all);
    if (!copyOk && Date.now() - Number(lsGet(BACKUP_KEY) || 0) < DAY_MS) copyOk = true;
    if (!copyOk) {
      ask('La copie de sécurité d\'avant la mise à jour n\'a pas pu être faite (le téléphone manque peut-être de place). Vos bouteilles ne sont pas touchées. Faites une sauvegarde en fichier : la mise à jour se terminera au prochain lancement.',
        'Sauvegarder', 'Plus tard').then((yes) => { if (yes) exportData(); });
    }
  }
  if (copyOk) lsSet(VERSION_KEY, APP_VERSION);
  if (store && shouldResetDemoToVerdelot(storedConfig, all)) {
    // Appareil de test (seulement des bouteilles d'exemple) resté sur l'ancien rangement : format Verdelot,
    // avec des exemples régénérés à ce format au prochain lancement.
    // Réglage d'abord : si le stockage est bloqué, on ne supprime rien.
    let configSaved = false;
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...DEFAULT_CONFIG, nom: config.nom }));
      localStorage.removeItem('cave-demo');
      configSaved = true;
    } catch { /* stockage bloqué : on continue avec ce qu'on a */ }
    if (configSaved && await persist((st) => st.removeMany(all.map((b) => b.id)))) { location.reload(); return; }
  }
  if (needsLegacyConfig(hasStoredConfig, realRecordCount(all))) {
    // Fiches créées avec la 0.2.0 (alvéoles partout) : on garde ce rangement pour qu'elles restent à leur place.
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(LEGACY_CONFIG)); location.reload(); return; } catch { /* on continue avec le réglage par défaut */ }
  } else if (!hasStoredConfig && store) {   // sans base lisible, on ne peut pas savoir s'il y a des fiches : on n'écrit rien
    // Première installation : on enregistre tout de suite le réglage utilisé, sinon le lancement suivant
    // (avec des fiches, mais toujours sans réglage) croirait à un appareil de la 0.2.0.
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch { /* stockage bloqué : rien à faire */ }
  }
  // Téléphone d'un utilisateur : jamais de bouteilles d'exemple. Celles laissées par une ancienne version sont
  // retirées (seulement les fiches marquées « exemple » : une fiche modifiée par l'utilisateur n'en est plus une).
  // Après la copie de sécurité seulement : une vraie bouteille posée sur des exemples descend dans sa case.
  if (store && !DEV && copyOk && [...records.values()].some((b) => b.demo)) {
    const removed = await clearDemo().catch((e) => { console.error(e); return []; });
    if (removed.length) toast('Bouteilles d\'exemple retirées');
  }
  if (store && records.size && copyOk) await upgradeCases().catch(console.error);
  let demoDone = true; try { demoDone = !!localStorage.getItem('cave-demo'); } catch { /* stockage bloqué */ }
  if (store && DEV && !records.size && !demoDone) { try { localStorage.setItem('cave-demo', '1'); localStorage.setItem('cave-demo-v4', '1'); } catch { /* idem */ } await seedDemo().catch(console.error); }
  rebuildBottles(); applyVisibility(); requestAnimationFrame(frame);
  let welcomed = false; try { welcomed = !!localStorage.getItem('cave-bienvenue'); } catch { /* stockage bloqué */ }
  if (!welcomed) showWelcome();
  else if (copyOk && backupReminderDue({ now: Date.now(), lastBackup: lsGet(BACKUP_KEY), lastReminder: lsGet(REMINDER_KEY), realCount: realRecordCount([...records.values()]) })) {
    lsSet(REMINDER_KEY, String(Date.now()));
    const last = lsGet(BACKUP_KEY);
    ask(`Pensez à sauvegarder vos bouteilles : ${last ? 'la dernière sauvegarde date de plus d\'un mois' : 'elles n\'ont encore jamais été sauvegardées'}. La sauvegarde garde vos fiches même si ce téléphone est perdu ou changé.`,
      'Sauvegarder', 'Plus tard').then((yes) => { if (yes) exportData(); });
  }
  // Demande à l'iPhone de ne jamais vider ce stockage pour faire de la place ; sa réponse est montrée dans le menu
  navigator.storage?.persist?.().then((ok) => { storageProtected = !!ok; }).catch(() => {});
  if (location.search.includes('maj=')) {   // retour d'une mise à jour forcée : on dit si elle a bien pris
    history.replaceState(null, '', './');
    let expected = ''; try { expected = sessionStorage.getItem('cave-maj-attendue') || ''; sessionStorage.removeItem('cave-maj-attendue'); } catch { /* sans stockage */ }
    toast(isNewerVersion(expected, APP_VERSION) ? 'La mise à jour n\'a pas abouti : réessayez avec du réseau' : `Application à jour (version ${APP_VERSION})`);
  }
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) checkForUpdate();
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
})();
