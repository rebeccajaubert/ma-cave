// Menu, réglages, gestion d'un casier (vider), aides (bienvenue, à boire bientôt, installation).
import { parseId, caseIdOf, esc, caveSummary, totalBottles, qty, rackLimits, RACK_NAMES, STYLES, RACK_ORDER, rackGrid, rackSize, meters, clamp, recordsIn, drinkSoon } from './lib.js';
import { getApiKey } from './scan.js';
import { markHand } from './autofill.js';
import { copiesInfo, lastBackupText, storageLine, storageProtected } from './backup.js';
import { styleOf } from './cases.js';
import { DEV, TYPES, allBottles, config, persist, records } from './data.js';
import { inRack, last, racks, rk } from './scene.js';
import { groupRows, rowHtml, sortBottles } from './search.js';
import { closeSheet, lastSlot, openSheet, refresh } from './sheet.js';
import { offerUndo } from './undo.js';
import { $, APP_VERSION, ask, toast } from './util.js';

// ---------- Menu ----------
$('menuBtn').onclick = showMenu;
/** Pictogrammes au trait du menu (SVG en ligne : rien à charger, couleur héritée du texte). */
const ICONS = {
  bottle: 'M10 2h4v5l2 3v12H8V10l2-3z', glass: 'M7 3h10l-1 6a4 4 0 0 1-8 0zM12 13v7M8 21h8', grid: 'M4 4h16v16H4zM4 12h16M12 4v16',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z', help: 'M12 21a9 9 0 1 0 0-18a9 9 0 1 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  camera: 'M3 8h4l2-3h6l2 3h4v11H3zM12 17a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7z', restore: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  clock: 'M12 21a9 9 0 1 0 0-18a9 9 0 1 0 0 18zM12 7v5l3 2', phone: 'M8 2h8v20H8zM11 18h2', update: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4',
  flask: 'M9 3h6M10 3v6l-5 10h14l-5-10V3',
};
/** Une ligne du menu sombre ; `sub` (HTML déjà échappé) s'affiche en petit sous le libellé. */
function caveRow(act, icon, label, sub = '') {
  return `<button class="crow" data-act="${act}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[icon] || ''}"/></svg>`
    + `<span class="crow-t">${label}${sub ? `<small>${sub}</small>` : ''}</span><span class="crow-c" aria-hidden="true">›</span></button>`;
}
/** Menu principal : l'usage courant en deux sections ; ce qui sert rarement est dans « Réglages ». */
export function showMenu() {
  closeSheet();
  const total = Object.values(racks).reduce((s, r) => s + r.cols * r.rows, 0);
  const shown = allBottles().filter((b) => { const p = parseId(b.id); return inRack(p.k, p.c, p.r); });
  const filled = new Set(shown.map((b) => caseIdOf(b.id))).size;   // une case maçonnée compte une fois, quel que soit le nombre de bouteilles
  openSheet(config.nom, `
    <p class="cave-sum">${esc(caveSummary(totalBottles(shown), total - filled))}</p>
    <div class="cave-sec">Ma cave</div>
    ${caveRow('inventory', 'bottle', 'Mes bouteilles')}
    ${caveRow('soon', 'glass', 'À boire bientôt')}
    ${caveRow('config', 'grid', 'Rangement de la cave')}
    <div class="cave-sec">Mes données</div>
    ${caveRow('export', 'shield', 'Sauvegarder mes données', `Dernière sauvegarde : ${lastBackupText()}`)}
    ${storageProtected === false ? `<p class="cave-note warn">${storageLine()}</p>` : ''}
    ${caveRow('settings', 'sliders', 'Réglages')}
    ${caveRow('help', 'help', 'Mode d\'emploi')}
    <p class="cave-foot">Version ${esc(APP_VERSION)}</p>`, true);
  $('sheet').classList.add('cave');
}
/** Réglages : fonctions ponctuelles (clé de lecture, restauration, installation, mise à jour). */
export function showSettings() {
  closeSheet();
  const demo = [...records.values()].some((b) => b.demo);
  openSheet('Réglages', `
    ${caveRow('scan-settings', 'camera', 'Lecture automatique (photo et voix)', getApiKey() ? 'Activée' : 'Non activée')}
    ${caveRow('import', 'restore', 'Restaurer une sauvegarde')}
    ${copiesInfo.length ? caveRow('snapshots', 'clock', 'Revenir en arrière', 'Copies de sécurité') : ''}
    ${caveRow('install', 'phone', 'Installer sur l\'iPhone')}
    ${caveRow('update-check', 'update', 'Mettre à jour l\'application', `Version installée : ${esc(APP_VERSION)}`)}
    ${storageProtected === null ? '' : `<p class="cave-note${storageProtected ? '' : ' warn'}">${storageLine()}</p>`}
    ${demo ? caveRow('cleardemo', 'flask', 'Test : retirer les bouteilles d\'exemple') : DEV ? caveRow('demo', 'flask', 'Test : ajouter des bouteilles d\'exemple') : ''}
    <div class="btns"><button class="btn block" data-act="menu">Retour au menu</button></div>`, true);
  $('sheet').classList.add('cave');
}
/** Liste de toutes les fiches ; toucher une couleur filtre la liste. */
export function showInventory(filter = '') {
  const all = allBottles().sort(sortBottles), by = {};
  for (const b of all) by[b.couleur || 'rouge'] = (by[b.couleur || 'rouge'] || 0) + qty(b);
  const shown = filter ? all.filter((b) => (b.couleur || 'rouge') === filter) : all;
  openSheet(`Mes bouteilles (${totalBottles(shown)})`, `
    <div class="stats">${Object.entries(TYPES).filter(([k]) => by[k]).map(([k, t]) => `<button class="stat${filter === k ? ' on' : ''}" data-act="inv-filter" data-color="${filter === k ? '' : k}"><b>${by[k]}</b><span>${t.nom}</span></button>`).join('')}</div>
    ${filter ? `<p class="help">Filtre : ${TYPES[filter].nom}. Touchez-le à nouveau pour tout afficher.</p>` : ''}
    <div class="list">${shown.length ? groupRows(shown).map(rowHtml).join('') : '<div class="empty">Aucune bouteille enregistrée pour l\'instant. Ouvrez un casier et touchez une bouteille pour créer sa fiche.</div>'}</div>
    <div class="btns"><button class="btn block" data-act="menu">Retour</button></div>`, true);
}
/** Réglage du rangement : pour chaque casier, type de rangement, colonnes et rangées. */
export function showConfig(focus = null) {
  const block = (k) => {
    const r = rk[k], lim = rackLimits(k, r.style);
    return `<fieldset class="rackcfg" data-rack="${k}"${focus === k ? ' id="cfgFocus"' : ''}><legend>${RACK_NAMES[k]}</legend>
      <div class="chips">${Object.entries(STYLES).map(([sk, st]) => `<button type="button" class="chip${sk === r.style ? ' on' : ''}" data-style="${sk}">${st.nom}</button>`).join('')}</div>
      <input type="hidden" name="${k}_style" value="${r.style}">
      <p class="help small" data-aide>${esc(STYLES[r.style].aide)}</p>
      <p class="size" data-size>${sizeText(r.style, r.cols, r.rows, k)}</p>
      <div class="two">
        <label><span data-lab="cols">Colonnes (max ${lim.cols})</span><input name="${k}_cols" value="${r.cols}" inputmode="numeric" pattern="[0-9]*"></label>
        <label><span data-lab="rows">Rangées (max ${lim.rows})</span><input name="${k}_rows" value="${r.rows}" inputmode="numeric" pattern="[0-9]*"></label>
      </div>
      <div class="btns"><button type="button" class="btn" data-act="rack-tools" data-rack="${k}">Gérer (vider…)</button>
        ${r.style === 'cases' ? `<button type="button" class="btn" data-act="adjust" data-rack="${k}">Ajuster les séparations</button>` : ''}</div></fieldset>`;
  };
  openSheet('Rangement de la cave', `
    <p class="help">Pour chaque casier, choisissez le type de rangement puis le nombre de <b>colonnes</b> (en longueur, depuis l'entrée) et de <b>rangées</b> (en hauteur). La maquette s'adapte. Chaque casier a sa propre taille : l'îlot peut être plus court ou plus long que les murs, et les deux murs peuvent être différents.</p>
    <form id="configForm">
      <label>Nom de la cave<input name="nom" value="${esc(config.nom)}" maxlength="40"></label>
      ${RACK_ORDER.map(block).join('')}
      <div class="btns"><button type="button" class="btn" data-act="menu">Annuler</button><button type="submit" class="btn primary">Appliquer</button></div>
    </form>`, true);
  $('cfgFocus')?.scrollIntoView({ block: 'start' });
}
/** « Longueur ≈ 3,6 m · hauteur ≈ 1,9 m » pour un casier. */
function sizeText(style, cols, rows, k = null) {
  // Cases maçonnées déjà réglées à la main : la taille tient compte des séparations déplacées
  const g = k && style === 'cases' && rk[k].style === 'cases' ? rackGrid({ ...rk[k], cols, rows }) : null;
  const { length, height } = g ? { length: g.W, height: g.H } : rackSize(style, cols, rows);
  return `Longueur ≈ ${meters(length)} · hauteur ≈ ${meters(height)}`;
}
/** Met à jour la taille affichée d'un casier pendant le réglage. */
function updateSize(box) {
  const k = box.dataset.rack, v = (f) => box.querySelector(`[name="${k}_${f}"]`).value, style = v('style'), lim = rackLimits(k, style);
  // Taille bornée aux maximums du type : c'est ce qui sera réellement appliqué.
  box.querySelector('[data-size]').textContent = sizeText(style, clamp(parseInt(v('cols')) || 0, 0, lim.cols), clamp(parseInt(v('rows')) || 0, 0, lim.rows), k);
}
$('sheetBody').addEventListener('input', (e) => { const box = e.target.closest('#configForm [data-rack]'); if (box) updateSize(box); });
// Fiche : un champ tapé à la main n'est plus jamais remplacé par la voix (les valeurs posées par le code ne déclenchent pas « input »)
$('sheetBody').addEventListener('input', (e) => { if (e.target.form?.id === 'form' && e.target.name) markHand(e.target.form, e.target.name); });
/** Choix d'un type de rangement dans les réglages : met à jour l'aide et les maximums affichés. */
export function pickStyle(chip) {
  const box = chip.closest('[data-rack]'), k = box.dataset.rack, style = chip.dataset.style, lim = rackLimits(k, style);
  box.querySelectorAll('[data-style]').forEach((c) => c.classList.toggle('on', c === chip));
  box.querySelector(`[name="${k}_style"]`).value = style;
  box.querySelector('[data-aide]').textContent = STYLES[style].aide;
  box.querySelector('[data-lab="cols"]').textContent = `Colonnes (max ${lim.cols})`;
  box.querySelector('[data-lab="rows"]').textContent = `Rangées (max ${lim.rows})`;
  for (const [f, max] of [['cols', lim.cols], ['rows', lim.rows]]) {   // valeur trop grande pour ce type : ramenée au maximum, et on le dit
    const el = box.querySelector(`[name="${k}_${f}"]`);
    if ((parseInt(el.value) || 0) > max) { el.value = max; toast(`${f === 'cols' ? 'Colonnes' : 'Rangées'} ramenées à ${max} pour ce type de rangement`); }
  }
  updateSize(box);
}
/**
 * Avant d'appliquer un nouveau rangement : prévient clairement si des fiches risquent d'être mélangées
 * (type de rangement changé alors que le casier contient des fiches) ou masquées (dimensions réduites).
 */
export async function confirmConfigChange(next) {
  const all = allBottles(), warnings = [];
  for (const k of RACK_ORDER) {
    const before = rk[k], after = next.racks[k], inRackNow = recordsIn(all, k);
    if (!inRackNow.length) continue;
    if (before.style !== after.style) {
      warnings.push(`• ${RACK_NAMES[k]} : passe de « ${STYLES[before.style].nom} » à « ${STYLES[after.style].nom} » alors qu'il contient ${inRackNow.length} fiche(s). Chaque fiche reste attachée à son numéro de colonne et de rangée : avec un autre rangement, ces numéros ne désignent plus les mêmes endroits, et les bouteilles risquent d'être mélangées.`);
    }
    const hidden = inRackNow.filter((b) => { const p = parseId(b.id); return p.c >= after.cols || p.r >= after.rows; }).length;
    if (hidden) warnings.push(`• ${RACK_NAMES[k]} : ${hidden} fiche(s) seront hors des nouvelles dimensions. Elles sont conservées mais invisibles tant que vous n'agrandissez pas.`);
  }
  if (!warnings.length) return true;
  return ask(`Attention, l'arrangement risque d'être mélangé :\n\n${warnings.join('\n\n')}\n\nConseil : notez ces bouteilles ou videz d'abord le casier (menu, « Rangement de la cave », bouton « Gérer » du casier).`, 'Appliquer quand même');
}

// ---------- Gérer un casier : vider une colonne, une rangée ou tout le casier ----------
/** Outils d'un casier. Colonne et rangée sont pré-remplies avec le dernier emplacement touché. */
export function showRackTools(k) {
  if (!racks[k]) return;
  const rack = racks[k], st = styleOf(k), inIt = recordsIn(allBottles(), k);
  const last = lastSlot && lastSlot.key === k ? lastSlot : { c: 0, r: 0 };
  const stepper = (name, value, max, label) => `<div class="field">${label}
      <div class="stepper"><button type="button" class="btn" data-tstep="-1" data-for="${name}" aria-label="Moins">−</button>
      <input name="${name}" id="${name}" value="${value}" inputmode="numeric" pattern="[0-9]*" data-max="${max}" aria-label="${label}">
      <button type="button" class="btn" data-tstep="1" data-for="${name}" aria-label="Plus">+</button></div></div>`;
  openSheet(`Gérer : ${RACK_NAMES[k]}`, `
    <div class="loc">${esc(st.nom)} · ${rack.cols} colonnes × ${rack.rows} rangées · <b>${totalBottles(inIt)}</b> bouteille(s) dans <b>${inIt.length}</b> ${st.lieu}(s)</div>
    <h3>Vider une colonne</h3>
    ${stepper('toolCol', last.c + 1, rack.cols, 'Colonne (depuis l\'entrée)')}
    <div class="btns"><button class="btn danger block" data-act="clear-col">Vider cette colonne</button></div>
    <h3>Vider une rangée</h3>
    ${stepper('toolRow', last.r + 1, rack.rows, 'Rangée (depuis le bas)')}
    <div class="btns"><button class="btn danger block" data-act="clear-row">Vider cette rangée</button></div>
    <h3>Tout le casier</h3>
    <div class="btns"><button class="btn danger block" data-act="clear-rack">Vider tout le casier</button>
      <button class="btn block" data-act="config-focus" data-rack="${k}">Changer le type de rangement ou les dimensions</button></div>
    <p class="help">Vider retire les fiches (les bouteilles disparaissent de la maquette). Vous pourrez annuler juste après.</p>`, true);
  $('sheetBody').dataset.rack = k;
}
export function stepTool(btn) {
  const el = $(btn.dataset.for);
  el.value = clamp((parseInt(el.value) || 1) + (+btn.dataset.tstep), 1, +el.dataset.max);
}
/** Vide une colonne, une rangée ou tout le casier, après confirmation, avec possibilité d'annuler. */
export async function clearPart(act) {
  const k = $('sheetBody').dataset.rack, rack = racks[k]; if (!rack) return;
  const col = clamp((parseInt($('toolCol')?.value) || 1), 1, rack.cols) - 1, row = clamp((parseInt($('toolRow')?.value) || 1), 1, rack.rows) - 1;
  const what = act === 'clear-col' ? { col } : act === 'clear-row' ? { row } : {};
  const label = act === 'clear-col' ? `la colonne ${col + 1}` : act === 'clear-row' ? `la rangée ${row + 1}` : 'tout le casier';
  const list = recordsIn(allBottles(), k, what);
  if (!list.length) return toast(`Rien à vider dans ${label}`);
  if (!await ask(`Vider ${label} (${RACK_NAMES[k]}) ? ${list.length} fiche(s), ${totalBottles(list)} bouteille(s) seront retirées de la cave.`, 'Vider')) return;
  list.sort((a, b) => (b.pile ?? 0) - (a.pile ?? 0));   // cases maçonnées : « Annuler » rejoue du haut vers le bas
  const ids = list.map((b) => b.id);
  if (!await persist((st) => st.removeMany(ids))) return;
  for (const id of ids) records.delete(id);
  refresh(); showRackTools(k); offerUndo(`${totalBottles(list)} bouteille(s) retirée(s)`, list);
}

// ---------- Aides à la prise en main ----------
/** Mode d'emploi en 4 étapes, affiché au premier lancement et depuis le menu. */
export function showWelcome() {
  openSheet('Bienvenue dans Ma Cave', `
    <ol class="steps">
      <li><b>Choisissez un casier</b> : touchez-le sur la maquette, ou utilisez les boutons en bas de l'écran.</li>
      <li><b>Touchez une case</b> : elle s'affiche en grand avec ce qu'elle contient, et « Ajouter des bouteilles ». Touchez ensuite une bouteille pour voir sa fiche. Dans les casiers métalliques, touchez directement une place.</li>
      <li><b>Photographiez l'étiquette ou parlez</b> : « 🎤 Parler », puis dites ce que vous savez de la bouteille (« Château Talbot 2016, j'en ai six, offert par Paul »). La fiche se remplit toute seule ; vérifiez, puis enregistrez (à activer une fois : menu, « Réglages », « Lecture automatique »).</li>
      <li><b>Cherchez</b> une bouteille en haut de l'écran : elle s'entoure d'orange dans la cave.</li>
    </ol>
    <p class="help">Glissez un doigt pour tourner la maquette ou faire défiler un casier, écartez deux doigts pour zoomer. Tout est enregistré sur ce téléphone, au fur et à mesure.</p>
    <div class="btns"><button class="btn primary block" data-act="welcome-ok">C'est parti</button></div>`, true);
}
/** Bouteilles à boire bientôt (date « à boire jusqu'en » dépassée ou dans l'année qui vient). */
export function showSoon() {
  const year = new Date().getFullYear(), list = drinkSoon(allBottles(), year);
  openSheet(`À boire bientôt (${totalBottles(list)})`, `
    <p class="help">Bouteilles dont la date « à boire jusqu'en » est ${year + 1} ou avant.</p>
    <div class="list">${list.length ? groupRows(list).map(rowHtml).join('') : '<div class="empty">Rien d\'urgent. Pensez à remplir « À boire jusqu\'en » dans les fiches.</div>'}</div>
    <div class="btns"><button class="btn block" data-act="menu">Retour</button></div>`, true);
}
export function showInstall() {
  openSheet('Installer sur l\'iPhone', `
    <p class="help">1. Ouvrez cette page dans <b>Safari</b>.<br>2. Touchez le bouton <b>Partager</b> (le carré avec une flèche vers le haut).<br>3. Choisissez <b>« Sur l'écran d'accueil »</b>, puis <b>Ajouter</b>.</p>
    <p class="help">L'icône « Ma Cave » apparaît alors comme une vraie application, en plein écran, et fonctionne même sans réseau dans la cave. Les fiches sont enregistrées sur l'iPhone : pensez à faire une sauvegarde de temps en temps depuis le menu.</p>
    <div class="btns"><button class="btn block" data-act="settings">Retour</button></div>`, true);
}
