// Cases maçonnées : chaque case est une pile de bouteilles (ajout en haut, retrait, capacité, vider).
import { parseId, pushToPile, newBottleId, removeFromPile, STYLES, DEFAULT_STYLE, RACK_NAMES } from './lib.js';
import { allBottles, persistBatch, records } from './data.js';
import { inRack, racks, rk } from './scene.js';
import { refresh } from './sheet.js';
import { offerUndo } from './undo.js';
import { toast } from './util.js';

// ---------- Cases maçonnées : chaque case est une pile de bouteilles, une fiche par bouteille ----------
// On ajoute toujours en haut de la pile ; une bouteille retirée fait descendre celles du dessus (voir lib.js).
export const isCasesRack = (k) => rk[k]?.style === 'cases';
/** Nombre de places d'une case, selon sa taille actuelle (0 si la case n'existe plus). */
export function capacityOf(caseId) { const { k, c, r } = parseId(caseId); return inRack(k, c, r) && racks[k].isCases ? racks[k].places[c][r].length : 0; }
/** Champs qui décrivent le vin (copiés d'une bouteille à l'autre). */
export const WINE_FIELDS = ['nom', 'couleur', 'millesime', 'apogee', 'appellation', 'region', 'cepage', 'prix', 'note', 'commentaire', 'photo'];
export const wineOf = (b) => Object.fromEntries(WINE_FIELDS.filter((f) => b[f] !== undefined).map((f) => [f, b[f]]));
/**
 * Ajoute `n` bouteilles du vin `wine` en haut de la pile d'une case. Rien n'est écrit s'il manque de la place.
 * @returns {Promise<object[]|null>} les fiches créées, ou null
 */
export async function addToCase(caseId, wine, n, extra = {}) {
  let ranks;
  try { ranks = pushToPile(allBottles(), caseId, n, capacityOf(caseId)); } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    toast(e.cause ? `Il ne reste que ${e.cause} place${e.cause > 1 ? 's' : ''} dans cette case` : 'Cette case est pleine');
    return null;
  }
  const now = Date.now(), base = newBottleId(caseId);
  const list = ranks.map((pile, i) => ({ ...wineOf(wine), ...extra, id: base + i.toString(36), pile, ajout: now }));
  return await persistBatch(list, []) ? list : null;
}
/**
 * Retire des bouteilles de case : leurs fiches sont supprimées et celles du dessus descendent, le tout dans une
 * seule transaction. Propose « Annuler » (sauf `undo: false`, pour l'ancienne place d'un déplacement).
 */
export async function removeBottles(ids, label, { undo = true } = {}) {
  let work = allBottles(); const puts = new Map(), removed = [];
  for (const id of ids) {
    const now = work.find((x) => x.id === id); if (!now) continue;
    removed.push(now);   // avec son rang AU MOMENT de ce retrait : « Annuler » rejoue les retraits à l'envers
    const { put, remove } = removeFromPile(work, id);
    for (const p of put) puts.set(p.id, p);
    for (const r of remove) puts.delete(r);
    work = work.filter((x) => !remove.includes(x.id)).map((x) => puts.get(x.id) || x);
  }
  if (!removed.length) return true;
  if (!await persistBatch([...puts.values()], removed.map((b) => b.id))) return false;
  refresh(); if (undo) offerUndo(label, removed);
  return true;
}

/** Type de rangement d'un casier (alvéoles, cases maçonnées…). */
export const styleOf = (k) => STYLES[rk[k]?.style] || STYLES[DEFAULT_STYLE];
export function locText(id) {
  const { k, c, r, u } = parseId(id), b = u && records.get(id);
  // Bouteille de case maçonnée : on dit aussi où elle est dans la pile (comptée depuis le coin en bas à droite)
  const inPile = b ? ` · <b>${(b.pile ?? 0) + 1}<sup>e</sup></b> bouteille en partant du coin en bas à droite` : '';
  return `<b>${RACK_NAMES[k] || k}</b> · ${styleOf(k).lieu} en colonne <b>${c + 1}</b> depuis l'entrée · rangée <b>${r + 1}</b> depuis le bas${inPile}`;
}
export function locShort(id) {
  const { k, c, r } = parseId(id);
  return `${RACK_NAMES[k] || k} · col. ${c + 1} · rang ${r + 1}`;
}
