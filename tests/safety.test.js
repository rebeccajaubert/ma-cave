// Tests des protections des données : copie avant mise à jour, copies gardées, rappel de sauvegarde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsSnapshot, copiesToDrop, backupReminderDue, lastLaunchedVersion, DAY_MS } from '../js/lib.js';

test('needsSnapshot : copie au premier lancement d\'une nouvelle version, s\'il y a de vraies fiches', () => {
  assert.equal(needsSnapshot('0.4.2', '0.4.3', 12), true);
  assert.equal(needsSnapshot(null, '0.4.3', 12), true);       // appareil d'avant cette protection
  assert.equal(needsSnapshot('0.4.3', '0.4.3', 12), false);   // même version : rien à copier
  assert.equal(needsSnapshot('0.4.2', '0.4.3', 0), false);    // seulement des exemples ou rien
});

test('copiesToDrop : garde les plus récentes (plus grands numéros)', () => {
  assert.deepEqual(copiesToDrop([1, 3, 2, 4], 3), [1]);
  assert.deepEqual(copiesToDrop([1, 3, 2, 4], 2).sort(), [1, 2]);
  assert.deepEqual(copiesToDrop([1, 3, 2, 4], 4), []);
  assert.deepEqual(copiesToDrop([10, 9], 3), []);
  assert.deepEqual(copiesToDrop([], 3), []);
});

test('backupReminderDue : jamais sauvegardé, ou plus d\'un mois, et pas déjà rappelé cette semaine', () => {
  const now = Date.UTC(2026, 10, 22);
  assert.equal(backupReminderDue({ now, lastBackup: null, lastReminder: null, realCount: 5 }), true);
  assert.equal(backupReminderDue({ now, lastBackup: now - 10 * DAY_MS, lastReminder: null, realCount: 5 }), false);
  assert.equal(backupReminderDue({ now, lastBackup: now - 31 * DAY_MS, lastReminder: null, realCount: 5 }), true);
  assert.equal(backupReminderDue({ now, lastBackup: now - 31 * DAY_MS, lastReminder: now - 3 * DAY_MS, realCount: 5 }), false);
  assert.equal(backupReminderDue({ now, lastBackup: now - 31 * DAY_MS, lastReminder: now - 8 * DAY_MS, realCount: 5 }), true);
  assert.equal(backupReminderDue({ now, lastBackup: null, lastReminder: null, realCount: 0 }), false);   // rien à protéger
  assert.equal(backupReminderDue({ now, lastBackup: 'abc', lastReminder: null, realCount: 5 }), true);   // valeur illisible : on rappelle
});

test('lastLaunchedVersion : sans localStorage, la dernière copie « version » fait foi (pas une copie à chaque lancement)', () => {
  const sums = [{ id: 3, raison: 'restauration' }, { id: 2, raison: 'version', vers: '0.4.3' }, { id: 1, raison: 'version', vers: '0.4.2' }];
  assert.equal(lastLaunchedVersion('0.4.4', sums), '0.4.4');            // la valeur notée gagne
  assert.equal(lastLaunchedVersion(null, sums), '0.4.3');               // stockage bloqué : la plus récente copie de version
  assert.equal(lastLaunchedVersion(null, [{ id: 1, raison: 'restauration' }]), null);
  assert.equal(lastLaunchedVersion(null, []), null);
});
