// Barre « Annuler » après une suppression ou un rangement.
import { parseId, undoRemoval } from './lib.js';
import { allBottles, persistBatch, records, saved } from './data.js';
import { refresh, reselect, selected } from './sheet.js';
import { $, toast } from './util.js';

// ---------- Annuler la dernière suppression ----------
let undoTimer = null, undoState = null;   // { previous, after, count } : suppressions encore annulables
/**
 * Propose « Annuler » pendant 10 secondes après une suppression. Plusieurs suppressions rapprochées
 * s'additionnent : « Annuler » les remet toutes en place.
 * `previous` : fiches à remettre ; `after` : versions écrites par l'opération (une fiche modifiée depuis n'est pas écrasée).
 */
export function offerUndo(message, previous, after = []) {
  undoState = undoState && !undoState.run ? { previous: [...undoState.previous, ...previous], after: [...undoState.after, ...after], count: undoState.count + 1 } : { previous, after, count: 1 };
  $('undoText').textContent = undoState.count > 1 ? `${message} (${undoState.count} actions annulables)` : message;
  $('undo').hidden = false; document.body.classList.add('undo-on');
  clearTimeout(undoTimer); undoTimer = setTimeout(hideUndo, 10000);
}
/**
 * « Annuler » qui exécute sa propre remise en état (quand il ne suffit pas de remettre d'anciennes fiches). Il remplace
 * une annulation encore proposée : les deux ne se cumulent pas.
 */
export function offerUndoAction(message, run) {
  undoState = { run, previous: [], after: [], count: 1 };
  $('undoText').textContent = message;
  $('undo').hidden = false; document.body.classList.add('undo-on');
  clearTimeout(undoTimer); undoTimer = setTimeout(hideUndo, 10000);
}
function hideUndo() { clearTimeout(undoTimer); undoState = null; $('undo').hidden = true; document.body.classList.remove('undo-on'); }
$('undoBtn').onclick = async () => {
  const st = undoState; hideUndo(); if (!st) return;
  if (st.run) { try { await st.run(); } catch (e) { console.error(e); toast('Annulation impossible'); } return; }
  // Pour chaque emplacement, on remet la version la plus ancienne (avant la première suppression)
  const first = new Map(); for (const b of st.previous) if (!first.has(b.id)) first.set(b.id, b);
  // Bouteilles de cases : elles reprennent leur rang, et celles posées dessus entre-temps remontent (lib.js)
  const inPiles = [...first.values()].filter((b) => parseId(b.id).u && !records.has(b.id));
  const others = [...first.values()].filter((b) => !parseId(b.id).u);
  const ok = others.filter((b) => { const now = records.get(b.id); return !now || st.after.some((a) => a === now); });
  if (ok.length < others.length) toast('Certains emplacements ont été réutilisés entre-temps : ils sont gardés tels quels');
  const back = [...ok, ...undoRemoval(allBottles(), inPiles)];
  if (!back.length || !await persistBatch(back, [])) return;
  refresh(); if (selected) reselect(); saved('Annulé : bouteilles remises en place');
};
