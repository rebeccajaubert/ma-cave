// Tests du déplacement de toute une case : vers une case vide, en empilant, en échangeant ; place insuffisante ; Annuler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveCase, undoMoveCase, pileOf, caseIdOf } from '../js/lib.js';

const b = (id, pile, extra = {}) => ({ id, pile, nom: id, ajout: 1, ...extra });
const apply = (list, { put, remove }) => { const m = new Map(list.map((x) => [x.id, x])); for (const r of remove) m.delete(r); for (const p of put) m.set(p.id, p); return [...m.values()]; };
const names = (list, caseId) => pileOf(list, caseId).map((x) => [x.nom, x.pile]);
const caps = { capFrom: 10, capTo: 10 };

test('moveCase : vers une case vide, même ordre, suffixes gardés, ancienne case vide', () => {
  const list = [b('G:0:0:a', 0), b('G:0:0:b', 1), b('G:0:0:c', 2), b('D:1:1', null, { quantite: 2 })];
  const op = moveCase(list, 'G:0:0', 'IG:2:3', 'stack', caps);
  const now = apply(list, op);
  assert.deepEqual(names(now, 'IG:2:3'), [['G:0:0:a', 0], ['G:0:0:b', 1], ['G:0:0:c', 2]]);
  assert.deepEqual(pileOf(now, 'IG:2:3').map((x) => x.id), ['IG:2:3:a', 'IG:2:3:b', 'IG:2:3:c']);
  assert.deepEqual(names(now, 'G:0:0'), []);
  assert.ok(now.some((x) => x.id === 'D:1:1'), 'les autres fiches ne bougent pas');
  assert.deepEqual(op.remove.sort(), ['G:0:0:a', 'G:0:0:b', 'G:0:0:c']);
});

test('moveCase : empiler par-dessus, dans le même ordre', () => {
  const list = [b('G:0:0:a', 0), b('G:0:0:b', 1), b('G:1:0:x', 0), b('G:1:0:y', 1)];
  const now = apply(list, moveCase(list, 'G:0:0', 'G:1:0', 'stack', caps));
  assert.deepEqual(names(now, 'G:1:0'), [['G:1:0:x', 0], ['G:1:0:y', 1], ['G:0:0:a', 2], ['G:0:0:b', 3]]);
  assert.deepEqual(names(now, 'G:0:0'), []);
});

test('moveCase : empiler sans assez de place -> RangeError, rien de proposé', () => {
  const list = [b('G:0:0:a', 0), b('G:0:0:b', 1), b('G:0:0:c', 2), b('G:1:0:x', 0)];
  assert.throws(() => moveCase(list, 'G:0:0', 'G:1:0', 'stack', { capFrom: 10, capTo: 3 }),
    (e) => e instanceof RangeError && e.cause.need === 3 && e.cause.free === 2);
});

test('moveCase : échanger les deux cases', () => {
  const list = [b('G:0:0:a', 0), b('G:0:0:b', 1), b('G:1:0:x', 0)];
  const now = apply(list, moveCase(list, 'G:0:0', 'G:1:0', 'swap', caps));
  assert.deepEqual(names(now, 'G:1:0'), [['G:0:0:a', 0], ['G:0:0:b', 1]]);
  assert.deepEqual(names(now, 'G:0:0'), [['G:1:0:x', 0]]);
  assert.equal(now.length, 3, 'aucune bouteille perdue ni dupliquée');
});

test('moveCase : échanger quand un contenu ne tient pas dans l\'autre case -> RangeError', () => {
  const list = [b('G:0:0:a', 0), b('G:0:0:b', 1), b('G:1:0:x', 0)];
  assert.throws(() => moveCase(list, 'G:0:0', 'G:1:0', 'swap', { capFrom: 10, capTo: 1 }), RangeError);
  assert.throws(() => moveCase(list, 'G:1:0', 'G:0:0', 'swap', { capFrom: 1, capTo: 1 }), RangeError);
});

test('moveCase : collision de suffixe -> nouvel identifiant, toujours dans la bonne case', () => {
  const list = [b('G:0:0:a', 0), b('G:1:0:a', 0)];
  const op = moveCase(list, 'G:0:0', 'G:1:0', 'swap', caps, () => 0.42);
  const now = apply(list, op);
  assert.equal(new Set(now.map((x) => x.id)).size, 2);
  assert.deepEqual(names(now, 'G:1:0'), [['G:0:0:a', 0]]);
  assert.deepEqual(names(now, 'G:0:0'), [['G:1:0:a', 0]]);
  assert.ok(now.every((x) => caseIdOf(x.id) === (x.nom === 'G:0:0:a' ? 'G:1:0' : 'G:0:0')));
});

test('moveCase : une ancienne fiche « à ranger » reste dans sa case', () => {
  const lost = { id: 'G:0:0', nom: 'Vieux', quantite: 3, aRanger: true };
  const list = [b('G:0:0:a', 0), lost];
  const now = apply(list, moveCase(list, 'G:0:0', 'G:1:0', 'stack', caps));
  assert.deepEqual(now.find((x) => x.id === 'G:0:0'), lost);
});

test('undoMoveCase : remet les deux cases comme avant, si rien n\'a changé', () => {
  for (const how of ['stack', 'swap']) {
    const list = [b('G:0:0:a', 0), b('G:0:0:b', 1), b('G:1:0:x', 0)];
    const op = moveCase(list, 'G:0:0', 'G:1:0', how, caps);
    const now = apply(list, op), u = undoMoveCase(now, op);
    const back = apply(now, u);
    assert.deepEqual(names(back, 'G:0:0'), names(list, 'G:0:0'), how);
    assert.deepEqual(names(back, 'G:1:0'), names(list, 'G:1:0'), how);
    assert.deepEqual(back.map((x) => x.id).sort(), list.map((x) => x.id).sort(), how);
  }
});

test('undoMoveCase : refusé si une des deux cases a changé depuis', () => {
  const list = [b('G:0:0:a', 0), b('G:1:0:x', 0)];
  const op = moveCase(list, 'G:0:0', 'G:1:0', 'stack', caps);
  const now = apply(list, op);
  assert.equal(undoMoveCase([...now, b('G:1:0:new', 2)], op), null);                       // bouteille ajoutée à l'arrivée
  assert.equal(undoMoveCase([...now, b('G:0:0:new', 0)], op), null);                       // bouteille ajoutée au départ
  assert.equal(undoMoveCase(now.filter((x) => x.id !== 'G:1:0:a'), op), null);              // bouteille bue
  assert.equal(undoMoveCase(now.map((x) => (x.id === 'G:1:0:a' ? { ...x, note: '18' } : x)), op), null);   // modifiée
});

test('moveCase : empiler sur une pile à trou (anciennes données) -> rangs tous distincts, par-dessus', () => {
  const list = [b('G:0:0:a', 0), b('G:1:0:x', 0), b('G:1:0:y', 1), b('G:1:0:z', 3)];
  const now = apply(list, moveCase(list, 'G:0:0', 'G:1:0', 'stack', caps));
  const ranks = pileOf(now, 'G:1:0').map((x) => x.pile);
  assert.equal(new Set(ranks).size, ranks.length, 'aucun rang en double');
  assert.equal(pileOf(now, 'G:1:0').at(-1).nom, 'G:0:0:a', 'la bouteille arrivée est en haut');
});
