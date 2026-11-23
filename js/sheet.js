// Fiche du bas : sélection d'un emplacement, fiche d'une bouteille ou d'une case, formulaire, actions, modes « copie » et « déplacer ».
import { slotId, parseId, caseIdOf, qty, BOTTLE_D, pileOf, norm, RACK_NAMES, esc, suggestions, findKnownWine, inheritableFields, clamp, placeLost, undoPlaceLost, realRecordCount, totalBottles, RACK_ORDER, normalizeConfig, CONFIG_REV } from './lib.js';
import { getApiKey, cleanApiKey, setApiKey, clearApiKey } from './scan.js';
import { checkScanKey, markHand, runScan, runVoice, showScanSettings, showVoiceZone, startVoice, stopVoice, voice } from './autofill.js';
import { exportData, restoreCopy, showCopies } from './backup.js';
import { WINE_FIELDS, addToCase, capacityOf, isCasesRack, locText, removeBottles, styleOf, wineOf } from './cases.js';
import { CONFIG_KEY, DEV, TYPES, allBottles, bottleAt, deleteRecord, persistBatch, records, saveRecord, saved, typeOf } from './data.js';
import { clearDemo, seedDemo } from './demo.js';
import { clearPart, confirmConfigChange, pickStyle, showConfig, showInstall, showInventory, showMenu, showRackTools, showSettings, showSoon, showWelcome, stepTool } from './menu.js';
import { BOTTLE_OUT, adjust, bottleLocal, caseLocal, clampView, dFor, dMax, focusCase, focusSlot, hideHero, highlighted, inRack, presentBottle, racks, rebuildBottles, restV, rk, selRing, setHighlight, setPicked, showRack, slotWorld, startAdjust, view, viewW } from './scene.js';
import { runSearch } from './search.js';
import { pick } from './touch.js';
import { offerUndo, offerUndoAction } from './undo.js';
import { checkForUpdate } from './updates.js';
import { $, ask, toast } from './util.js';

// ---------- État de l'interface ----------
export let selected = null;   // { key, c, r, id }
export let lastSlot = null;   // dernier emplacement touché, pour pré-remplir les outils « Gérer » d'un casier
export let mode = null;       // { type: 'copy' | 'move', source: fiche }
export let draftPhoto = null;

// ---------- Toucher un emplacement ----------
export async function onTap(cx, cy) {
  const hit = pick(cx, cy);
  if (!hit) { if (!mode && !$('sheet').hidden) closeSheet(); return; }
  if (hit.type === 'rack') { closeSheet(); showRack(hit.key); return; }
  await tapSlot(hit);
}
/** Touche sur un emplacement : en mode « copie/déplacement », range la fiche ici ; sinon ouvre l'emplacement. */
let slotBusy = false;   // évite qu'un double toucher rapide range la même bouteille à deux endroits
export async function tapSlot(hit) {
  const id = slotId(hit.key, hit.c, hit.r), inCases = racks[hit.key]?.isCases;
  if (!mode) return inCases ? (hit.id ? selectBottle(hit.id) : showCase(id)) : selectSlot(hit.key, hit.c, hit.r);
  if (slotBusy) return;
  slotBusy = true;
  try {
    // On repart de la fiche actuelle : elle a pu être modifiée ou retirée depuis le début du mode.
    const src = bottleAt(mode.source.id);
    if (!src) { endMode(); return toast('Cette bouteille n\'est plus dans la cave'); }
    // Libère l'ancienne place d'un déplacement (dans une case : celles du dessus descendent)
    const freeSource = () => (parseId(src.id).u ? removeBottles([src.id], '', { undo: false }) : deleteRecord(src.id));
    if (inCases) {   // case maçonnée : la bouteille va en haut de la pile
      if (mode.type === 'move' && caseIdOf(src.id) === id) return toast('Cette bouteille est déjà dans cette case');
      const n = mode.type === 'copy' ? qty(mode.source) : qty(src);
      const added = await addToCase(id, src, n); if (!added) return;   // nouvelle place enregistrée AVANT de libérer l'ancienne
      if (mode.type === 'move') {
        if (!await freeSource()) {
          const undone = await persistBatch([], added.map((b) => b.id));
          return toast(undone ? 'Déplacement impossible : rien n\'a changé' : 'Déplacement incomplet : la bouteille est maintenant aux deux places, retirez-en une');
        }
        endMode(); refresh(); selectBottle(added[0].id); saved('Bouteille déplacée');
      } else { mode.added += n; updateBanner(); refresh(); saved(n > 1 ? `${n} bouteilles ajoutées dans cette case` : 'Enregistrée ici aussi'); }
      return;
    }
    if (bottleAt(id)) return toast('Il y a déjà une bouteille enregistrée ici');
    const copy = { ...src, quantite: mode.type === 'copy' ? qty(mode.source) : src.quantite, id, ajout: Date.now() };
    delete copy.demo; delete copy.pile;                     // une fiche rangée par l'utilisateur n'est plus une bouteille d'exemple
    if (!await saveRecord(copy)) return;                    // on enregistre la nouvelle place AVANT de libérer l'ancienne
    if (mode.type === 'move') {
      if (!await freeSource()) {                            // l'ancienne place n'a pas pu être libérée : retour arrière
        const undone = await deleteRecord(id);
        return toast(undone ? 'Déplacement impossible : rien n\'a changé' : 'Déplacement incomplet : la bouteille est maintenant aux deux places, retirez-en une');
      }
      endMode(); refresh(); selectSlot(hit.key, hit.c, hit.r); saved('Bouteille déplacée');
    } else { mode.added++; updateBanner(); refresh(); saved('Enregistrée ici aussi'); }
  } finally { slotBusy = false; }
}
export function refresh() { rebuildBottles(); if ($('search').value.trim()) runSearch(false); }

export function selectSlot(key, c, r) {
  if (!inRack(key, c, r)) return toast('Cet emplacement n\'existe plus avec les dimensions actuelles');
  if (racks[key].isCases) return showCase(slotId(key, c, r));   // une case maçonnée s'ouvre sur son contenu
  hideHero();
  const id = slotId(key, c, r); selected = { key, c, r, id }; lastSlot = selected;
  focusSlot(key, c, r);
  slotWorld(key, c, r, selRing.position).addScaledVector(racks[key].normal, BOTTLE_OUT + 0.005);
  selRing.quaternion.copy(racks[key].group.quaternion); selRing.scale.setScalar(racks[key].ringS); selRing.visible = true;
  const b = bottleAt(id);
  presentBottle(b, key, c, r);
  if (b) showCard(b); else showUnknown(id);
}
/** Bouteille d'une case maçonnée : anneau autour d'elle, elle sort de la pile, sa fiche s'ouvre. */
function selectBottle(id) {
  const b = bottleAt(id); if (!b) return;
  const { k, c, r } = parseId(id), pos = racks[k]?.isCases ? bottleLocal(b) : null;
  hideHero();
  selected = { key: k, c, r, id, caseId: caseIdOf(id) }; lastSlot = selected;
  if (pos) {
    focusCase(k, c, r);
    racks[k].group.localToWorld(selRing.position.set(pos[0], pos[1], 0)).addScaledVector(racks[k].normal, BOTTLE_OUT + 0.005);
    selRing.quaternion.copy(racks[k].group.quaternion); selRing.scale.setScalar(BOTTLE_D / 0.18); selRing.visible = true;
    presentBottle(b, k, c, r);
  } else {
    // Bouteille non dessinée (case trop pleine, dimensions réduites, rangement changé) : sa fiche reste accessible
    selRing.visible = false;
    if (racks[k] && (view.mode !== 'rack' || view.key !== k)) showRack(k);
  }
  showCard(b);
}
/**
 * Fiche « Case » : contenu de la case groupé par vin, places libres, « Ajouter des bouteilles », « Vider cette case ».
 * @param {string[]|null} hl bouteilles à allumer (ligne de liste ou de recherche touchée)
 */
function showCase(caseId, hl = null) {
  const { k, c, r } = parseId(caseId);
  if (!inRack(k, c, r)) return toast('Cet emplacement n\'existe plus avec les dimensions actuelles');
  hideHero(); selRing.visible = false;
  selected = { key: k, c, r, id: caseId, caseId }; lastSlot = selected;
  if (view.mode !== 'rack' || view.key !== k) showRack(k);
  if (hl) setHighlight(hl);
  const pile = pileOf(allBottles(), caseId), cap = capacityOf(caseId), groups = new Map();
  for (const b of pile) { const g = `${norm(b.nom)}|${b.millesime || ''}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(b); }
  const lost = bottleAt(caseId);   // ancienne fiche restée « à ranger » faute de place
  openSheet(`${RACK_NAMES[k]} · colonne ${c + 1} · rangée ${r + 1}`, `
    <div class="list">${[...groups.values()].map((g) => `<button class="row" data-hl="${g.map((b) => b.id).join(',')}"><span class="dot" style="background:${typeOf(g[0]).css}"></span>
      <span class="main"><div class="n">${esc(g[0].nom || 'Sans nom')}</div><div class="s">${esc(g[0].appellation || '')}</div></span>
      <span class="y">${esc(g[0].millesime || '')} <small>×${g.length}</small></span></button>`).join('') || '<div class="empty">Cette case est vide.</div>'}</div>
    ${lost ? `<p class="help"><b>À ranger :</b> ${qty(lost)} × ${esc(lost.nom || 'Sans nom')}${lost.millesime ? ' ' + esc(lost.millesime) : ''} (il n'y avait plus de place dans cette case).</p>
      <div class="btns"><button class="btn" data-act="lost-place">Les ranger dans cette case</button><button class="btn danger" data-act="lost-remove">Les retirer</button></div>` : ''}
    ${pile.length > cap ? `<p class="help"><b>${pile.length - cap} bouteille${pile.length - cap > 1 ? 's' : ''} de trop</b> pour cette case : ${pile.length - cap > 1 ? 'elles ne sont pas dessinées' : 'elle n\'est pas dessinée'}. Déplacez-en ou agrandissez la case.</p>
      <div class="btns"><button class="btn" data-act="over-show">Voir la bouteille en trop</button></div>` : ''}
    <p class="help">${pile.length} bouteille${pile.length > 1 ? 's' : ''} · ${Math.max(0, cap - pile.length)} place${cap - pile.length > 1 ? 's' : ''} libre${cap - pile.length > 1 ? 's' : ''}.${pile.length ? ' Touchez une bouteille dans la case pour voir sa fiche, ou une ligne pour la repérer.' : ''}</p>
    <div class="btns"><button class="btn primary block" data-act="add">Ajouter des bouteilles</button>
      ${pile.length ? '<button class="btn danger block" data-act="clear-case">Vider cette case</button>' : ''}</div>`);
  // La case en grand, au-dessus de la fiche. On part de la hauteur de la fiche (pas de sa position : elle est en
  // train de monter, animée) ; une longue liste défile, la case garde au moins 40 % de l'écran.
  focusCase(k, c, r, Math.max(window.innerHeight * 0.4, window.innerHeight - $('sheet').offsetHeight));
}
/** Ouvre ce qu'une ligne de liste désigne : la bouteille, la case (avec ces bouteilles allumées) ou l'emplacement. */
export function goTo(id, ids = '') {
  const { k, c, r, u } = parseId(id), list = ids ? ids.split(',') : [id];
  // Seules les bouteilles de la ligne choisie restent entourées : sinon une recherche large (« Chat ») laissait
  // allumés tous les « Château… » alors qu'on venait d'en choisir un.
  setPicked(true); setHighlight(list);
  // Une bouteille seule, ou une bouteille de case dans un casier qui n'est plus en cases maçonnées : sa fiche
  if (u && (list.length === 1 || !racks[k]?.isCases)) return selectBottle(id);
  if (racks[k]?.isCases) return showCase(caseIdOf(id), list);
  selectSlot(k, c, r);
}

// ---------- Fiche (panneau du bas) ----------
export let scanToken = 0;   // invalide une lecture (photo ou voix) arrivée après que le formulaire a été quitté ou redessiné
/** Nouveau jeton de lecture : toute lecture (photo ou voix) lancée avant devient caduque. */
export function newScanToken() { return ++scanToken; }

export function openSheet(title, html, tall = false) {
  stopVoice(false);   // une autre fiche (ou la même redessinée) : on n'écoute plus
  $('sheetTitle').textContent = title; $('sheetBody').innerHTML = html;
  $('sheet').classList.remove('cave');   // style sombre : posé ensuite par showMenu / showSettings seulement
  $('sheet').classList.toggle('tall', tall); $('sheet').hidden = false; $('sheetBody').scrollTop = 0;
  $('results').hidden = true;
}
export function closeSheet() {
  scanToken++; stopVoice(false);
  const had = selected; $('sheet').hidden = true; $('sheetBody').innerHTML = ''; hideHero(); selRing.visible = false; selected = null;
  // Bouteilles allumées depuis une fiche ou une liste : on les éteint en la fermant (sauf recherche en cours,
  // où la bouteille choisie reste entourée pour qu'on la retrouve)
  if (had && !$('search').value.trim() && highlighted.length) setHighlight([]);
  if (had && view.mode === 'rack') {
    // Retour au cadrage du casier (après le zoom sur une case), en restant à hauteur de la case qu'on vient de quitter
    const rack = racks[view.key];
    if (rack.isCases) { view.d = Math.min(dFor(Math.min(rack.W, viewW(rack))), dMax(rack)); view.u = caseLocal(rack, had.c, had.r)[0]; }
    view.v = restV(rack); clampView();
  }
}
$('sheetClose').onclick = closeSheet;

function showUnknown(id) {
  openSheet('Bouteille non enregistrée', `<div class="loc">${locText(id)}</div>
    <p class="help">Cet emplacement n'a pas encore de fiche : la bouteille n'a donc pas d'étiquette et n'apparaît pas dans le casier.</p>
    <div class="btns"><button class="btn primary block" data-act="add">Enregistrer cette bouteille</button></div>`);
}
function showCard(b) {
  const t = typeOf(b), q = qty(b), f = [];
  const add = (k, v) => v && f.push(`<dt>${k}</dt><dd>${esc(v)}</dd>`);
  add('Couleur', t.nom); add('Millésime', b.millesime); add('Appellation', b.appellation); add('Région', b.region);
  add('Cépage', b.cepage); add('À boire', b.apogee); add('Prix', b.prix && `${b.prix} €`); add('Note', b.note && `${b.note} / 20`);
  add('Quantité', q > 1 ? `${q} bouteilles dans cette ${styleOf(parseId(b.id).k).lieu}` : '');
  const undrawn = parseId(b.id).u && !bottleLocal(b);
  openSheet(`${b.nom || 'Sans nom'}${b.millesime ? ' · ' + b.millesime : ''}`, `
    <div class="loc">${locText(b.id)}</div>
    ${undrawn ? '<p class="help">Cette bouteille n\'est pas dessinée dans la maquette : sa case n\'a plus assez de places (ou le rangement a changé). Vous pouvez la déplacer ou la retirer.</p>' : ''}
    ${b.photo ? `<img class="photo" src="${esc(b.photo)}" alt="Étiquette">` : ''}
    <dl class="facts">${f.join('')}</dl>
    ${b.commentaire ? `<p class="note">${esc(b.commentaire)}</p>` : ''}
    <div class="btns">
      <button class="btn primary block" data-act="edit">Modifier la fiche</button>
      <button class="btn" data-act="copy">J'ai la même ailleurs</button>
      <button class="btn" data-act="move">Déplacer</button>
      <button class="btn danger block" data-act="drink">${q > 1 ? `J'ai bu une bouteille (il en restera ${q - 1})` : 'Bouteille bue : la retirer'}</button>
      ${q > 1 ? `<button class="btn danger block" data-act="remove">Vider cette ${styleOf(parseId(b.id).k).lieu} (${q} bouteilles)</button>` : ''}
    </div>`);
}

/**
 * Formulaire de fiche. `draft` permet de le réafficher (après une photo, par exemple)
 * sans perdre ce qui a déjà été saisi.
 */
function showForm(id, draft = null) {
  scanToken++;
  const { k: fk, u: fu } = parseId(id), inCase = isCasesRack(fk), st = styleOf(fk);
  // Dans une case maçonnée, `id` est soit une bouteille (modification), soit la case (ajout de bouteilles, 1 par défaut)
  const existing = inCase && !fu ? null : bottleAt(id), b = draft ?? existing ?? { couleur: 'rouge', quantite: inCase ? 1 : st.defaut };
  draftPhoto = b.photo || null;
  const v = (k) => esc(b[k] ?? ''), hasKey = !!getApiKey();
  const known = allBottles().filter((x) => x.id !== id);
  // Suggestions de saisie : valeurs déjà utilisées dans les autres fiches
  const options = (field) => suggestions(known, field).slice(0, 200).map((x) => `<option value="${esc(x)}"></option>`).join('');
  openSheet(existing ? 'Modifier la fiche' : inCase ? 'Ajouter des bouteilles' : 'Nouvelle fiche', `
    <form id="form" data-id="${id}" autocomplete="off">
      <div class="loc">${locText(id)}</div>
      <div class="field">Remplir automatiquement
        <div class="autofill">
          <button type="button" class="btn" data-act="photo"><span class="ico" aria-hidden="true">📷</span>${draftPhoto ? 'Changer la photo' : 'Photo de l\'étiquette'}</button>
          ${hasKey ? `<button type="button" class="btn" data-act="voice" id="voiceBtn"><span class="ico" aria-hidden="true">🎤</span><span class="lbl">${b._voice ? 'Reparler' : 'Parler'}</span></button>` : ''}
        </div>
        ${hasKey ? '<p class="help">Ce que vous photographiez ou dites est envoyé à Google pour remplir la fiche.</p>' : ''}
        <div id="photoZone">${draftPhoto ? `<img class="photo" src="${esc(draftPhoto)}" alt="">` : ''}</div>
        ${draftPhoto ? `<div class="btns">${hasKey ? '<button type="button" class="btn" data-act="scan">Lire l\'étiquette</button>' : ''}<button type="button" class="btn danger" data-act="nophoto">Retirer la photo</button></div>` : ''}
        <div id="voiceZone"></div>
        <div id="scanStatus" class="scan" role="status" aria-live="polite">${hasKey ? '' : 'Astuce : activez « Lecture automatique » (menu, « Réglages ») pour remplir la fiche à partir d\'une photo ou de la voix.'}</div>
      </div>
      <label>Nom / Domaine / Château<input name="nom" list="dl-nom" value="${v('nom')}" placeholder="Château Margaux" required></label>
      <div class="field">Couleur
        <div class="chips" id="chips">${Object.entries(TYPES).map(([k, t]) =>
          `<button type="button" class="chip${(b.couleur || 'rouge') === k ? ' on' : ''}" data-couleur="${k}"><span class="dot" style="background:${t.css}"></span>${t.nom}</button>`).join('')}</div>
      </div>
      ${st.unique || (inCase && fu) ? '<input type="hidden" name="quantite" value="1">' /* une seule bouteille : place de casier métallique, ou bouteille d'une case */ : `<div class="field">${inCase ? 'Nombre de bouteilles à ajouter (en haut de la pile)' : `Nombre de bouteilles dans cette ${st.lieu}`}
        <div class="stepper">
          <button type="button" class="btn" data-step="-1" aria-label="Une bouteille de moins">−</button>
          <input name="quantite" value="${qty(b)}" inputmode="numeric" pattern="[0-9]*" maxlength="2" aria-label="Nombre de bouteilles">
          <button type="button" class="btn" data-step="1" aria-label="Une bouteille de plus">+</button>
        </div>
      </div>`}
      <div class="two">
        <label>Millésime<input name="millesime" value="${v('millesime')}" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="2015"></label>
        <label>À boire jusqu'en<input name="apogee" value="${v('apogee')}" placeholder="2030"></label>
      </div>
      <label>Appellation<input name="appellation" list="dl-appellation" value="${v('appellation')}" placeholder="Margaux"></label>
      <div class="two">
        <label>Région<input name="region" list="dl-region" value="${v('region')}" placeholder="Bordeaux"></label>
        <label>Cépage<input name="cepage" list="dl-cepage" value="${v('cepage')}" placeholder="Cabernet…"></label>
      </div>
      <div class="two">
        <label>Prix (€)<input name="prix" value="${v('prix')}" inputmode="decimal"></label>
        <label>Note (/20)<input name="note" value="${v('note')}" inputmode="decimal"></label>
      </div>
      <label>Commentaires<textarea name="commentaire" placeholder="Offerte par…, à ouvrir pour…">${v('commentaire')}</textarea></label>
      <datalist id="dl-nom">${options('nom')}</datalist><datalist id="dl-appellation">${options('appellation')}</datalist>
      <datalist id="dl-region">${options('region')}</datalist><datalist id="dl-cepage">${options('cepage')}</datalist>
      <div class="btns">
        <button type="button" class="btn" data-act="cancel">Annuler</button>
        <button type="submit" name="after" value="save" class="btn primary">Enregistrer</button>
        <button type="submit" name="after" value="more" class="btn block">Enregistrer, puis ranger la même ailleurs</button>
      </div>
    </form>`, true);
  if (b._touched) $('form').dataset.colorTouched = '1';
  // Après un nouvel affichage (photo prise, photo retirée) : champs tapés à la main, champs remplis par la voix, texte compris
  if (b._hand) $('form').dataset.hand = b._hand;
  if (b._auto) $('form').dataset.auto = b._auto;
  if (b._voice) showVoiceZone(b._voice);
}
/** Valeurs actuellement saisies dans le formulaire. */
function formDraft() {
  const f = $('form'); if (!f) return null;
  const d = Object.fromEntries(new FormData(f).entries());
  d.couleur = f.querySelector('.chip.on')?.dataset.couleur || 'rouge';
  d._touched = f.dataset.colorTouched === '1';   // l'utilisateur a-t-il choisi la couleur lui-même ?
  d._hand = f.dataset.hand || ''; d._auto = f.dataset.auto || ''; d._voice = $('voiceText')?.value || '';
  return d;
}
/** Réaffiche le formulaire en gardant les saisies et la position de défilement. */
function redrawForm(d) {
  const scroll = $('sheetBody').scrollTop;
  showForm($('form').dataset.id, { ...d, photo: draftPhoto });
  $('sheetBody').scrollTop = scroll;
}
export const reselect = () => !selected ? closeSheet()
  : parseId(selected.id).u && bottleAt(selected.id) ? selectBottle(selected.id)
  : selected.caseId && racks[selected.key]?.isCases ? showCase(selected.caseId)
  : selected.caseId ? closeSheet()
  : selectSlot(selected.key, selected.c, selected.r);
export const setChip = (couleur) => $('chips')?.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.couleur === couleur));

/**
 * Si le nom correspond à un vin déjà enregistré, reprend ce qui est propre au vin (appellation, région,
 * cépage, couleur) ; le prix et la date limite de garde ne sont repris que pour le même millésime.
 * Ne remplit que les champs vides.
 */
export function prefillFromKnown(form) {
  const id = form.dataset.id, known = findKnownWine(allBottles().filter((x) => x.id !== id), form.elements.nom.value, form.elements.millesime.value);
  if (!known) return;
  const inherit = inheritableFields(known, form.elements.millesime.value);
  let n = 0;
  for (const k of ['appellation', 'region', 'cepage', 'apogee', 'prix']) {
    const el = form.elements[k]; if (inherit[k] && !el.value.trim()) { el.value = inherit[k]; n++; }
  }
  if (inherit.couleur && !form.dataset.colorTouched && !bottleAt(id)) { setChip(inherit.couleur); n++; }
  if (n) toast(`Infos reprises de « ${known.nom} »`);
}

// ---------- Actions de la fiche ----------
$('sheetBody').addEventListener('click', async (e) => {
  const styleChip = e.target.closest('[data-style]');
  if (styleChip) { pickStyle(styleChip); return; }
  const tstep = e.target.closest('[data-tstep]');
  if (tstep) { stepTool(tstep); return; }
  const chip = e.target.closest('[data-couleur]');
  if (chip) { setChip(chip.dataset.couleur); $('form').dataset.colorTouched = '1'; markHand($('form'), 'couleur'); return; }
  const step = e.target.closest('[data-step]');
  if (step) { const el = $('form').elements.quantite; el.value = clamp(qty({ quantite: el.value }) + (+step.dataset.step), 1, 99); markHand($('form'), 'quantite'); return; }
  const row = e.target.closest('[data-goto]');
  if (row) { goTo(row.dataset.goto, row.dataset.ids); return; }
  const hl = e.target.closest('[data-hl]');   // fiche Case : allumer les bouteilles d'un vin
  if (hl) { setHighlight(hl.dataset.hl.split(',')); return; }
  const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
  const id = selected?.id, b = id && bottleAt(id);
  if (['add', 'edit', 'remove', 'drink', 'copy', 'move'].includes(act) && (!id || (act !== 'add' && !b))) return closeSheet();
  if (act === 'add' || act === 'edit') showForm(id);
  else if (act === 'cancel') reselect();
  else if (act === 'photo') $('photoInput').click();
  else if (act === 'nophoto') { const d = formDraft(); draftPhoto = null; redrawForm(d); }
  else if (act === 'scan') runScan();
  else if (act === 'voice') { if (voice) stopVoice(true); else startVoice(); }
  else if (act === 'voice-text') runVoice({ text: $('voiceText')?.value || '' });
  else if ((act === 'drink' || act === 'remove') && parseId(id).u) {   // bouteille de case : celles du dessus descendent
    if (!await ask(`Retirer « ${b.nom} » de la cave ? Sa fiche sera supprimée, et les bouteilles posées dessus descendront d'une place.`, 'Retirer')) return;
    if (await removeBottles([id], 'Bouteille retirée')) { if (racks[parseId(id).k]?.isCases) showCase(caseIdOf(id)); else closeSheet(); }
  }
  else if (act === 'clear-case') {   // toute la case, y compris une ancienne fiche « à ranger »
    const caseId = selected?.caseId, pile = caseId ? pileOf(allBottles(), caseId) : [], lost = caseId && bottleAt(caseId);
    const n = pile.length + (lost ? qty(lost) : 0); if (!n) return;
    if (!await ask(`Vider cette case ? ${n} bouteille${n > 1 ? 's seront retirées' : ' sera retirée'} de la cave.`, 'Vider')) return;
    if (await removeBottles([...pile.map((b) => b.id).reverse(), ...(lost ? [lost.id] : [])], 'Case vidée')) showCase(caseId);
  }
  else if (act === 'lost-place') {   // ranger dans la pile les bouteilles d'une ancienne fiche, s'il y a de la place
    const caseId = selected?.caseId, lost = caseId && bottleAt(caseId); if (!lost) return;
    const { put, remove } = placeLost(allBottles(), lost, capacityOf(caseId));
    if (!put.length) return toast('Cette case est pleine : retirez ou déplacez d\'abord des bouteilles');
    // Une seule transaction : les nouvelles fiches et l'ancienne (réduite ou supprimée), jamais l'un sans l'autre
    if (!await persistBatch(put, remove)) return;
    const recs = put.filter((b) => b.id !== lost.id), q = qty(lost), n = recs.length;
    refresh(); showCase(caseId, recs.map((b) => b.id)); saved(n < q ? `${n} rangées, ${q - n} encore à ranger` : `${n} bouteille${n > 1 ? 's rangées' : ' rangée'}`);
    offerUndoAction(n > 1 ? 'Bouteilles rangées' : 'Bouteille rangée', async () => {
      const u = undoPlaceLost([...records.values()], lost, { put, remove });   // null si quelque chose a changé depuis
      if (!u) return toast('Annulation impossible : ces bouteilles ont été modifiées depuis');
      if (!await persistBatch(u.put, u.remove)) return;
      refresh(); if (selected?.caseId === caseId) showCase(caseId); saved('Annulé : bouteilles remises « à ranger »');
    });
  }
  else if (act === 'lost-remove') {
    const caseId = selected?.caseId, lost = caseId && bottleAt(caseId); if (!lost) return;
    if (!await ask(qty(lost) > 1 ? `Retirer ces ${qty(lost)} bouteilles « ${lost.nom || 'Sans nom'} » de la cave ?` : `Retirer la bouteille « ${lost.nom || 'Sans nom'} » de la cave ?`, 'Retirer')) return;
    if (!await deleteRecord(lost.id)) return;
    refresh(); showCase(caseId); offerUndo('Bouteilles retirées', [lost]);
  }
  else if (act === 'over-show') {   // la bouteille du haut, qui n'a plus de place dans la case
    const pile = selected?.caseId ? pileOf(allBottles(), selected.caseId) : []; if (pile.length) selectBottle(pile[pile.length - 1].id);
  }
  else if (act === 'drink' && qty(b) > 1) { const after = { ...b, quantite: qty(b) - 1 }; if (await saveRecord(after)) { refresh(); reselect(); offerUndo('Une bouteille de moins', [b], [after]); } }
  else if (act === 'drink' || act === 'remove') {
    if (!await ask(`Retirer « ${b.nom} » de la cave ? Sa fiche sera supprimée.`)) return;
    if (!await deleteRecord(id)) return;
    refresh(); closeSheet(); offerUndo('Bouteille retirée', [b]);
  }
  else if (act === 'copy' || act === 'move') startMode(act, b);
  else if (act === 'inventory') showInventory();
  else if (act === 'config') showConfig();
  else if (act === 'export') exportData();
  else if (act === 'import') $('importInput').click();
  else if (act === 'snapshots') showCopies();
  else if (act === 'snap-restore') await restoreCopy(e.target.closest('[data-snap]')?.dataset.snap);
  else if (act === 'install') showInstall();
  else if (act === 'menu') showMenu();
  else if (act === 'settings') showSettings();
  else if (act === 'config-focus') showConfig(e.target.closest('[data-rack]')?.dataset.rack);
  else if (act === 'adjust') {
    const k = e.target.closest('[data-rack]')?.dataset.rack;
    // Fiche, mode copie et résultats fermés avant le réglage (la scène ne touche pas à l'interface)
    if (racks[k]?.isCases) { closeSheet(); endMode(); $('results').hidden = true; startAdjust(k); }   // startAdjust abandonne un réglage déjà en cours
  }
  else if (act === 'rack-tools') { const k = e.target.closest('[data-rack]')?.dataset.rack; if (racks[k]) { showRack(k); showRackTools(k); } }
  else if (act === 'scan-settings') showScanSettings();
  else if (act === 'clear-col' || act === 'clear-row' || act === 'clear-rack') await clearPart(act);
  else if (act === 'soon') showSoon();
  else if (act === 'update-check') await checkForUpdate({ manual: true });
  else if (act === 'help') showWelcome();
  else if (act === 'welcome-ok') { try { localStorage.setItem('cave-bienvenue', '1'); } catch { /* sans stockage : réaffichée au prochain lancement */ } closeSheet(); }
  else if (act === 'inv-filter') showInventory(e.target.closest('[data-color]')?.dataset.color || '');
  else if (act === 'scan-save') {
    const key = cleanApiKey($('scanKey').value);
    if (!key) return toast('Collez la clé en entier (elle fait une quarantaine de caractères)');
    try { setApiKey(key); } catch { return toast('Impossible d\'enregistrer la clé sur cet appareil'); }
    await checkScanKey(key, { keep: true });
  }
  else if (act === 'scan-test') {
    const key = cleanApiKey($('scanKey').value) || getApiKey();
    if (!key) return toast('Collez d\'abord la clé');
    await checkScanKey(key, { keep: key === getApiKey() });
  }
  else if (act === 'scan-clear') { if (await ask('Désactiver la lecture automatique et effacer la clé de cet appareil ?', 'Désactiver')) { clearApiKey(); showScanSettings(); } }
  else if (act === 'demo' && DEV) {
    // Exemples par-dessus de vraies fiches : sans danger pour elles (places vides seulement), mais cela mélange
    // de fausses bouteilles aux vraies dans la cave : on demande confirmation.
    const real = realRecordCount([...records.values()]);
    if (real && !await ask(`Vous avez déjà ${real} vraie(s) fiche(s). Des bouteilles d'exemple vont se mélanger aux vôtres dans la cave.\n\nVos fiches ne sont pas modifiées : les exemples ne vont que dans les places vides, et « Retirer les bouteilles d'exemple » les enlève toutes.`, 'Ajouter quand même')) return;
    await seedDemo(); refresh(); showSettings(); toast('Bouteilles d\'exemple ajoutées');
  }
  else if (act === 'cleardemo') {
    const n = totalBottles([...records.values()].filter((b) => b.demo));
    if (!await ask(`Retirer les ${n} bouteille(s) d'exemple ? Vos vraies fiches ne sont pas touchées.`, 'Retirer')) return;
    const removed = await clearDemo(); refresh(); showSettings();
    if (removed.length) offerUndo('Exemples retirés', removed);
  }
});
// Quand on choisit (ou saisit) le nom d'un vin déjà connu, le reste de la fiche se pré-remplit.
$('sheetBody').addEventListener('change', (e) => {
  if (['nom', 'millesime'].includes(e.target.name) && e.target.form?.id === 'form') prefillFromKnown(e.target.form);
});
$('sheetBody').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.id === 'form') {
    const id = e.target.dataset.id, old = bottleAt(id), more = e.submitter?.value === 'more';
    const d = Object.fromEntries(Object.entries(formDraft()).filter(([k]) => !k.startsWith('_')));   // pas l'état du formulaire
    for (const k in d) d[k] = String(d[k]).trim();
    if (!d.nom) return toast('Indiquez au moins le nom');
    if (isCasesRack(parseId(id).k)) { await submitCaseForm(id, d, more); return; }
    const rec = { ...old, ...d, quantite: qty(d), id, photo: draftPhoto, ajout: old?.ajout || Date.now() };
    delete rec.vide; delete rec.demo;   // une fiche modifiée par l'utilisateur n'est plus une bouteille d'exemple
    if (!await saveRecord(rec)) return;   // enregistré sur l'appareil avant de confirmer
    refresh(); const { k, c, r } = parseId(id); selectSlot(k, c, r); saved('Fiche enregistrée');
    if (more) startMode('copy', rec);
  } else if (e.target.id === 'configForm') {
    const d = Object.fromEntries(new FormData(e.target).entries()), racksIn = {};
    // On garde les séparations réglées à la main (normalizeConfig les ajuste au nouveau nombre de colonnes et rangées)
    for (const k of RACK_ORDER) racksIn[k] = { style: d[`${k}_style`], cols: d[`${k}_cols`], rows: d[`${k}_rows`], colW: rk[k].colW, rowH: rk[k].rowH };
    const next = normalizeConfig({ nom: (d.nom || '').trim(), rev: CONFIG_REV, racks: racksIn });   // rev : valeurs choisies à l'instant, aucune conversion
    if (!await confirmConfigChange(next)) return;
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)); } catch { return toast('Impossible d\'enregistrer le réglage sur cet appareil (stockage bloqué)'); }
    location.reload();
  }
});

/**
 * Formulaire dans une case maçonnée. Nouvelle saisie (`id` = la case) : N bouteilles en haut de la pile.
 * Modification d'une bouteille : elle seule, ou aussi ses jumelles de la même case si l'utilisateur le veut.
 */
async function submitCaseForm(id, d, more) {
  const wine = wineOf({ ...d, photo: draftPhoto });
  if (!parseId(id).u) {
    const n = qty(d), added = await addToCase(id, wine, n); if (!added) return;
    refresh(); showCase(id, added.map((b) => b.id)); saved(n > 1 ? `${n} bouteilles ajoutées` : 'Bouteille ajoutée');
    if (more) startMode('copy', added[0]);
    return;
  }
  const old = bottleAt(id); if (!old) return closeSheet();
  const rec = { ...old, ...wine, id, pile: old.pile }; delete rec.demo;   // modifiée par l'utilisateur : plus un exemple
  const changed = WINE_FIELDS.filter((f) => (rec[f] ?? '') !== (old[f] ?? ''));
  const twins = pileOf(allBottles(), caseIdOf(id)).filter((x) => x.id !== id && norm(x.nom) === norm(old.nom) && (x.millesime || '') === (old.millesime || ''));
  let others = [];
  if (changed.length && twins.length && await ask(`Appliquer aussi ces changements aux ${twins.length} autre${twins.length > 1 ? 's' : ''} bouteille${twins.length > 1 ? 's' : ''} identique${twins.length > 1 ? 's' : ''} (même vin, même millésime) de cette case ?`, 'Oui, à toutes', 'Non, celle-ci')) {
    others = twins.map((x) => { const y = { ...x }; for (const f of changed) y[f] = rec[f]; delete y.demo; return y; });
  }
  if (!await persistBatch([rec, ...others], [])) return;   // enregistré sur l'appareil avant de confirmer
  refresh(); selectBottle(id); saved(others.length ? `${others.length + 1} fiches enregistrées` : 'Fiche enregistrée');
  if (more) startMode('copy', rec);
}

// Photo de l'étiquette : réduite, stockée dans la fiche, puis lue automatiquement si la lecture est activée
$('photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file || !$('form')) return;
  try {
    const d = formDraft();
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }));
    const s = Math.min(1, 900 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    draftPhoto = c.toDataURL('image/jpeg', 0.78);
    redrawForm(d);
  } catch { return toast('Impossible de lire cette photo'); }
  runScan();
});

// ---------- Modes « j'ai la même ailleurs » (copie) et « déplacer » ----------
/** Entre dans un mode où chaque touche sur un emplacement libre y range la fiche. */
function startMode(type, b) {
  if (!b) return;
  mode = { type, source: { ...b }, added: 0 };
  $('bannerQty').hidden = type !== 'copy';
  updateBanner(); $('banner').hidden = false; closeSheet();
}
function updateBanner() {
  if (!mode) return;
  const nom = mode.source.nom || 'cette bouteille';
  $('bannerText').textContent = mode.type === 'copy'
    ? `Touchez chaque emplacement où ranger aussi « ${nom} »${mode.added ? ` (${mode.added} ajouté${mode.added > 1 ? 's' : ''})` : ''}`
    : `Touchez le nouvel emplacement de « ${nom} »`;
  $('bannerQtyVal').textContent = qty(mode.source);
}
function endMode() { mode = null; $('banner').hidden = true; }
$('bannerDone').onclick = endMode;
// Nombre de bouteilles rangées à chaque emplacement touché (mode copie)
$('banner').addEventListener('click', (e) => {
  const s = e.target.closest('[data-bstep]'); if (!s || !mode) return;
  mode.source.quantite = clamp(qty(mode.source) + (+s.dataset.bstep), 1, 99); updateBanner();
});
