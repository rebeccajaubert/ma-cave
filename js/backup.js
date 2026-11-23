// Sauvegarde en fichier, restauration, copies de sécurité sur l'appareil.
import { isValidId, realRecordCount, totalBottles, normalizeConfig, copiesToDrop, esc, DAY_MS } from './lib.js';
import { openCopies } from './db.js';
import { CONFIG_KEY, config, persist, records, store } from './data.js';
import { last } from './scene.js';
import { openSheet } from './sheet.js';
import { $, APP_VERSION, ask, toast } from './util.js';

// ---------- Sauvegarde en fichier et restauration ----------
export async function exportData() {
  const data = JSON.stringify({ app: 'ma-cave', version: 2, appVersion: APP_VERSION, date: new Date().toISOString(), config, bouteilles: [...records.values()] });
  const name = `ma-cave-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: 'application/json' });
  // Date de la dernière sauvegarde (pour le rappel) : seulement si le partage a abouti ou le fichier est parti
  const done = () => { try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch { /* stockage bloqué */ } };
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Sauvegarde Ma Cave' }); done(); toast('Sauvegarde faite'); return; } } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000); done(); toast('Sauvegarde téléchargée');
}
$('importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  let d;
  try { d = JSON.parse(await file.text()); if (!Array.isArray(d.bouteilles)) throw new Error('format'); } catch { return toast('Ce fichier n\'est pas une sauvegarde valide'); }
  await restoreData(d, 'cette sauvegarde');
});
/**
 * Remplace les fiches et le rangement par ceux d'une sauvegarde (fichier ou copie de sécurité).
 * L'état actuel est d'abord copié sur l'appareil : si cette copie échoue, rien n'est remplacé.
 */
async function restoreData(d, what) {
  const list = (Array.isArray(d.bouteilles) ? d.bouteilles : []).filter((b) => b && !b.vide && isValidId(b.id))
    .map((b) => ({ ...b, ...(b.pile != null ? { pile: Math.max(0, parseInt(b.pile) || 0) } : {}),   // rang : un nombre, jamais du texte
      photo: typeof b.photo === 'string' && b.photo.startsWith('data:image/') ? b.photo : null }));
  if (!store) return toast('Stockage indisponible : impossible de restaurer');
  const current = [...records.values()], real = realRecordCount(current);
  // Compte en bouteilles, sans les exemples (sinon « 1039 fiches » pour une seule vraie bouteille)
  const count = (l) => { const n = totalBottles(l.filter((b) => !b.demo && !b.vide)); return `${n} bouteille${n > 1 ? 's' : ''}${l.some((b) => b.demo) ? ', plus des exemples' : ''}`; };
  const warn = real ? `Le contenu actuel de ce téléphone (${count(current)}) sera remplacé. Une copie de l'état actuel est gardée (menu, « Réglages », « Revenir en arrière »).`
    : 'Le rangement et les fiches de ce téléphone seront remplacés.';
  if (!await ask(`Revenir à ${what} : ${count(list)} ?\n\n${warn}`, 'Remplacer')) return;
  if (real && !await takeCopy({ raison: 'restauration' }, config, current)) return toast('Impossible de copier l\'état actuel : rien n\'a été remplacé');
  const oldConfig = lsGet(CONFIG_KEY);
  if (d.config) {   // réglage d'abord : s'il ne peut pas être écrit, on n'a encore rien remplacé
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(normalizeConfig(d.config))); } catch { return toast('Impossible d\'enregistrer le réglage sur cet appareil : rien n\'a été restauré'); }
  }
  if (!await persist((st) => st.replaceAll(list))) {   // fiches non remplacées : on remet aussi l'ancien réglage
    if (d.config && oldConfig !== null) lsSet(CONFIG_KEY, oldConfig);
    return;
  }
  location.reload();
}

// ---------- Copies de sécurité (sur l'appareil, avant chaque nouvelle version et avant une restauration) ----------
const KEEP_COPIES = 4;                              // plusieurs : la copie d'une version qui aurait abîmé les fiches ne chasse pas la bonne
export const VERSION_KEY = 'cave-version-lancee';         // dernière version lancée sur cet appareil
export const BACKUP_KEY = 'cave-derniere-sauvegarde';     // date (ms) de la dernière sauvegarde en fichier
export const REMINDER_KEY = 'cave-dernier-rappel';        // date (ms) du dernier rappel de sauvegarde
export let copiesInfo = [];                                // résumé des copies gardées (sans les fiches), pour le menu
export let storageProtected = null;                        // réponse de l'iPhone à « protéger le stockage » (null : inconnue)
/** Réponse de l'iPhone à « protéger le stockage », affichée dans les réglages. */
export function setStorageProtected(v) { storageProtected = v; }
export const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

/**
 * Copie fiches + rangement dans la base des copies ; renvoie true seulement si la copie est réellement écrite.
 * Si l'écriture échoue (téléphone plein : les photos pèsent lourd), on ne garde que la copie la plus récente
 * et on réessaie une fois, plutôt que de rester bloqué à chaque lancement.
 */
export async function takeCopy(info, cfg, list) {
  let copies;
  try { copies = await openCopies(); } catch (e) { console.error(e); return false; }
  const date = new Date().toISOString();
  const write = () => copies.add({ app: 'ma-cave', version: 2, ...info, date, config: cfg, bouteilles: list },
    { ...info, date, n: totalBottles(list.filter((b) => !b.demo && !b.vide)) }, (ids) => copiesToDrop(ids, KEEP_COPIES));
  try { await write(); } catch (e) {
    console.error(e);
    try { await copies.trim((ids) => copiesToDrop(ids, 1)); await write(); } catch (e2) { console.error(e2); await loadCopiesInfo(copies); return false; }
  }
  await loadCopiesInfo(copies);
  return true;
}
export async function loadCopiesInfo(copies) {
  try {
    copiesInfo = (await (copies || await openCopies()).summaries()).sort((a, b) => b.id - a.id);
  } catch (e) { console.error(e); copiesInfo = []; }
}
function copyLabel(c) {
  const d = new Date(c.date), when = `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  const why = c.raison === 'restauration' ? 'Avant une restauration' : `Avant la version ${c.vers || '?'}`;
  return { why, sub: `${when} · ${c.n} bouteille${c.n > 1 ? 's' : ''}` };
}
export function showCopies() {
  openSheet('Revenir en arrière', `
    <p class="help">Ce téléphone garde une copie de vos bouteilles avant chaque nouvelle version de l'application et avant chaque restauration (les ${KEEP_COPIES} plus récentes). Touchez une copie pour y revenir.</p>
    <div class="list">${copiesInfo.length ? copiesInfo.map((c) => { const l = copyLabel(c); return `<button class="row" data-act="snap-restore" data-snap="${esc(String(c.id))}">
      <span class="main"><div class="n">${esc(l.why)}</div><div class="s">${esc(l.sub)}</div></span></button>`; }).join('') : '<div class="empty">Aucune copie pour l\'instant.</div>'}</div>
    <p class="help">Ces copies restent sur ce téléphone : elles ne remplacent pas « Sauvegarder mes données », qui protège aussi d'une perte du téléphone.</p>
    <div class="btns"><button class="btn block" data-act="settings">Retour</button></div>`, true);
}
export async function restoreCopy(id) {
  let copy;
  try { copy = await (await openCopies()).get(Number(id)); } catch (e) { console.error(e); }
  if (!copy) return toast('Copie introuvable');
  await restoreData(copy, `la copie « ${copyLabel(copy).why.toLowerCase()} »`);
}
/** Date de la dernière sauvegarde, en mots (« hier », « il y a 3 jours », « jamais »). */
export function lastBackupText() {
  const last = Number(lsGet(BACKUP_KEY)), days = last ? Math.floor((Date.now() - last) / DAY_MS) : null;
  return days === null ? 'jamais' : days < 1 ? 'aujourd\'hui' : days < 2 ? 'hier' : `il y a ${days} jours`;
}
/** Protection du stockage par l'iPhone (sans elle, Safari peut effacer les fiches d'une app peu ouverte). */
export function storageLine() {
  return `Stockage protégé par l'iPhone : <b>${storageProtected ? 'oui' : 'non'}</b>${storageProtected ? '' : ' (ouvrez l\'app depuis son icône sur l\'écran d\'accueil)'}`;
}
