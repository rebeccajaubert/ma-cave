// Tests de la pile des cases maçonnées : identifiants, ajout en haut, tassement au retrait, annulation, migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidId, parseId, caseIdOf, newBottleId, pileOf, pushToPile, removeFromPile, undoRemoval, normalizePile, migrateCaseRecords } from '../lib.js';

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
