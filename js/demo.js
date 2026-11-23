// Bouteilles d'exemple (mode développement seulement).
import { RACK_ORDER, slotId, pileOf, newBottleId, parseId, caseIdOf, normalizePile, realRecordCount, migrateCaseRecords } from './lib.js';
import { capacityOf, isCasesRack, styleOf } from './cases.js';
import { DEV, allBottles, persist, persistBatch, records } from './data.js';
import { racks } from './scene.js';

// ---------- Bouteilles d'exemple (uniquement pour tester) ----------
export const DEMO = [
  ['Château Margaux', 'Margaux', 'Bordeaux', 'rouge'], ['Château Lynch-Bages', 'Pauillac', 'Bordeaux', 'rouge'], ['Domaine Tempier', 'Bandol', 'Provence', 'rose'],
  ['Clos des Papes', 'Châteauneuf-du-Pape', 'Rhône', 'rouge'], ['Domaine Leflaive', 'Puligny-Montrachet', 'Bourgogne', 'blanc'], ['William Fèvre', 'Chablis Grand Cru', 'Bourgogne', 'blanc'],
  ['Bollinger', 'Champagne', 'Champagne', 'bulles'], ['Château d\'Yquem', 'Sauternes', 'Bordeaux', 'liquoreux'], ['Domaine Huet', 'Vouvray', 'Loire', 'blanc'],
  ['Château de Beaucastel', 'Châteauneuf-du-Pape', 'Rhône', 'rouge'], ['Domaine Ott', 'Côtes de Provence', 'Provence', 'rose'], ['Louis Jadot', 'Gevrey-Chambertin', 'Bourgogne', 'rouge'],
];
export async function seedDemo() {
  const list = [];
  for (const k of RACK_ORDER) {
    const st = styleOf(k);
    if (racks[k].isCases) {   // cases maçonnées : des piles de 1 à 20 bouteilles, par séries d'un même vin
      for (let c = 0; c < racks[k].cols; c++) for (let r = 0; r < racks[k].rows; r++) {
        if (Math.random() > 0.7) continue;
        const caseId = slotId(k, c, r), have = pileOf([...records.values(), ...list], caseId).length, base = newBottleId(caseId);
        const n = Math.min(capacityOf(caseId) - have, 1 + Math.floor(Math.random() * 20));
        for (let i = 0; i < n;) {
          const w = DEMO[Math.floor(Math.random() * DEMO.length)], run = 1 + Math.floor(Math.random() * 6), year = String(1998 + Math.floor(Math.random() * 25));
          for (let j = 0; j < run && i < n; j++, i++) list.push({ id: base + i.toString(36), pile: have + i, nom: w[0], appellation: w[1], region: w[2], couleur: w[3], millesime: year, apogee: String(2024 + Math.floor(Math.random() * 12)), demo: true, ajout: Date.now() });
        }
      }
      continue;
    }
    for (let c = 0; c < racks[k].cols; c++) for (let r = 0; r < racks[k].rows; r++) {
      const id = slotId(k, c, r); if (records.has(id) || Math.random() > 0.6) continue;
      const w = DEMO[Math.floor(Math.random() * DEMO.length)];
      const quantite = st.defaut > 1 ? 1 + Math.floor(Math.random() * (st.defaut + 2)) : 1;
      list.push({ id, nom: w[0], appellation: w[1], region: w[2], couleur: w[3], millesime: String(1998 + Math.floor(Math.random() * 25)), apogee: String(2024 + Math.floor(Math.random() * 12)), quantite, demo: true, ajout: Date.now() });
    }
  }
  if (await persist((st) => st.putMany(list))) for (const b of list) records.set(b.id, b);
}
/** Retire les bouteilles d'exemple (jamais les vraies fiches) ; renvoie les fiches retirées, pour « Annuler ». */
export async function clearDemo() {
  const list = [...records.values()].filter((b) => b.demo), ids = new Set(list.map((b) => b.id));
  // Une vraie bouteille posée sur des exemples descend : la pile reste sans trou (même transaction)
  const left = allBottles().filter((b) => !ids.has(b.id)), fixes = [];
  for (const caseId of new Set(list.filter((b) => parseId(b.id).u).map((b) => caseIdOf(b.id)))) fixes.push(...normalizePile(left, caseId));
  if (!await persistBatch(fixes, [...ids])) return [];
  // Pour « Annuler » : comme si on les avait retirées du haut vers le bas (chaque rang reste alors valable)
  return list.sort((a, b) => (b.pile ?? 0) - (a.pile ?? 0));
}
/**
 * Passage aux cases en pile (0.4.0). Appareil de test (seulement des exemples) : exemples régénérés au nouveau
 * format. Sinon, les anciennes fiches de cases maçonnées sont converties (une fiche par bouteille) et les rangs
 * de chaque pile remis en ordre. Rien n'est perdu : ce qui ne tient pas reste « à ranger ».
 */
export async function upgradeCases() {
  let regenerated = true; try { regenerated = !!localStorage.getItem('cave-demo-v4'); } catch { /* stockage bloqué */ }
  const all = [...records.values()];
  if (!regenerated && all.length && !realRecordCount(all)) {
    try { localStorage.setItem('cave-demo-v4', '1'); } catch { return; }
    if (await persistBatch([], all.map((b) => b.id)) && DEV) await seedDemo();   // exemples : en développement seulement
    return;
  }
  const mig = migrateCaseRecords(allBottles(), isCasesRack, capacityOf);
  if (mig.put.length || mig.remove.length) await persistBatch(mig.put, mig.remove);
  const fixes = [];
  for (const caseId of new Set(allBottles().filter((b) => parseId(b.id).u).map((b) => caseIdOf(b.id)))) fixes.push(...normalizePile(allBottles(), caseId));
  if (fixes.length) await persistBatch(fixes, []);
  try { localStorage.setItem('cave-demo-v4', '1'); } catch { /* stockage bloqué */ }
}

document.addEventListener('gesturestart', (e) => e.preventDefault());
