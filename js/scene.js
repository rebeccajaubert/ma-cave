// Scène 3D (Three.js) : cave, casiers, bouteilles, anneaux, caméra, bouteille en gros plan, réglage des séparations, boucle d'animation. Ne dépend que des données et des outils.
import { rackSizes, RACK_ORDER, STYLES, rackGrid, cellLayout, casePlaces, parseId, BOTTLE_D, slotId, qty, clamp, normalizeConfig, CONFIG_REV, moveSeparator } from './lib.js';
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG_KEY, UNKNOWN_GLASS, bottleAt, config, records, saved, typeOf } from './data.js';
import { $, toast } from './util.js';

// ---------- Géométrie de la cave (mètres, schématique) ----------
export const BASE = 0.12;        // socle sous les casiers
const R = 2.6;            // rayon de la voûte (demi-largeur de la cave)
const RACK_D = 0.4;       // profondeur des casiers muraux
const ISLAND_W = 1.0;     // largeur de l'îlot central : deux meubles de RACK_D dos à dos, avec un petit passage entre eux
const RACK_FRONT_X = R - RACK_D;

export const rk = rackSizes(config);
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
export const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.fond);
export const VFOV = 38, TAN_V = Math.tan(THREE.MathUtils.degToRad(VFOV / 2));
export const camera = new THREE.PerspectiveCamera(VFOV, 1, 0.1, 300);
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

// Rayon de visée : ce que le doigt touche (toucher, réglage des séparations)
export const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();

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
export const racks = {};   // clé -> { group, plane, body, cols, rows, flip, W, H, discs, rings, normal, label }
export const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
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
export const BOTTLE_OUT = 0.07;
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
export let adjust = null;   // { k, before: { colW, rowH }, sel: { axis, i } | null, drag: { from, sizes } | null }
const sepHlMat = new THREE.MeshBasicMaterial({ color: C.trouve });   // séparation choisie (orange)
/** Séparations épaissies pendant « Ajuster les séparations », celle qui est choisie en orange. */
export function paintSeps(rack) {
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
export function caseLocal(rack, c, r) {
  const { colW, rowH, colX, rowY } = rack.grid, w = colW[c], h = rowH[r];
  const x0 = rack.flip ? rack.W / 2 - colX[c] - w : -rack.W / 2 + colX[c];
  return [x0 + w / 2, BASE + rowY[r] + h / 2, w, h];
}
/** Position d'une bouteille de case maçonnée dans son casier (selon son rang dans la pile), ou null si elle ne tient pas. */
export function bottleLocal(rec) {
  const { k, c, r, u } = parseId(rec.id), rack = racks[k];
  if (!u || !rack?.isCases || !inRack(k, c, r)) return null;
  const p = rack.places[c][r][rec.pile ?? 0]; if (!p) return null;
  const [cx, cy] = caseLocal(rack, c, r);
  return [cx + p[0], cy + p[1]];   // x positif = à droite vu depuis l'allée, comme le repère du casier
}
function slotLocal(rack, c, r) { const [x, y] = caseLocal(rack, c, r); return [x, y]; }
export function slotWorld(key, c, r, out = new THREE.Vector3()) {
  const rack = racks[key]; const [lx, ly] = slotLocal(rack, c, r);
  return rack.group.localToWorld(out.set(lx, ly, 0));
}
export const inRack = (key, c, r) => racks[key] && c >= 0 && r >= 0 && c < racks[key].cols && r < racks[key].rows;

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
export function rebuildBottles() {
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
export let highlighted = [];    // identifiants mis en évidence par la recherche (anneaux orange)
export let picked = false;      // un résultat de recherche a été choisi : un enregistrement ne rallume pas toute la recherche
/** Bouteilles à entourer d'orange (recherche, ligne de liste touchée) ; redessine les anneaux. */
export function setHighlight(ids) { highlighted = ids; rebuildRings(); }
/** Un résultat de recherche a été choisi (true) : un enregistrement ne rallume plus toute la recherche. */
export function setPicked(v) { picked = v; }
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
export const selRing = new THREE.Mesh(new THREE.RingGeometry(0.082, 0.1, 40), new THREE.MeshBasicMaterial({ color: C.sel, transparent: true }));
selRing.visible = false; selRing.renderOrder = 6; scene.add(selRing);

// ---------- Caméra : vue d'ensemble ou casier de face ----------
export const view = { mode: 'overview', key: null, az: 0.42, el: 0.9, zoom: 1, u: 0, v: 0, d: 5 };
const cam = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), ready: false };
const goalPos = new THREE.Vector3(), goalTgt = new THREE.Vector3();
const tanH = () => TAN_V * aspect;
const fitDist = () => (Math.hypot(R, L / 2) + 0.4) / (TAN_V * Math.min(1, aspect)) * (aspect > 1 ? 1.25 : 0.8);
export const dFor = (width) => (width + 0.35) / 2 / tanH();                       // distance pour voir `width` mètres de casier
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
export const dMax = (rack) => Math.max(dFor(rack.W), (rack.H + 0.5) / 2 / TAN_V / usableRatio());   // tout le casier, dans la partie libre
// Zoom maximal : une case maçonnée peut remplir l'écran ; une place de casier métallique fait ≈ 55 px
const dMin = (rack) => (rack.isCases ? 0.3 / 2 / tanH() : dFor(Math.max(0.25, 1.3 * rack.cw)));
// Largeur montrée à l'ouverture d'un casier : assez d'emplacements pour se repérer, assez grands pour être touchés du doigt.
export const viewW = (rack) => clamp(6 * rack.cw, 0.54, 1.4);
export function clampView() {
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
export function applyVisibility() {
  const ov = view.mode === 'overview', k = view.key;
  decor.visible = ov;
  for (const key of RACK_ORDER) racks[key].group.visible = ov || key === k;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === (ov ? 'overview' : k)));
  document.body.classList.toggle('rack-mode', !ov);
  $('hint').textContent = ov ? 'Touchez un casier pour l\'ouvrir · glissez pour tourner la maquette'
    : racks[k]?.isCases ? 'Touchez une case pour l\'ouvrir · glissez pour faire défiler' : 'Touchez une bouteille · glissez pour faire défiler';
  applyViewOffset();
}
export function showOverview() { view.mode = 'overview'; view.key = null; applyVisibility(); }
// Hauteur de visée au repos : casier centré dans la partie libre ; s'il est plus haut qu'elle (casiers métalliques,
// zoomés pour le doigt), on montre le bas (rangée 1) juste au-dessus des boutons : le haut se découvre en glissant.
export const restV = (rack) => Math.min(BASE + rack.H / 2 + 0.1, BASE - 0.02 + view.d * TAN_V * usableRatio());
export function showRack(key) {
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
export function focusCase(k, c, r, sheetTop = window.innerHeight * 0.5) {
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
export function focusSlot(key, c, r) {
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
export const hero = new THREE.Group(); hero.visible = false; scene.add(hero);
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
export let heroAnim = null;
// b = fiche de la bouteille, ou null pour une bouteille non enregistrée (sans étiquette)
export function presentBottle(b, key, c, r) {
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
export function hideHero() { hero.visible = false; heroAnim = null; if (hiddenId) { hiddenId = null; rebuildBottles(); } }
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
export const sizesOf = (k, axis) => (axis === 'col' ? rk[k].colW : rk[k].rowH);
export function startAdjust(k) {
  if (!racks[k]?.isCases) return;
  if (adjust) endAdjust(false);   // un seul réglage à la fois : l'éventuel précédent est abandonné
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
export async function endAdjust(save) {
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
export function rackPoint(k, cx, cy) {
  ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const h = raycaster.intersectObject(racks[k].plane, false)[0];
  return h ? racks[k].group.worldToLocal(h.point.clone()) : null;
}
/** Séparation la plus proche du doigt, à moins de 24 px (zone de toucher élargie), ou null. */
export function sepAt(k, l) {
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
export function dragSeparator(l) {
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

// ---------- Boucle d'animation ----------
export let last = performance.now();
export function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  updateCamera(dt); updateHero(now);
  const pulse = 0.5 + 0.5 * Math.sin(now / 240);
  ringMat.opacity = 0.55 + 0.45 * pulse; selRing.material.opacity = 0.6 + 0.4 * pulse;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

