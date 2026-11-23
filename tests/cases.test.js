// Tests de la géométrie des cases maçonnées : places en quinconce, grille d'un casier, séparations, réglage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { casePlaces, rackGrid, moveSeparator, normalizeConfig, DEFAULT_CONFIG, CONFIG_REV, BOTTLE_D, CASE_MIN } from '../js/lib.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('casePlaces : case de 60 × 38 cm, 33 places dans l\'ordre de la pile', () => {
  const p = casePlaces(0.6, 0.38);
  assert.equal(p.length, 33);
  const maxX = Math.max(...p.map(([x]) => x)), minY = Math.min(...p.map(([, y]) => y));
  assert.ok(near(p[0][0], maxX) && near(p[0][1], minY), 'la première bouteille est en bas à droite');
  assert.ok(p.slice(0, 7).every(([, y]) => near(y, minY)), 'les 7 premières forment la rangée du bas');
  assert.ok(p[7][1] > minY && p[7][0] >= Math.max(...p.slice(7, 13).map(([x]) => x)), 'la 8e est la plus à droite de la 2e rangée');
  for (let i = 1; i < 7; i++) assert.ok(p[i][0] < p[i - 1][0], 'rangée du bas de droite à gauche');
  for (const [x, y] of p) {
    assert.ok(Math.abs(x) + BOTTLE_D / 2 <= 0.3 - 0.01 + 1e-9 && Math.abs(y) + BOTTLE_D / 2 <= 0.19 - 0.01 + 1e-9, 'dans la case, marge comprise');
  }
});

test('casePlaces : petites cases', () => {
  assert.equal(casePlaces(CASE_MIN, CASE_MIN).length, 1);
  assert.equal(casePlaces(0.05, 0.38).length, 0);
});

test('rackGrid : tailles régulières ou réglées', () => {
  const g = rackGrid({ style: 'cases', cols: 6, rows: 5 });
  assert.ok(near(g.W, 3.6) && near(g.H, 1.9));
  assert.equal(g.colW.length, 6); assert.equal(g.rowY.length, 5);
  const g2 = rackGrid({ style: 'cases', cols: 6, rows: 5, colW: [0.5, 0.7, 0.6, 0.6, 0.6, 0.6] });
  assert.ok(near(g2.colX[2], 1.2));
  const m = rackGrid({ style: 'metal', cols: 36, rows: 15 });
  assert.ok(near(m.W, 36 * 0.09) && near(m.rowY[1], 0.11));
});

test('moveSeparator : somme conservée et butées', () => {
  const ok = () => true;
  assert.deepEqual(moveSeparator([0.6, 0.6], 0, 0.05, ok), [0.65, 0.55]);
  assert.deepEqual(moveSeparator([0.6, 0.6], 0, 0.55, ok), [1.1, 0.1]);
  assert.deepEqual(moveSeparator([0.6, 0.6], 0, 0.9, ok), [1.1, 0.1]);   // jamais sous la taille minimale
  assert.deepEqual(moveSeparator([0.6, 0.6], 0, 0.3, (i, s) => s >= 0.5), [0.7, 0.5]);
  assert.deepEqual(moveSeparator([0.4, 0.6, 0.5], 1, -0.1, ok), [0.4, 0.5, 0.6]);
});

test('normalizeConfig : colW / rowH (révision 3)', () => {
  assert.equal(CONFIG_REV, 3); assert.equal(DEFAULT_CONFIG.rev, 3);
  const c = normalizeConfig({ rev: 3, racks: {
    G: { style: 'cases', cols: 3, rows: 2, colW: [0.5, 0.01], rowH: [0.4, 0.3, 0.2] },
    D: { style: 'metal', cols: 36, rows: 15, colW: [0.5] },
  } });
  assert.deepEqual(c.racks.G.colW, [0.5, 0.1, 0.6]);   // complété avec la largeur par défaut, 0,01 remonté à 0,10
  assert.deepEqual(c.racks.G.rowH, [0.4, 0.3]);         // coupé au nombre de rangées
  assert.equal(c.racks.D.colW, undefined);              // seulement pour les cases maçonnées
  assert.deepEqual(normalizeConfig(c), c);              // stable
});

test('moveSeparator : jamais au-delà de la taille maximale d\'une case (CASE_MAX)', () => {
  const r = moveSeparator([0.3, 1.4, 0.3], 0, -0.2, () => true);   // la case du milieu grandirait à 1,6 m
  assert.deepEqual(r, [0.2, 1.5, 0.3]);
});

// Toucher une case : dernier bord à gauche (ou sous) le doigt, sans findLastIndex (absent avant iOS 15.4)
import { lastAtMost } from '../js/lib.js';
test('lastAtMost : dernier bord à gauche ou en dessous du doigt', () => {
  const e = [0, 0.5, 1.2, 1.8];
  assert.equal(lastAtMost(e, -0.1), 0); assert.equal(lastAtMost(e, 0), 0); assert.equal(lastAtMost(e, 0.49), 0);
  assert.equal(lastAtMost(e, 0.5), 1); assert.equal(lastAtMost(e, 1.5), 2); assert.equal(lastAtMost(e, 9), 3);
  assert.equal(lastAtMost([0], 5), 0);
});
