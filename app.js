import * as THREE from './vendor/three.module.min.js';

/* ============================================================
   Ma Cave — maquette 3D de la cave, façon plan d'architecte
   Une voûte en demi-cylindre, un îlot central, des casiers
   sur les deux murs et sur les deux faces de l'îlot.
   Chaque emplacement contient une bouteille :
   grise = pas encore enregistrée, colorée = enregistrée.
   ============================================================ */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Configuration ----------
// Une seule longueur (colonnes) pour les deux murs et l'îlot ; hauteurs séparées.
const DEFAULT_CONFIG = { nom: 'La Cave de Verdelot', cols: 12, rowsMur: 5, rowsIlot: 6 };
const LIMITS = { cols: 40, rowsMur: 7, rowsIlot: 12 };
const RACK_NAMES = { G: 'Mur gauche', IG: 'Îlot, côté gauche', ID: 'Îlot, côté droit', D: 'Mur droit' };
const RACK_ORDER = ['G', 'IG', 'ID', 'D'];
const CONFIG_KEY = 'cave-config-v3';

function normalizeConfig(c) {
  const out = { ...DEFAULT_CONFIG };
  if (!c || typeof c !== 'object') return out;
  if (c.nom && c.nom !== 'La Cave de Papa') out.nom = String(c.nom).slice(0, 40);
  const num = (v, d, max) => clamp(parseInt(v) || d, 1, max);
  if (c.racks) {   // ancien format : un réglage par casier
    const r = c.racks, m = (...v) => Math.max(...v.map((x) => parseInt(x) || 0));
    out.cols = num(m(r.G?.cols, r.D?.cols, r.IG?.cols, r.ID?.cols), out.cols, LIMITS.cols);
    out.rowsMur = num(m(r.G?.rows, r.D?.rows), out.rowsMur, LIMITS.rowsMur);
    out.rowsIlot = num(m(r.IG?.rows, r.ID?.rows), out.rowsIlot, LIMITS.rowsIlot);
  } else {
    out.cols = num(c.cols, out.cols, LIMITS.cols);
    out.rowsMur = num(c.rowsMur, out.rowsMur, LIMITS.rowsMur);
    out.rowsIlot = num(c.rowsIlot, out.rowsIlot, LIMITS.rowsIlot);
  }
  return out;
}
function loadConfig() {
  try { return normalizeConfig(JSON.parse(localStorage.getItem(CONFIG_KEY) || localStorage.getItem('cave-config-v2') || 'null')); }
  catch { return { ...DEFAULT_CONFIG }; }
}
const rackSizes = (c) => ({ G: { cols: c.cols, rows: c.rowsMur }, D: { cols: c.cols, rows: c.rowsMur }, IG: { cols: c.cols, rows: c.rowsIlot }, ID: { cols: c.cols, rows: c.rowsIlot } });
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

// ---------- Base de données (IndexedDB, sur l'iPhone) ----------
const DB_NAME = 'cave-a-vin', STORE = 'bouteilles';
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function dbOp(mode, fn) {
  if (!db) return Promise.resolve();   // stockage indisponible : l'app reste utilisable pour la séance
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(out?.result);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}
// Un emplacement sans fiche = bouteille non enregistrée : rien n'apparaît dans le casier.
const records = new Map();
const slotId = (k, c, r) => `${k}:${c}:${r}`;
const parseId = (id) => { const [k, c, r] = id.split(':'); return { k, c: +c, r: +r }; };
const bottleAt = (id) => { const b = records.get(id); return b && !b.vide ? b : null; };
const allBottles = () => [...records.values()].filter((b) => !b.vide);
async function saveRecord(b) { records.set(b.id, b); await dbOp('readwrite', (s) => s.put(b)); }
async function deleteRecord(id) { records.delete(id); await dbOp('readwrite', (s) => s.delete(id)); }

function locText(id) {
  const { k, c, r } = parseId(id);
  return `<b>${RACK_NAMES[k] || k}</b> · colonne <b>${c + 1}</b> depuis l'entrée · rangée <b>${r + 1}</b> depuis le bas`;
}
function locShort(id) {
  const { k, c, r } = parseId(id);
  return `${RACK_NAMES[k] || k} · col. ${c + 1} · rang ${r + 1}`;
}

// ---------- Géométrie de la cave (mètres, schématique) ----------
const P = 0.2;            // taille d'un emplacement
const BASE = 0.12;        // socle sous les casiers
const R = 2.6;            // rayon de la voûte (demi-largeur de la cave)
const WALL_H = 0.3;       // petit mur droit sous la voûte
const RACK_D = 0.4;       // profondeur des casiers muraux
const ISLAND_W = 1.0;     // largeur de l'îlot central

const rk = rackSizes(config);
const islandLen = Math.max(rk.IG.cols, rk.ID.cols) * P + 0.2;
const islandH = BASE + Math.max(rk.IG.rows, rk.ID.rows) * P + 0.08;
const outerLen = Math.max(rk.G.cols, rk.D.cols) * P;
const L = Math.max(outerLen + 1.2, islandLen + 2.8);
const RACK_FRONT_X = R - RACK_D;

// ---------- Palette « plan d'architecte » ----------
const C = { fond: 0x0f2a4d, trait: 0x9cc4ee, casier: 0xc9d6e6, ilot: 0xdbe4ef, arete: 0x24456f, sel: 0x0b1f3a, trouve: 0xff7a00 };

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
const cellTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#eef3f9'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c2d0e2'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  const hole = g.createRadialGradient(w / 2, h / 2 + 8, 8, w / 2, h / 2, 50);
  hole.addColorStop(0, '#1b2f4c'); hole.addColorStop(0.75, '#2b4467'); hole.addColorStop(1, '#5f7da3');
  g.fillStyle = hole; g.beginPath(); g.arc(w / 2, h / 2, 49, 0, 7); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, 51, 0.5, 2.6); g.stroke();
}, true);
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
const ringGeo = new THREE.RingGeometry(0.08, 0.099, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: C.trouve, transparent: true, depthTest: false });
const edgeMat = new THREE.LineBasicMaterial({ color: C.arete });
function withEdges(mesh) { mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat)); return mesh; }
function makeLabel(text, key) {
  const tex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(4, 14, w - 8, h - 28, 50); g.fill();
    g.fillStyle = '#10294a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 50px -apple-system, "Helvetica Neue", sans-serif'; g.fillText(text, w / 2, h / 2 + 3);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.5, 0.375, 1); s.renderOrder = 10; s.userData.rack = key; decor.add(s); return s;
}
function makeRack(key, x, rotY, flip, hasBody, labelText) {
  const { cols, rows } = rk[key];
  const W = cols * P, H = rows * P;
  const group = new THREE.Group(); group.position.set(x, 0, 0); group.rotation.y = rotY; scene.add(group);
  const tex = cellTex.clone(); tex.needsUpdate = true; tex.repeat.set(cols, rows);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex }));
  plane.position.set(0, BASE + H / 2, 0.004); plane.userData.rack = key; group.add(plane);
  let body = null;
  if (hasBody) {
    body = withEdges(new THREE.Mesh(new THREE.BoxGeometry(W + 0.06, BASE + H + 0.04, RACK_D), new THREE.MeshBasicMaterial({ color: C.casier })));
    body.position.set(0, (BASE + H + 0.04) / 2, -RACK_D / 2); body.userData.rack = key; group.add(body);
  }
  const n = cols * rows;
  const glass = new THREE.InstancedMesh(glassGeo, glassMat, n);
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, n);
  for (const m of [glass, rings]) { m.count = 0; m.frustumCulled = false; group.add(m); }
  rings.renderOrder = 5;
  group.updateMatrixWorld(true);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
  const label = makeLabel(labelText, key);
  label.position.set(x + normal.x * (hasBody ? -RACK_D / 2 : 0.55), BASE + H + (hasBody ? 0.4 : 0.6), (key === 'G' || key === 'ID' ? -1 : 1) * W * 0.22);
  racks[key] = { key, group, plane, body, cols, rows, flip, W, H, glass, rings, normal, label };
}
function slotLocal(rack, c, r) {
  const ci = rack.flip ? rack.cols - 1 - c : c;
  return [(ci + 0.5) * P - rack.W / 2, BASE + (r + 0.5) * P];
}
function slotWorld(key, c, r, out = new THREE.Vector3()) {
  const rack = racks[key]; const [lx, ly] = slotLocal(rack, c, r);
  return rack.group.localToWorld(out.set(lx, ly, 0));
}
const inRack = (key, c, r) => racks[key] && c >= 0 && r >= 0 && c < racks[key].cols && r < racks[key].rows;

// Colonne 1 = toujours la plus proche de l'entrée
makeRack('G', -RACK_FRONT_X, Math.PI / 2, false, true, 'Mur gauche');
makeRack('D', RACK_FRONT_X, -Math.PI / 2, true, true, 'Mur droit');
makeRack('IG', -ISLAND_W / 2, -Math.PI / 2, true, false, 'Îlot gauche');
makeRack('ID', ISLAND_W / 2, Math.PI / 2, false, false, 'Îlot droit');
const island = withEdges(new THREE.Mesh(new THREE.BoxGeometry(ISLAND_W - 0.01, islandH, islandLen), new THREE.MeshBasicMaterial({ color: C.ilot })));
island.position.y = islandH / 2; island.userData.island = true; scene.add(island);

// ---------- Pastilles des bouteilles ----------
let hiddenId = null;     // bouteille « sortie » (présentée en gros plan)
function rebuildBottles() {
  for (const k of RACK_ORDER) {
    const rack = racks[k]; let i = 0;
    for (let c = 0; c < rack.cols; c++) for (let r = 0; r < rack.rows; r++) {
      const id = slotId(k, c, r), rec = bottleAt(id);
      if (!rec || id === hiddenId) continue;   // non enregistrée : l'emplacement reste vide à l'écran
      const [lx, ly] = slotLocal(rack, c, r);
      rack.glass.setMatrixAt(i, tmpM.makeTranslation(lx, ly, 0));
      rack.glass.setColorAt(i, tmpC.setHex(typeOf(rec).verre)); i++;
    }
    rack.glass.count = i; rack.glass.instanceMatrix.needsUpdate = true; if (rack.glass.instanceColor) rack.glass.instanceColor.needsUpdate = true;
  }
}
let highlighted = [];    // identifiants mis en évidence par la recherche
function rebuildRings() {
  const count = {}; for (const k of RACK_ORDER) count[k] = 0;
  for (const id of highlighted) {
    const { k, c, r } = parseId(id); if (!inRack(k, c, r)) continue;
    const rack = racks[k], [lx, ly] = slotLocal(rack, c, r);
    rack.rings.setMatrixAt(count[k]++, tmpM.makeTranslation(lx, ly, BOTTLE_OUT + 0.004));
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
const dFor = (n) => (n * P + 0.35) / 2 / tanH();
const dMax = (rack) => Math.max(dFor(rack.cols), (rack.H + 0.9) / 2 / TAN_V);
const dMin = () => dFor(3.2);
function clampView() {
  if (view.mode !== 'rack') { view.zoom = clamp(view.zoom, 0.4, 1.35); view.el = clamp(view.el, 0.3, 1.5); return; }
  const rack = racks[view.key];
  view.d = clamp(view.d, Math.min(dMin(), dMax(rack)), dMax(rack));
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
  island.visible = ov || k === 'IG' || k === 'ID';
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === (ov ? 'overview' : k)));
  $('hint').textContent = ov ? 'Touchez un casier pour l\'ouvrir · glissez pour tourner la maquette'
    : 'Touchez une bouteille · glissez pour faire défiler le casier';
}
function showOverview() { view.mode = 'overview'; view.key = null; applyVisibility(); }
function showRack(key) {
  const rack = racks[key];
  view.mode = 'rack'; view.key = key;
  view.d = Math.min(dFor(Math.min(rack.cols, 7)), dMax(rack)); view.u = 0; view.v = BASE + rack.H / 2 + 0.1;
  clampView(); applyVisibility();
}
function focusSlot(key, c, r) {
  const rack = racks[key], [lx, ly] = slotLocal(rack, c, r);
  if (view.mode !== 'rack' || view.key !== key) showRack(key);
  view.d = Math.min(view.d, dFor(Math.min(rack.cols, 7)));
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
  const id = slotId(key, c, r);
  heroGlassMat.color.setHex(b ? typeOf(b).verre : UNKNOWN_GLASS);
  heroCapMat.color.setHex(b ? typeOf(b).capsule : 0x1d1f23);
  heroLabel.visible = !!b; if (b) drawLabel(b);
  computeGoal();
  const n = racks[key].normal, s = slotWorld(key, c, r);
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

// ---------- Toucher : tourner, faire défiler, sélectionner ----------
const pointers = new Map(); let tapStart = null, pinchDist = 0;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  else { tapStart = null; const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  $('search').blur();
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
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
    const ci = clamp(Math.floor((l.x + rack.W / 2) / P), 0, rack.cols - 1), r = clamp(Math.floor((l.y - BASE) / P), 0, rack.rows - 1);
    return { type: 'slot', key: rack.key, c: rack.flip ? rack.cols - 1 - ci : ci, r };
  }
  const targets = [island]; for (const k of RACK_ORDER) { const r = racks[k]; targets.push(r.plane); if (r.body) targets.push(r.body); }
  const labelHit = raycaster.intersectObjects(RACK_ORDER.map((k) => racks[k].label), false)[0];
  const h = labelHit || raycaster.intersectObjects(targets, false)[0]; if (!h) return null;
  if (h.object.userData.rack) return { type: 'rack', key: h.object.userData.rack };
  if (h.object.userData.island) return { type: 'rack', key: (Math.abs(h.point.x) > 0.3 ? h.point.x : camera.position.x) < 0 ? 'IG' : 'ID' };
  return null;
}

// ---------- État de l'interface ----------
let selected = null;   // { key, c, r, id }
let mode = null;       // { type: 'copy' | 'move', source: fiche }
let draftPhoto = null;

// Demande de confirmation affichée dans l'application (les fenêtres du navigateur sont parfois bloquées)
function ask(message, okLabel = 'Continuer') {
  return new Promise((res) => {
    $('dialogText').textContent = message; $('dialogOk').textContent = okLabel; $('dialog').hidden = false;
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
async function tapSlot(hit) {
  const id = slotId(hit.key, hit.c, hit.r);
  if (mode) {
    if (bottleAt(id)) return toast('Il y a déjà une bouteille enregistrée ici');
    const copy = { ...mode.source, id, ajout: Date.now() };
    if (mode.type === 'move') { await deleteRecord(mode.source.id); await saveRecord(copy); endMode(); refresh(); selectSlot(hit.key, hit.c, hit.r); toast('Bouteille déplacée'); }
    else { await saveRecord(copy); refresh(); toast('Bouteille enregistrée ici aussi'); }
    return;
  }
  selectSlot(hit.key, hit.c, hit.r);
}
function refresh() { rebuildBottles(); if ($('search').value.trim()) runSearch(false); }

function selectSlot(key, c, r) {
  if (!inRack(key, c, r)) return toast('Cet emplacement n\'existe plus avec les dimensions actuelles');
  hideHero();
  const id = slotId(key, c, r); selected = { key, c, r, id };
  focusSlot(key, c, r);
  slotWorld(key, c, r, selRing.position).addScaledVector(racks[key].normal, BOTTLE_OUT + 0.005);
  selRing.quaternion.copy(racks[key].group.quaternion); selRing.visible = true;
  const b = bottleAt(id);
  presentBottle(b, key, c, r);
  if (b) showCard(b); else showUnknown(id);
}

// ---------- Fiche (panneau du bas) ----------
function openSheet(title, html, tall = false) {
  $('sheetTitle').textContent = title; $('sheetBody').innerHTML = html;
  $('sheet').classList.toggle('tall', tall); $('sheet').hidden = false; $('sheetBody').scrollTop = 0;
  $('results').hidden = true;
}
function closeSheet() {
  const had = selected; $('sheet').hidden = true; $('sheetBody').innerHTML = ''; hideHero(); selRing.visible = false; selected = null;
  if (had && view.mode === 'rack') { view.v = BASE + racks[view.key].H / 2 + 0.1; clampView(); }
}
$('sheetClose').onclick = closeSheet;

function showUnknown(id) {
  openSheet('Bouteille non enregistrée', `<div class="loc">${locText(id)}</div>
    <p class="help">Cet emplacement n'a pas encore de fiche : la bouteille n'a donc pas d'étiquette et n'apparaît pas dans le casier.</p>
    <div class="btns"><button class="btn primary block" data-act="add">Enregistrer cette bouteille</button></div>`);
}
function showCard(b) {
  const t = typeOf(b), f = [];
  const add = (k, v) => v && f.push(`<dt>${k}</dt><dd>${esc(v)}</dd>`);
  add('Couleur', t.nom); add('Millésime', b.millesime); add('Appellation', b.appellation); add('Région', b.region);
  add('Cépage', b.cepage); add('À boire', b.apogee); add('Prix', b.prix && `${b.prix} €`); add('Note', b.note && `${b.note} / 20`);
  openSheet(`${b.nom || 'Sans nom'}${b.millesime ? ' · ' + b.millesime : ''}`, `
    <div class="loc">${locText(b.id)}</div>
    ${b.photo ? `<img class="photo" src="${esc(b.photo)}" alt="Étiquette">` : ''}
    <dl class="facts">${f.join('')}</dl>
    ${b.commentaire ? `<p class="note">${esc(b.commentaire)}</p>` : ''}
    <div class="btns">
      <button class="btn primary block" data-act="edit">Modifier la fiche</button>
      <button class="btn" data-act="copy">J'ai la même ailleurs</button>
      <button class="btn" data-act="move">Déplacer</button>
      <button class="btn danger block" data-act="remove">Bouteille bue : la retirer</button>
    </div>`);
}
function showForm(id) {
  const b = bottleAt(id) || { couleur: 'rouge' };
  draftPhoto = b.photo || null;
  const v = (k) => esc(b[k] ?? '');
  openSheet(bottleAt(id) ? 'Modifier la fiche' : 'Nouvelle fiche', `
    <form id="form" data-id="${id}" autocomplete="off">
      <div class="loc">${locText(id)}</div>
      <div class="field">Étiquette
        <div id="photoZone">${draftPhoto ? `<img class="photo" src="${esc(draftPhoto)}" alt="">` : ''}</div>
        <div class="btns"><button type="button" class="btn" data-act="photo">${draftPhoto ? 'Changer la photo' : 'Photographier l\'étiquette'}</button>
        ${draftPhoto ? '<button type="button" class="btn danger" data-act="nophoto">Retirer</button>' : ''}</div>
      </div>
      <label>Nom / Domaine / Château<input name="nom" value="${v('nom')}" placeholder="Château Margaux" required></label>
      <div class="field">Couleur
        <div class="chips" id="chips">${Object.entries(TYPES).map(([k, t]) =>
          `<button type="button" class="chip${(b.couleur || 'rouge') === k ? ' on' : ''}" data-couleur="${k}"><span class="dot" style="background:${t.css}"></span>${t.nom}</button>`).join('')}</div>
      </div>
      <div class="two">
        <label>Millésime<input name="millesime" value="${v('millesime')}" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="2015"></label>
        <label>À boire jusqu'en<input name="apogee" value="${v('apogee')}" placeholder="2030"></label>
      </div>
      <label>Appellation<input name="appellation" value="${v('appellation')}" placeholder="Margaux"></label>
      <div class="two">
        <label>Région<input name="region" value="${v('region')}" placeholder="Bordeaux"></label>
        <label>Cépage<input name="cepage" value="${v('cepage')}" placeholder="Cabernet…"></label>
      </div>
      <div class="two">
        <label>Prix (€)<input name="prix" value="${v('prix')}" inputmode="decimal"></label>
        <label>Note (/20)<input name="note" value="${v('note')}" inputmode="decimal"></label>
      </div>
      <label>Commentaires<textarea name="commentaire" placeholder="Offerte par…, à ouvrir pour…">${v('commentaire')}</textarea></label>
      <div class="btns"><button type="button" class="btn" data-act="cancel">Annuler</button><button type="submit" class="btn primary">Enregistrer</button></div>
    </form>`, true);
}
function formDraft() {
  const f = $('form'); if (!f) return null;
  const d = Object.fromEntries(new FormData(f).entries());
  d.couleur = f.querySelector('.chip.on')?.dataset.couleur || 'rouge';
  return d;
}
function redrawForm(d) {
  const id = $('form').dataset.id, keep = draftPhoto, scroll = $('sheetBody').scrollTop, title = $('sheetTitle').textContent;
  const backup = records.get(id); records.set(id, { ...backup, ...d, id, photo: keep });
  showForm(id); $('sheetTitle').textContent = title;
  if (backup) records.set(id, backup); else records.delete(id);
  draftPhoto = keep; $('sheetBody').scrollTop = scroll;
}
const reselect = () => selected ? selectSlot(selected.key, selected.c, selected.r) : closeSheet();

$('sheetBody').addEventListener('click', async (e) => {
  const chip = e.target.closest('[data-couleur]');
  if (chip) { $('chips').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === chip)); return; }
  const row = e.target.closest('[data-goto]');
  if (row) { const { k, c, r } = parseId(row.dataset.goto); selectSlot(k, c, r); return; }
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
  const id = selected?.id, b = id && bottleAt(id);
  if (['add', 'edit', 'remove', 'copy', 'move'].includes(act) && (!id || (act !== 'add' && !b))) return closeSheet();
  if (act === 'add' || act === 'edit') showForm(id);
  else if (act === 'cancel') reselect();
  else if (act === 'photo') $('photoInput').click();
  else if (act === 'nophoto') { const d = formDraft(); draftPhoto = null; redrawForm(d); }
  else if (act === 'remove') {
    if (!await ask(`Retirer « ${b.nom} » de la cave ? Sa fiche sera supprimée.`)) return;
    await deleteRecord(id); refresh(); closeSheet(); toast('Bouteille retirée');
  }
  else if (act === 'copy' || act === 'move') startMode(act, b);
  else if (act === 'inventory') showInventory();
  else if (act === 'config') showConfig();
  else if (act === 'export') exportData();
  else if (act === 'import') $('importInput').click();
  else if (act === 'install') showInstall();
  else if (act === 'menu') showMenu();
  else if (act === 'demo') { await seedDemo(); refresh(); showMenu(); toast('Bouteilles d\'exemple ajoutées'); }
  else if (act === 'cleardemo') { if (!await ask('Retirer toutes les bouteilles d\'exemple ?')) return; await clearDemo(); refresh(); showMenu(); }
});
$('sheetBody').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id === 'form') {
    const id = e.target.dataset.id, d = formDraft(), old = bottleAt(id);
    for (const k in d) d[k] = String(d[k]).trim();
    if (!d.nom) return toast('Indiquez au moins le nom');
    await saveRecord({ ...old, ...d, id, photo: draftPhoto, ajout: old?.ajout || Date.now() });
    refresh(); const { k, c, r } = parseId(id); selectSlot(k, c, r); toast('Fiche enregistrée');
  } else if (e.target.id === 'configForm') {
    const d = Object.fromEntries(new FormData(e.target).entries());
    const next = normalizeConfig({ nom: (d.nom || '').trim(), cols: d.cols, rowsMur: d.rowsMur, rowsIlot: d.rowsIlot }), sizes = rackSizes(next);
    const lost = allBottles().filter((b) => { const { k, c, r } = parseId(b.id); return c >= sizes[k].cols || r >= sizes[k].rows; }).length;
    if (lost && !await ask(`${lost} bouteille(s) enregistrée(s) se trouvent hors des nouvelles dimensions. Leurs fiches sont conservées mais ne seront plus visibles tant que vous n'agrandissez pas. Continuer ?`)) return;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next)); location.reload();
  }
});

// Photo de l'étiquette : réduite et stockée dans la fiche
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
  } catch { toast('Impossible de lire cette photo'); }
});

// Modes « j'ai la même ailleurs » et « déplacer »
function startMode(type, b) {
  if (!b) return;
  mode = { type, source: { ...b } };
  $('bannerText').textContent = type === 'copy' ? `Touchez chaque emplacement où se trouve aussi « ${b.nom} »` : `Touchez le nouvel emplacement de « ${b.nom} »`;
  $('banner').hidden = false; closeSheet();
}
function endMode() { mode = null; $('banner').hidden = true; }
$('bannerDone').onclick = endMode;

// ---------- Recherche ----------
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function haystack(b) { return norm([b.nom, b.millesime, b.appellation, b.region, b.cepage, typeOf(b).nom, b.commentaire].join(' ')); }
function sortBottles(a, b) { return norm(a.nom).localeCompare(norm(b.nom)) || String(a.millesime).localeCompare(String(b.millesime)) || a.id.localeCompare(b.id); }
function rowHtml(b) {
  return `<button class="row" data-goto="${b.id}"><span class="dot" style="background:${typeOf(b).css}"></span>
    <span class="main"><div class="n">${esc(b.nom || 'Sans nom')}</div><div class="s">${esc(b.appellation ? b.appellation + ' — ' : '')}${locShort(b.id)}</div></span>
    <span class="y">${esc(b.millesime || '')}</span></button>`;
}
function runSearch(show = true) {
  const q = norm($('search').value.trim()); $('searchClear').hidden = !q;
  if (!q) { highlighted = []; rebuildRings(); $('results').hidden = true; return; }
  const words = q.split(/\s+/);
  const found = allBottles().filter((b) => { const h = haystack(b); return words.every((w) => h.includes(w)); }).sort(sortBottles);
  highlighted = found.map((b) => b.id); rebuildRings();
  if (!show) return;
  $('results').innerHTML = found.length ? found.slice(0, 80).map(rowHtml).join('') + (found.length > 80 ? `<div class="empty">… et ${found.length - 80} autres</div>` : '')
    : '<div class="empty">Aucune bouteille enregistrée ne correspond</div>';
  $('results').hidden = false; $('sheet').hidden = true; hideHero();
}
$('search').addEventListener('input', () => runSearch());
$('search').addEventListener('focus', () => { if ($('search').value.trim()) runSearch(); });
$('search').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('search').blur(); });
$('searchClear').onclick = () => { $('search').value = ''; runSearch(); };
$('results').addEventListener('click', (e) => {
  const row = e.target.closest('[data-goto]'); if (!row) return;
  $('search').blur(); $('results').hidden = true;
  const { k, c, r } = parseId(row.dataset.goto); selectSlot(k, c, r);
});

// ---------- Barre du bas : choisir la vue ----------
$('nav').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.view; if (!v) return;
  closeSheet(); $('results').hidden = true;
  if (v === 'overview') showOverview(); else showRack(v);
});

// ---------- Menu ----------
$('menuBtn').onclick = showMenu;
function showMenu() {
  closeSheet();
  const total = Object.values(racks).reduce((s, r) => s + r.cols * r.rows, 0);
  const n = allBottles().filter((b) => { const p = parseId(b.id); return inRack(p.k, p.c, p.r); }).length;
  openSheet(config.nom, `
    <div class="stats"><div class="stat"><b>${n}</b><span>bouteilles enregistrées</span></div><div class="stat"><b>${total - n}</b><span>emplacements sans fiche</span></div></div>
    <div class="btns">
      <button class="btn block" data-act="inventory">Liste de mes bouteilles</button>
      <button class="btn block" data-act="config">Dimensions des casiers</button>
      <button class="btn block" data-act="export">Sauvegarder mes données</button>
      <button class="btn block" data-act="import">Restaurer une sauvegarde</button>
      <button class="btn block" data-act="install">Installer sur l'iPhone</button>
      ${[...records.values()].some((b) => b.demo) ? '<button class="btn danger block" data-act="cleardemo">Test : retirer les bouteilles d\'exemple</button>' : '<button class="btn block" data-act="demo">Test : ajouter des bouteilles d\'exemple</button>'}
    </div>`, true);
}
function showInventory() {
  const all = allBottles().sort(sortBottles), by = {};
  for (const b of all) by[b.couleur || 'rouge'] = (by[b.couleur || 'rouge'] || 0) + 1;
  openSheet('Mes bouteilles', `
    <div class="stats">${Object.entries(TYPES).filter(([k]) => by[k]).map(([k, t]) => `<div class="stat"><b>${by[k]}</b><span>${t.nom}</span></div>`).join('')}</div>
    <div class="list">${all.length ? all.map(rowHtml).join('') : '<div class="empty">Aucune bouteille enregistrée pour l\'instant. Ouvrez un casier et touchez une bouteille pour créer sa fiche.</div>'}</div>
    <div class="btns"><button class="btn block" data-act="menu">Retour</button></div>`, true);
}
function showConfig() {
  openSheet('Dimensions des casiers', `
    <p class="help">Les deux murs et l'îlot ont la même longueur. Indiquez le nombre de bouteilles en longueur, puis le nombre de rangées en hauteur. La maquette s'adapte automatiquement.</p>
    <form id="configForm">
      <label>Nom de la cave<input name="nom" value="${esc(config.nom)}" maxlength="40"></label>
      <label>Bouteilles en longueur, murs et îlot (max ${LIMITS.cols})<input name="cols" value="${config.cols}" inputmode="numeric" pattern="[0-9]*"></label>
      <div class="two">
        <label>Rangées des murs (max ${LIMITS.rowsMur})<input name="rowsMur" value="${config.rowsMur}" inputmode="numeric" pattern="[0-9]*"></label>
        <label>Rangées de l'îlot (max ${LIMITS.rowsIlot})<input name="rowsIlot" value="${config.rowsIlot}" inputmode="numeric" pattern="[0-9]*"></label>
      </div>
      <div class="btns"><button type="button" class="btn" data-act="menu">Annuler</button><button type="submit" class="btn primary">Appliquer</button></div>
    </form>`, true);
}
function showInstall() {
  openSheet('Installer sur l\'iPhone', `
    <p class="help">1. Ouvrez cette page dans <b>Safari</b>.<br>2. Touchez le bouton <b>Partager</b> (le carré avec une flèche vers le haut).<br>3. Choisissez <b>« Sur l'écran d'accueil »</b>, puis <b>Ajouter</b>.</p>
    <p class="help">L'icône « Ma Cave » apparaît alors comme une vraie application, en plein écran, et fonctionne même sans réseau dans la cave. Les fiches sont enregistrées sur l'iPhone : pensez à faire une sauvegarde de temps en temps depuis le menu.</p>
    <div class="btns"><button class="btn block" data-act="menu">Retour</button></div>`, true);
}
async function exportData() {
  const data = JSON.stringify({ app: 'ma-cave', version: 2, date: new Date().toISOString(), config, bouteilles: [...records.values()] });
  const name = `ma-cave-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: 'application/json' });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Sauvegarde Ma Cave' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Sauvegarde téléchargée');
}
$('importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.bouteilles)) throw new Error('format');
    const list = d.bouteilles.filter((b) => b && !b.vide && typeof b.id === 'string' && /^(G|IG|ID|D):\d+:\d+$/.test(b.id))
      .map((b) => ({ ...b, photo: typeof b.photo === 'string' && b.photo.startsWith('data:image/') ? b.photo : null }));
    if (!await ask(`Restaurer cette sauvegarde (${list.length} bouteille(s) enregistrée(s)) ? Les données actuelles seront remplacées.`)) return;
    await dbOp('readwrite', (s) => { s.clear(); for (const b of list) s.put(b); });
    if (d.config) localStorage.setItem(CONFIG_KEY, JSON.stringify(normalizeConfig(d.config)));
    location.reload();
  } catch { toast('Ce fichier n\'est pas une sauvegarde valide'); }
});

// ---------- Bouteilles d'exemple (uniquement pour tester) ----------
const DEMO = [
  ['Château Margaux', 'Margaux', 'Bordeaux', 'rouge'], ['Château Lynch-Bages', 'Pauillac', 'Bordeaux', 'rouge'], ['Domaine Tempier', 'Bandol', 'Provence', 'rose'],
  ['Clos des Papes', 'Châteauneuf-du-Pape', 'Rhône', 'rouge'], ['Domaine Leflaive', 'Puligny-Montrachet', 'Bourgogne', 'blanc'], ['William Fèvre', 'Chablis Grand Cru', 'Bourgogne', 'blanc'],
  ['Bollinger', 'Champagne', 'Champagne', 'bulles'], ['Château d\'Yquem', 'Sauternes', 'Bordeaux', 'liquoreux'], ['Domaine Huet', 'Vouvray', 'Loire', 'blanc'],
  ['Château de Beaucastel', 'Châteauneuf-du-Pape', 'Rhône', 'rouge'], ['Domaine Ott', 'Côtes de Provence', 'Provence', 'rose'], ['Louis Jadot', 'Gevrey-Chambertin', 'Bourgogne', 'rouge'],
];
async function seedDemo() {
  const list = [];
  for (const k of RACK_ORDER) for (let c = 0; c < racks[k].cols; c++) for (let r = 0; r < racks[k].rows; r++) {
    const id = slotId(k, c, r), x = Math.random(); if (records.has(id)) continue;
    if (x < 0.6) { const w = DEMO[Math.floor(Math.random() * DEMO.length)]; list.push({ id, nom: w[0], appellation: w[1], region: w[2], couleur: w[3], millesime: String(1998 + Math.floor(Math.random() * 25)), demo: true, ajout: Date.now() }); }
  }
  for (const b of list) records.set(b.id, b);
  await dbOp('readwrite', (s) => { for (const b of list) s.put(b); });
}
async function clearDemo() {
  const ids = [...records.values()].filter((b) => b.demo).map((b) => b.id);
  for (const id of ids) records.delete(id);
  await dbOp('readwrite', (s) => { for (const id of ids) s.delete(id); });
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

if (new URLSearchParams(location.search).has('debug')) window.__cave = { tapSlot, selectSlot, records, view, hero, camera, get heroAnim() { return heroAnim; } };   // pour les tests automatiques

// ---------- Démarrage ----------
(async function start() {
  try {
    db = await openDB();
    for (const b of (await dbOp('readonly', (s) => s.getAll())) || []) if (!b.vide) records.set(b.id, b);
  } catch (e) { console.error(e); toast('Stockage indisponible : les fiches ne seront pas enregistrées'); }
  if (db && !records.size && !localStorage.getItem('cave-demo')) { localStorage.setItem('cave-demo', '1'); await seedDemo().catch(console.error); }
  rebuildBottles(); applyVisibility(); requestAnimationFrame(frame);
  navigator.storage?.persist?.().catch(() => {});
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
