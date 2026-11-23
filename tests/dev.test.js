// Bouteilles d'exemple réservées au développement : jamais sur le téléphone d'un utilisateur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDevMode } from '../js/lib.js';

test('isDevMode : serveur local ou ?debug seulement', () => {
  assert.equal(isDevMode('localhost', ''), true);
  assert.equal(isDevMode('127.0.0.1', ''), true);
  assert.equal(isDevMode('[::1]', ''), true);
  assert.equal(isDevMode('cave.localhost', ''), true);
  assert.equal(isDevMode('rebeccajaubert.github.io', ''), false);               // le site publié
  assert.equal(isDevMode('rebeccajaubert.github.io', '?debug'), true);          // test volontaire sur le site
  assert.equal(isDevMode('rebeccajaubert.github.io', '?maj=123'), false);
  assert.equal(isDevMode('rebeccajaubert.github.io', '?nodebug=1'), false);     // pas un faux positif
  assert.equal(isDevMode('192.168.1.20', ''), false);
});
