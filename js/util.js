/* ============================================================
   Ma Cave — maquette 3D de la cave, façon plan d'architecte
   Une voûte en demi-cylindre, un îlot central, des casiers sur les deux murs et sur les deux faces de l'îlot.
   Un emplacement est soit « enregistré » (une fiche existe : la bouteille apparaît dans le casier), soit
   « non enregistré » (aucune fiche : rien n'apparaît).

   Organisation du dossier js/ (ordre de chargement : util → data → scene → le reste) :
     util.js     outils communs, dialogues           data.js     réglage de la cave, fiches, enregistrement
     scene.js    scène 3D (ne dépend que de data)    touch.js    gestes sur la scène
     cases.js    piles des cases maçonnées           sheet.js    fiche du bas, formulaire, actions
     autofill.js photo et voix                       search.js   recherche, barre du bas
     menu.js     menu, réglages, aides               undo.js     barre « Annuler »
     updates.js  mises à jour de l'app               backup.js   sauvegardes et copies de sécurité
     demo.js     bouteilles d'exemple (dev)          app.js      point d'entrée (démarrage)
     lib.js      fonctions pures, testées            db.js       IndexedDB      scan.js  Gemini (photo, voix)
   Règle : un module ne réassigne jamais une variable d'un autre (passer par une fonction du module qui la
   possède) ; la scène n'importe que data.js et util.js, sinon elle démarrerait avant le réglage de la cave.
   ============================================================ */

export const $ = (id) => document.getElementById(id);

// Juste après une mise à jour, le navigateur peut associer une ancienne page (sans les nouveaux éléments)
// au nouveau code : on recharge une fois pour tout reprendre à jour, au lieu d'afficher un écran vide.
if (['scene', 'sheet', 'nav', 'dialog', 'undoBtn', 'updateBtn'].some((id) => !$(id))) {
  // Sans sessionStorage, on ne peut pas se souvenir de la tentative : on ne recharge pas (pas de boucle possible).
  let retried = true; try { retried = !!sessionStorage.getItem('cave-reload'); sessionStorage.setItem('cave-reload', '1'); } catch { retried = true; }
  if (!retried) location.reload();
  throw new Error('Page incomplète (ancienne version en cache)');
}
try { sessionStorage.removeItem('cave-reload'); } catch { /* sans stockage */ }
export const APP_VERSION = self.APP_VERSION || '?';   // défini par version.js
export const APP_FILES = self.APP_FILES || [];         // idem : fichiers de l'app

// ---------- Dialogues et messages ----------
// Demande de confirmation affichée dans l'application (les fenêtres du navigateur sont parfois bloquées)
export function ask(message, okLabel = 'Continuer', cancelLabel = 'Annuler') {
  return new Promise((res) => {
    $('dialogText').textContent = message; $('dialogOk').textContent = okLabel; $('dialogCancel').textContent = cancelLabel; $('dialog').hidden = false;
    if ($('dialogAlt')) $('dialogAlt').hidden = true;   // le troisième choix n'existe que dans choose()
    const done = (v) => { $('dialog').hidden = true; $('dialogOk').onclick = $('dialogCancel').onclick = null; res(v); };
    $('dialogOk').onclick = () => done(true); $('dialogCancel').onclick = () => done(false);
  });
}
/**
 * Demande à deux ou trois choix (par exemple « Empiler », « Échanger », « Annuler »). Les boutons sont alors l'un
 * sous l'autre, en pleine largeur, pour rester lisibles et faciles à toucher.
 * @param {string} message
 * @param {{ok: string, alt?: string|null, cancel?: string}} labels `alt` absent : simple demande à deux choix
 * @returns {Promise<'ok'|'alt'|null>} null : annulé
 */
export async function choose(message, { ok, alt = null, cancel = 'Annuler' }) {
  // Page d'une ancienne version (sans le troisième bouton) : on se rabat sur une demande à deux choix
  if (!alt || !$('dialogAlt')) return (await ask(message, ok, cancel)) ? 'ok' : null;
  return new Promise((res) => {
    const box = $('dialogBox'), altBtn = $('dialogAlt');
    $('dialogText').textContent = message; $('dialogOk').textContent = ok; altBtn.textContent = alt; $('dialogCancel').textContent = cancel;
    altBtn.hidden = false; box.classList.add('three'); $('dialog').hidden = false;
    const done = (v) => {
      $('dialog').hidden = true; altBtn.hidden = true; box.classList.remove('three');
      $('dialogOk').onclick = $('dialogCancel').onclick = altBtn.onclick = null; res(v);
    };
    $('dialogOk').onclick = () => done('ok'); altBtn.onclick = () => done('alt'); $('dialogCancel').onclick = () => done(null);
  });
}
export function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2000); }
