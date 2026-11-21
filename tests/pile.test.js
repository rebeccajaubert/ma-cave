// Tests de la pile des cases maçonnées : identifiants, ajout en haut, tassement au retrait, annulation, migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidId, parseId, caseIdOf, newBottleId, pileOf, pushToPile, removeFromPile, undoRemoval, normalizePile, migrateCaseRecords, placeLost } from '../lib.js';

const b = (id, pile, extra = {}) => ({ id, pile, nom: id, ajout: 1, ...extra });

test('pile : identifiants', () => {
  assert.ok(isValidId('G:2:3:k9x'));
  assert.ok(isValidId('G:2:3'));
  assert.ok(!isValidId('G:2:3:'));
  assert.equal(parseId('IG:0:4:ab').u, 'ab');
  assert.equal(parseId('IG:0:4').u, null);
  assert.equal(caseIdOf('D:1:2:z'), 'D:1:2');
  assert.equal(caseIdOf('D:1:2'), 'D:1:2');
  const id = newBottleId('G:0:0', () => 0.5);
  assert.ok(isValidId(id), id);
  assert.equal(caseIdOf(id), 'G:0:0');
});

test('pile : ajout en haut', () => {
  const list = [b('G:0:0:a', 0), b('G:0:0:b', 1), b('G:0:0:c', 2), b('G:1:0:x', 0)];
  assert.deepEqual(pushToPile(list, 'G:0:0', 2, 33), [3, 4]);
  assert.deepEqual(pushToPile(list, 'G:5:5', 1, 33), [0]);
  assert.throws(() => pushToPile(list, 'G:0:0', 31, 33), (e) => e instanceof RangeError && e.cause === 30);
});

test('pile : retrait au milieu, ceux du dessus descendent', () => {
  const list = [b('G:0:0:a', 0), b('G:0:0:b', 1), b('G:0:0:c', 2), b('G:0:0:d', 3), b('G:1:0:x', 1)];
  const { put, remove } = removeFromPile(list, 'G:0:0:b');
  assert.deepEqual(remove, ['G:0:0:b']);
  assert.deepEqual(put.map((x) => [x.id, x.pile]).sort(), [['G:0:0:c', 1], ['G:0:0:d', 2]]);
  assert.equal(list[2].pile, 2);   // copies : rien n'est modifié en place
});

test('pile : annuler après un ajout remet la bouteille à son rang, sans doublon', () => {
  const list0 = [b('G:0:0:a', 0), b('G:0:0:b', 1), b('G:0:0:c', 2)];
  const removed = list0.filter((x) => x.id === 'G:0:0:b');
  const { put } = removeFromPile(list0, 'G:0:0:b');
  let now = [list0[0], ...put, b('G:0:0:x', 2)];   // après tassement, une nouvelle bouteille X en haut
  const fix = undoRemoval(now, removed);
  const byId = new Map(now.map((x) => [x.id, x])); for (const f of fix) byId.set(f.id, f);
  const ranks = Object.fromEntries([...byId.values()].map((x) => [x.id, x.pile]));
  assert.deepEqual(ranks, { 'G:0:0:a': 0, 'G:0:0:b': 1, 'G:0:0:c': 2, 'G:0:0:x': 3 });
});

test('pile : normalisation des rangs incohérents', () => {
  const list = [b('G:0:0:a', 0), b('G:0:0:b', 2, { ajout: 5 }), b('G:0:0:c', 2, { ajout: 3 }), b('G:0:0:d', 7)];
  const fix = normalizePile(list, 'G:0:0');
  const byId = new Map(list.map((x) => [x.id, x])); for (const f of fix) byId.set(f.id, f);
  assert.deepEqual(pileOf([...byId.values()], 'G:0:0').map((x) => [x.id, x.pile]), [['G:0:0:a', 0], ['G:0:0:c', 1], ['G:0:0:b', 2], ['G:0:0:d', 3]]);
  assert.ok(!fix.some((f) => f.id === 'G:0:0:a'));   // seules les fiches qui changent sont renvoyées
});

test('pile : migration des anciennes fiches à quantité', () => {
  const isCases = (k) => k === 'G';
  const old = { id: 'G:1:1', nom: 'Margaux', quantite: 5, ajout: 1 };
  const metal = { id: 'D:0:0', nom: 'X', quantite: 1 };
  let r = migrateCaseRecords([old, metal], isCases, () => 33, () => 0.3);
  assert.deepEqual(r.remove, ['G:1:1']);
  assert.equal(r.put.length, 5);
  assert.deepEqual(r.put.map((x) => x.pile), [0, 1, 2, 3, 4]);
  assert.ok(r.put.every((x) => caseIdOf(x.id) === 'G:1:1' && x.quantite === undefined && x.nom === 'Margaux'));
  assert.equal(new Set(r.put.map((x) => x.id)).size, 5);
  r = migrateCaseRecords([old], isCases, () => 3, Math.random);
  assert.equal(r.put.filter((x) => x.id !== 'G:1:1').length, 3);
  const rest = r.put.find((x) => x.id === 'G:1:1');
  assert.equal(rest.quantite, 2); assert.equal(rest.aRanger, true);
  assert.deepEqual(r.remove, []);
});

// Rejoue des retraits successifs comme l'app (rang au moment de chaque retrait), puis « Annuler » de tout.
function removeAll(list, ids) {
  let work = [...list]; const removed = [];
  for (const id of ids) {
    removed.push(work.find((x) => x.id === id));
    const { put, remove } = removeFromPile(work, id), m = new Map(put.map((p) => [p.id, p]));
    work = work.filter((x) => !remove.includes(x.id)).map((x) => m.get(x.id) || x);
  }
  return { work, removed };
}
const apply = (list, fix) => { const m = new Map(list.map((x) => [x.id, x])); for (const f of fix) m.set(f.id, f); return [...m.values()]; };

test('pile : annuler deux retraits au même rang (bouteille du bas bue deux fois)', () => {
  const list0 = [b('G:0:0:a', 0), b('G:0:0:b', 1), b('G:0:0:c', 2)];
  const { work, removed } = removeAll(list0, ['G:0:0:a', 'G:0:0:b']);   // a au rang 0, puis b descendu au rang 0
  const back = pileOf(apply(work, undoRemoval(work, removed)), 'G:0:0').map((x) => [x.id, x.pile]);
  assert.deepEqual(back, [['G:0:0:a', 0], ['G:0:0:b', 1], ['G:0:0:c', 2]]);
});

test('pile : annuler un retrait puis « Vider cette case »', () => {
  const list0 = [b('G:0:0:a', 0), b('G:0:0:b', 1), b('G:0:0:c', 2), b('G:0:0:d', 3)];
  const first = removeAll(list0, ['G:0:0:c']);                                    // c au rang 2 ; d descend au rang 2
  const second = removeAll(first.work, pileOf(first.work, 'G:0:0').map((x) => x.id).reverse());   // vider : du haut vers le bas
  const removed = [...first.removed, ...second.removed];
  const back = pileOf(apply(second.work, undoRemoval(second.work, removed)), 'G:0:0').map((x) => [x.id, x.pile]);
  assert.deepEqual(back, [['G:0:0:a', 0], ['G:0:0:b', 1], ['G:0:0:c', 2], ['G:0:0:d', 3]]);
});

test('pile : retirer une ancienne fiche (« à ranger ») ne touche pas aux rangs de la pile', () => {
  const list = [b('G:0:0:a', 0), b('G:0:0:b', 1), { id: 'G:0:0', nom: 'Vieux', quantite: 2, aRanger: true }];
  assert.deepEqual(removeFromPile(list, 'G:0:0'), { put: [], remove: ['G:0:0'] });
});

test('pile : migration — case inexistante ignorée, fiche déjà « à ranger » non réécrite', () => {
  const isCases = (k) => k === 'G';
  const gone = { id: 'G:9:9', nom: 'Hors dimensions', quantite: 3 };
  assert.deepEqual(migrateCaseRecords([gone], isCases, () => 0), { put: [], remove: [] });
  const waiting = { id: 'G:0:0', nom: 'Attend', quantite: 2, aRanger: true };
  const full = Array.from({ length: 3 }, (_, i) => b(`G:0:0:p${i}`, i));
  assert.deepEqual(migrateCaseRecords([...full, waiting], isCases, () => 3), { put: [], remove: [] });
});

test('pile : ranger une fiche « à ranger » en haut de la pile, le reste attend', () => {
  const list = [b('G:0:0:a', 0), b('G:0:0:b', 1)], lost = { id: 'G:0:0', nom: 'Vieux', quantite: 5, aRanger: true };
  let r = placeLost([...list, lost], lost, 4, () => 0.5);   // 2 places libres sur 4
  assert.deepEqual(r.put.filter((x) => x.id !== 'G:0:0').map((x) => [x.pile, x.nom]), [[2, 'Vieux'], [3, 'Vieux']]);
  assert.deepEqual(r.put.find((x) => x.id === 'G:0:0'), { ...lost, quantite: 3 });
  assert.deepEqual(r.remove, []);
  r = placeLost([...list, lost], lost, 33);                  // tout tient : l'ancienne fiche disparaît
  assert.equal(r.put.length, 5); assert.deepEqual(r.remove, ['G:0:0']);
  assert.ok(r.put.every((x) => x.quantite === undefined && x.aRanger === undefined));
  assert.deepEqual(placeLost([...list, lost], lost, 2), { put: [], remove: [] });   // case pleine
});
