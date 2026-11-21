// Tests des fonctions pures (lib.js) : `npm test`
import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, norm, clamp, slotId, parseId, isValidId, normalizeConfig, DEFAULT_CONFIG, CONFIG_REV, STYLES, rackLimits, recordsIn, drinkSoon, rackSize, meters, isNewerVersion, LEGACY_CONFIG, needsLegacyConfig, realRecordCount, shouldResetDemoToVerdelot, cellLayout, qty, totalBottles, suggestions, findKnownWine, inheritableFields } from '../lib.js';

test('esc neutralise le HTML', () => {
  assert.equal(esc('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
  assert.equal(esc(null), '');
});

test('norm retire accents et majuscules', () => {
  assert.equal(norm('Château Léoville'), 'chateau leoville');
});

test('slotId / parseId / isValidId', () => {
  assert.equal(slotId('G', 12, 4), 'G:12:4');
  assert.deepEqual(parseId('IG:0:5'), { k: 'IG', c: 0, r: 5 });
  assert.ok(isValidId('D:3:2'));
  for (const bad of ['ZZ:1:1', 'G:1', 'G:a:2', '', null, 42]) assert.ok(!isValidId(bad), String(bad));
});

test('normalizeConfig : valeurs par défaut et bornes selon le type de rangement', () => {
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
  const c = normalizeConfig({ nom: 'X', racks: { G: { style: 'caisses', cols: 999, rows: 0 }, D: { style: 'inconnu', cols: 3, rows: 2 } } });
  assert.equal(c.racks.G.style, 'caisses');
  assert.equal(c.racks.G.cols, rackLimits('G', 'caisses').cols);          // borné : 8 m / 0,5 m = 16 caisses
  assert.equal(c.racks.G.rows, DEFAULT_CONFIG.racks.G.rows);              // 0 invalide : valeur par défaut
  assert.equal(c.racks.D.style, 'alveoles');                              // type inconnu : alvéoles
  assert.deepEqual(c.racks.IG, DEFAULT_CONFIG.racks.IG);                  // casier absent : valeur par défaut
});

test('normalizeConfig : anciens formats v1 et v3', () => {
  const v3 = normalizeConfig({ nom: 'Cave', cols: 10, rowsMur: 4, rowsIlot: 7 });
  assert.deepEqual(v3.racks.G, { style: 'alveoles', cols: 10, rows: 4 });
  assert.deepEqual(v3.racks.ID, { style: 'alveoles', cols: 10, rows: 7 });
  const v1 = normalizeConfig({ nom: 'La Cave de Papa', racks: { G: { cols: 12, rows: 5 }, IG: { cols: 8, rows: 6 } } });
  assert.equal(v1.nom, DEFAULT_CONFIG.nom);
  assert.deepEqual(v1.racks.IG, { style: 'alveoles', cols: 8, rows: 6 });
});

test('rackLimits : les murs sont moins hauts que l\'îlot', () => {
  assert.deepEqual(rackLimits('G', 'alveoles'), { cols: 40, rows: 10 });
  assert.deepEqual(rackLimits('IG', 'alveoles'), { cols: 40, rows: 12 });
  assert.deepEqual(rackLimits('D', 'caisses'), { cols: 16, rows: 5 });
  assert.deepEqual(rackLimits('D', 'metal'), { cols: 88, rows: 18 });
  for (const k of Object.keys(STYLES)) assert.ok(STYLES[k].defaut >= 1 && STYLES[k].lieu, k);
  for (const k of ['G', 'IG', 'ID', 'D']) {   // la configuration par défaut respecte les limites
    const r = DEFAULT_CONFIG.racks[k], lim = rackLimits(k, r.style);
    assert.ok(r.cols <= lim.cols && r.rows <= lim.rows, k);
  }
});

test('recordsIn : casier, colonne, rangée', () => {
  const list = [{ id: 'G:0:0' }, { id: 'G:0:1' }, { id: 'G:1:1' }, { id: 'D:0:0' }, { id: 'abc' }];
  assert.equal(recordsIn(list, 'G').length, 3);
  assert.deepEqual(recordsIn(list, 'G', { col: 0 }).map((b) => b.id), ['G:0:0', 'G:0:1']);
  assert.deepEqual(recordsIn(list, 'G', { row: 1 }).map((b) => b.id), ['G:0:1', 'G:1:1']);
  assert.deepEqual(recordsIn(list, 'G', { col: 1, row: 1 }).map((b) => b.id), ['G:1:1']);
  assert.equal(recordsIn(list, 'IG').length, 0);
});

test('drinkSoon : apogée dépassée ou proche, la plus urgente d\'abord', () => {
  const list = [{ nom: 'A', apogee: '2030' }, { nom: 'B', apogee: '2027' }, { nom: 'C', apogee: 'avant 2025' }, { nom: 'D' }, { nom: 'E', apogee: '2026' }];
  assert.deepEqual(drinkSoon(list, 2026).map((b) => b.nom), ['C', 'E', 'B']);
});

test('qty : au moins 1, au plus 99, texte accepté', () => {
  assert.equal(qty({}), 1);
  assert.equal(qty({ quantite: '6' }), 6);
  assert.equal(qty({ quantite: 0 }), 1);
  assert.equal(qty({ quantite: -3 }), 1);
  assert.equal(qty({ quantite: 500 }), 99);
  assert.equal(qty(undefined), 1);
});

test('totalBottles additionne les quantités', () => {
  assert.equal(totalBottles([{ quantite: 6 }, {}, { quantite: '2' }]), 9);
  assert.equal(totalBottles([]), 0);
});

test('suggestions : sans doublon (accents/casse), plus fréquentes d\'abord', () => {
  const list = [{ appellation: 'Margaux' }, { appellation: 'margaux' }, { appellation: 'Chablis' }, { appellation: ' ' }, {}, { appellation: 'Médoc' }];
  assert.deepEqual(suggestions(list, 'appellation'), ['Margaux', 'Chablis', 'Médoc']);
});

test('findKnownWine : fiche la plus récente, insensible aux accents', () => {
  const list = [{ nom: 'Clos Test', region: 'A', ajout: 1 }, { nom: 'clos  test'.replace('  ', ' '), region: 'B', ajout: 5 }, { nom: 'Autre', ajout: 9 }];
  assert.equal(findKnownWine(list, 'CLOS TEST').region, 'B');
  assert.equal(findKnownWine(list, 'inconnu'), null);
  assert.equal(findKnownWine(list, '  '), null);
});

test('findKnownWine préfère le même millésime, puis la fiche la plus récente', () => {
  const list = [
    { nom: 'Margaux', millesime: '2010', prix: '120', ajout: 9 },
    { nom: 'Margaux', millesime: '2018', prix: '90', ajout: 1 },
  ];
  assert.equal(findKnownWine(list, 'margaux', '2018').prix, '90');   // même millésime, même si plus ancienne
  assert.equal(findKnownWine(list, 'margaux', '2015').prix, '120');  // aucun millésime identique : la plus récente
  assert.equal(findKnownWine(list, 'margaux').prix, '120');
});

test('inheritableFields : prix et garde seulement pour le même millésime', () => {
  const known = { nom: 'Margaux', millesime: '2010', appellation: 'Margaux', region: 'Bordeaux', cepage: '', couleur: 'rouge', apogee: '2025', prix: '120' };
  assert.deepEqual(inheritableFields(known, '2018'), { appellation: 'Margaux', region: 'Bordeaux', couleur: 'rouge' });
  assert.deepEqual(inheritableFields(known, '2010'), { appellation: 'Margaux', region: 'Bordeaux', couleur: 'rouge', apogee: '2025', prix: '120' });
  assert.deepEqual(inheritableFields(known, ''), { appellation: 'Margaux', region: 'Bordeaux', couleur: 'rouge' });
  assert.deepEqual(inheritableFields(null, '2010'), {});
});

test('needsLegacyConfig : ancien réglage seulement si des fiches existent sans réglage enregistré', () => {
  assert.equal(needsLegacyConfig(false, 12), true);
  assert.equal(needsLegacyConfig(false, 0), false);    // première installation : réglage de Verdelot
  assert.equal(needsLegacyConfig(true, 12), false);    // réglage déjà choisi : on n'y touche pas
  assert.deepEqual(normalizeConfig(LEGACY_CONFIG), LEGACY_CONFIG);   // l'ancien réglage est valide
});

test('cellLayout : nombre de bouteilles visibles et échelle par type', () => {
  for (const k of Object.keys(STYLES)) {
    const { s, pts } = cellLayout(k), st = STYLES[k];
    assert.ok(s > 0 && s <= 1, k);
    assert.ok(pts.length >= 1, k);
    for (const [x, y] of pts) assert.ok(Math.abs(x) <= st.w / 2 && Math.abs(y) <= st.h / 2, `${k} : bouteille hors de l'emplacement`);
  }
  assert.equal(cellLayout('metal').pts.length, 1);
  assert.ok(0.165 * cellLayout('metal').s <= Math.min(STYLES.metal.w, STYLES.metal.h) + 1e-9, 'le culot doit tenir dans une place de casier métallique');
  assert.equal(cellLayout('cases').pts.length, 14);
  assert.equal(cellLayout('inconnu').pts.length, cellLayout('alveoles').pts.length);
});

test('rackSize / meters : chaque casier a sa propre taille', () => {
  assert.deepEqual(rackSize('cases', 3, 4), { length: 3 * STYLES.cases.w, height: 4 * STYLES.cases.h });
  assert.ok(Math.abs(rackSize('metal', 60, 12).length - 5.4) < 1e-9);
  assert.deepEqual(rackSize('inconnu', 'x', null), { length: 0, height: 0 });
  assert.equal(meters(5.4), '5,4 m');
  assert.equal(meters(1.84), '1,8 m');
});

test('isNewerVersion : compare numériquement, ignore ce qui est illisible', () => {
  assert.equal(isNewerVersion('0.3.1', '0.3.0'), true);
  assert.equal(isNewerVersion('0.3.10', '0.3.9'), true);   // pas un tri alphabétique
  assert.equal(isNewerVersion('1.0.0', '0.9.9'), true);
  assert.equal(isNewerVersion('0.3.0', '0.3.0'), false);
  assert.equal(isNewerVersion('0.2.9', '0.3.0'), false);
  assert.equal(isNewerVersion('?', '0.3.0'), false);
  assert.equal(isNewerVersion(null, '0.3.0'), false);
});

test('shouldResetDemoToVerdelot : seulement un appareil de test (exemples seuls) sur l\'ancien rangement', () => {
  const demo = [{ id: 'G:0:0', demo: true }, { id: 'D:3:2', demo: true }];
  const real = [...demo, { id: 'IG:1:1', nom: 'Vraie bouteille' }];
  assert.equal(realRecordCount(real), 1);
  assert.equal(shouldResetDemoToVerdelot(LEGACY_CONFIG, demo), true);     // téléphone de test bloqué en alvéoles
  assert.equal(shouldResetDemoToVerdelot(null, demo), true);              // exemples d'une ancienne version, sans réglage
  assert.equal(shouldResetDemoToVerdelot(LEGACY_CONFIG, real), false);    // une vraie fiche : on ne touche à rien
  assert.equal(shouldResetDemoToVerdelot(DEFAULT_CONFIG, demo), false);   // déjà au format Verdelot
  assert.equal(shouldResetDemoToVerdelot(LEGACY_CONFIG, []), false);      // rien à remettre en forme
  assert.equal(shouldResetDemoToVerdelot({ ...LEGACY_CONFIG, nom: 'Autre nom' }, demo), true);   // le nom ne compte pas
});

test('normalizeConfig : casiers métalliques à 15 rangées (0.3.4)', () => {
  assert.equal(DEFAULT_CONFIG.racks.ID.rows, 15);
  assert.equal(DEFAULT_CONFIG.racks.D.rows, 15);
  // Ancien réglage d'origine (36 × 12, sans numéro de révision) : passe à 15 rangées. Les rangées se comptent
  // depuis le bas, donc les fiches existantes ne bougent pas.
  const old = normalizeConfig({ nom: 'X', racks: { ...DEFAULT_CONFIG.racks, ID: { style: 'metal', cols: 36, rows: 12 }, D: { style: 'metal', cols: 36, rows: 12 } } });
  assert.equal(old.racks.ID.rows, 15);
  assert.equal(old.racks.D.rows, 15);
  // Une valeur choisie par l'utilisateur n'est pas touchée
  const mine = normalizeConfig({ racks: { D: { style: 'metal', cols: 30, rows: 12 }, ID: { style: 'metal', cols: 36, rows: 10 } } });
  assert.equal(mine.racks.D.rows, 12);
  assert.equal(mine.racks.ID.rows, 10);
  // Une fois converti (révision enregistrée), 36 × 12 redevient un choix délibéré
  const chosen = normalizeConfig({ ...old, racks: { ...old.racks, D: { style: 'metal', cols: 36, rows: 12 } } });
  assert.equal(chosen.racks.D.rows, 12);
  // Et la conversion est stable
  assert.deepEqual(normalizeConfig(old), old);
});

test('normalizeConfig : un 36 × 12 choisi dans le formulaire (rev fourni) est conservé', () => {
  const c = normalizeConfig({ nom: 'X', rev: CONFIG_REV, racks: { ...DEFAULT_CONFIG.racks, D: { style: 'metal', cols: 36, rows: 12 } } });
  assert.equal(c.racks.D.rows, 12);
});
