// Tests du rangement de la cave : entrée, numéros de colonne depuis l'entrée, casiers décalés, longueur de la cave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG, colNumber, colIndex, caveLength } from '../js/lib.js';

test('normalizeConfig : ancien réglage → disposition actuelle (entrée devant, rien de décalé)', () => {
  const c = normalizeConfig({ rev: 3, racks: DEFAULT_CONFIG.racks });
  assert.equal(c.entree, 'avant'); assert.equal(c.ilotX, 0);
  for (const k of ['G', 'IG', 'ID', 'D']) assert.equal(c.racks[k].z, undefined);   // rien de décalé : réglage inchangé
  assert.equal(normalizeConfig(null).entree, 'avant');
});

test('normalizeConfig : entrée, décalages bornés et arrondis au centimètre, stable', () => {
  const c = normalizeConfig({ rev: 3, entree: 'fond', ilotX: 5, racks: { G: { style: 'cases', cols: 6, rows: 5, z: 1.234 }, D: { style: 'metal', cols: 36, rows: 15, z: -9 }, IG: { style: 'cases', cols: 6, rows: 5, z: 'x' } } });
  assert.equal(c.entree, 'fond'); assert.equal(c.ilotX, 1.1);
  assert.equal(c.racks.G.z, 1.23); assert.equal(c.racks.D.z, -4); assert.equal(c.racks.IG.z, undefined);
  assert.equal(normalizeConfig({ entree: 'cote' }).entree, 'avant');
  assert.deepEqual(normalizeConfig(c), c);
});

test('colNumber / colIndex : colonne 1 = la plus proche de l\'entrée', () => {
  assert.equal(colNumber(0, 36, 'avant'), 1); assert.equal(colNumber(35, 36, 'avant'), 36);
  assert.equal(colNumber(0, 36, 'fond'), 36); assert.equal(colNumber(35, 36, 'fond'), 1);
  for (const e of ['avant', 'fond']) for (const c of [0, 7, 35]) assert.equal(colIndex(colNumber(c, 36, e), 36, e), c);
});

test('caveLength : longueur actuelle sans décalage, agrandie pour contenir un casier décalé', () => {
  const W = { G: 3.6, IG: 3.6, ID: 3.24, D: 3.24 };
  const racks = (z = {}) => Object.entries(W).map(([k, w]) => ({ W: w, z: z[k] || 0, island: k === 'IG' || k === 'ID' }));
  const base = Math.max(Math.max(3.6, 3.24) + 1.2, Math.max(3.6, 3.24) + 0.2 + 2.8);   // formule d'avant ce chantier
  assert.ok(Math.abs(caveLength(racks()) - base) < 1e-9);
  assert.ok(Math.abs(caveLength(racks({ G: 2 })) - (2 * (2 + 1.8 + 0.6))) < 1e-9);    // mur gauche avancé de 2 m
  assert.ok(Math.abs(caveLength(racks({ G: -2 })) - caveLength(racks({ G: 2 }))) < 1e-9);   // symétrique
});
