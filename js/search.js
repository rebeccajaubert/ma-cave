// Recherche de bouteilles et barre du bas (choix de la vue).
import { norm, parseId, qty, caseIdOf, esc, rackOrderFromEntrance } from './lib.js';
import { stopVoice } from './autofill.js';
import { locShort } from './cases.js';
import { allBottles, bottleAt, config, rackName, typeOf } from './data.js';
import { adjust, endAdjust, hideHero, highlighted, inRack, picked, setHighlight, setPicked, showOverview, showRack } from './scene.js';
import { closeSheet, goTo, newScanToken } from './sheet.js';
import { $ } from './util.js';

// ---------- Recherche ----------
function haystack(b) { return norm([b.nom, b.millesime, b.appellation, b.region, b.cepage, typeOf(b).nom, b.commentaire].join(' ')); }
export function sortBottles(a, b) { return norm(a.nom).localeCompare(norm(b.nom)) || String(a.millesime).localeCompare(String(b.millesime)) || a.id.localeCompare(b.id); }
/** Regroupe en une ligne (« × 6 ») les bouteilles identiques (même vin, même millésime) d'une même case maçonnée. */
export function groupRows(list) {
  const out = [], seen = new Map();
  for (const b of list) {
    if (!parseId(b.id).u) { out.push({ b, ids: [b.id], n: qty(b) }); continue; }
    const key = `${caseIdOf(b.id)}|${norm(b.nom)}|${b.millesime || ''}`, g = seen.get(key);
    if (g) { g.ids.push(b.id); g.n++; } else { const ng = { b, ids: [b.id], n: 1 }; seen.set(key, ng); out.push(ng); }
  }
  return out;
}
/** Emplacement qui n'existe plus avec les dimensions actuelles (casier réduit) : la fiche est gardée, mais pas dessinée. */
function outOfLayout(id) { const { k, c, r } = parseId(id); return !inRack(k, c, r); }
export function rowHtml({ b, ids, n }) {
  return `<button class="row" data-goto="${b.id}" data-ids="${ids.join(',')}"><span class="dot" style="background:${typeOf(b).css}"></span>
    <span class="main"><div class="n">${esc(b.nom || 'Sans nom')}</div><div class="s">${esc(b.appellation ? b.appellation + ' — ' : '')}${esc(locShort(b.id))}${b.aRanger ? ' · <b>à ranger</b>' : ''}${outOfLayout(b.id) ? ' · <b>hors du rangement actuel</b>' : ''}</div></span>
    <span class="y">${esc(b.millesime || '')}${n > 1 ? ` <small>×${n}</small>` : ''}</span></button>`;
}
export function runSearch(show = true) {
  const q = norm($('search').value.trim()); $('searchClear').hidden = !q;
  if (!q) { setPicked(false); setHighlight([]); $('results').hidden = true; return; }
  const words = q.split(/\s+/);
  const found = allBottles().filter((b) => { const h = haystack(b); return words.every((w) => h.includes(w)); }).sort(sortBottles);
  // Après le choix d'un résultat, refresh() (enregistrement, déplacement…) garde seulement ce vin entouré ;
  // retaper ou rouvrir la recherche (show) remontre tous les résultats.
  if (show) setPicked(false);
  // (une bouteille choisie puis bue ou déplacée perd son anneau : pas d'anneau orange sur une place vide)
  setHighlight(picked ? highlighted.filter((id) => bottleAt(id)) : found.map((b) => b.id));
  if (!show) return;
  const rows = groupRows(found);
  $('results').innerHTML = rows.length ? rows.slice(0, 80).map(rowHtml).join('') + (rows.length > 80 ? `<div class="empty">… et ${rows.length - 80} autres</div>` : '')
    : '<div class="empty">Aucune bouteille enregistrée ne correspond</div>';
  // La fiche est masquée (pas fermée) : on cesse d'écouter et on ignore une lecture en cours, sinon l'enregistrement
  // continuerait à l'insu de l'utilisateur et partirait seul au bout d'une minute
  if (!$('sheet').hidden) { stopVoice(false); newScanToken(); }
  $('results').hidden = false; $('sheet').hidden = true; hideHero();
}
$('search').addEventListener('input', () => runSearch());
$('search').addEventListener('focus', () => { if ($('search').value.trim()) runSearch(); });
$('search').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('search').blur(); });
$('searchClear').onclick = () => { $('search').value = ''; runSearch(); };
$('results').addEventListener('click', (e) => {
  const row = e.target.closest('[data-goto]'); if (!row) return;
  $('search').blur(); $('results').hidden = true;
  goTo(row.dataset.goto, row.dataset.ids);
});

// ---------- Barre du bas : choisir la vue ----------
// Barre du bas : casiers de gauche à droite pour qui entre, avec leur nom vu depuis l'entrée (au fond, gauche et
// droite s'échangent ; chaque bouton garde la clé de son casier)
for (const k of rackOrderFromEntrance(config.entree)) {
  const b = $('nav').querySelector(`[data-view="${k}"]`);
  if (b) { b.innerHTML = rackName(k).replace(', côté', '').replace(' ', '<br>'); $('nav').appendChild(b); }
}
$('nav').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.view; if (!v) return;
  if (adjust) endAdjust(false);   // changer de vue abandonne le réglage en cours
  closeSheet(); $('results').hidden = true;
  if (v === 'overview') showOverview(); else showRack(v);
});
