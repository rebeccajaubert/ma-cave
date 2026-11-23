// Point d'entrée : démarrage de l'application (lecture des fiches, migrations, protections, premier affichage).
import { openStore } from './db.js';
import { lastLaunchedVersion, needsSnapshot, realRecordCount, DAY_MS, shouldResetDemoToVerdelot, DEFAULT_CONFIG, needsLegacyConfig, LEGACY_CONFIG, backupReminderDue, isNewerVersion } from './lib.js';
import { BACKUP_KEY, REMINDER_KEY, VERSION_KEY, copiesInfo, exportData, loadCopiesInfo, lsGet, lsSet, setStorageProtected, takeCopy } from './backup.js';
import { CONFIG_KEY, DEV, config, deleteRecord, persist, records, saveRecord, setStore, store } from './data.js';
import { clearDemo, seedDemo, upgradeCases } from './demo.js';
import { showWelcome } from './menu.js';
import { applyVisibility, camera, frame, hero, heroAnim, last, rebuildBottles, view } from './scene.js';
import { selectSlot, tapSlot } from './sheet.js';
import { checkForUpdate } from './updates.js';
import { APP_VERSION, ask, toast } from './util.js';

// ---------- Démarrage ----------
if (new URLSearchParams(location.search).has('debug')) window.__cave = { tapSlot, selectSlot, saveRecord, deleteRecord, get store() { return store; }, records, view, hero, camera, get heroAnim() { return heroAnim; } };   // pour les tests automatiques
(async function start() {
  try {
    setStore(await openStore());
    for (const b of await store.getAll()) if (!b.vide) records.set(b.id, b);
  } catch (e) { console.error(e); toast('Stockage indisponible : les fiches ne seront pas enregistrées'); }
  let hasStoredConfig = true, storedConfig = null;
  try {
    const raw = localStorage.getItem(CONFIG_KEY) || localStorage.getItem('cave-config-v3') || localStorage.getItem('cave-config-v2');
    hasStoredConfig = !!raw; storedConfig = raw ? JSON.parse(raw) : null;
  } catch { /* stockage bloqué ou réglage illisible */ }
  const all = [...records.values()];
  // Nouvelle version : copie des fiches AVANT toute transformation au démarrage. Si la copie échoue, on ne
  // transforme rien (les fiches restent telles quelles), on demande une sauvegarde en fichier et on réessaiera
  // au prochain lancement ; une sauvegarde en fichier faite depuis moins d'un jour suffit alors à continuer.
  await loadCopiesInfo();   // pour le bouton « Revenir en arrière » et la dernière version lancée
  const lastVersion = lastLaunchedVersion(lsGet(VERSION_KEY), copiesInfo);
  let copyOk = true;
  if (store && needsSnapshot(lastVersion, APP_VERSION, realRecordCount(all))) {
    toast('Copie de sécurité de vos bouteilles…');
    copyOk = await takeCopy({ raison: 'version', de: lastVersion, vers: APP_VERSION }, storedConfig || config, all);
    if (!copyOk && Date.now() - Number(lsGet(BACKUP_KEY) || 0) < DAY_MS) copyOk = true;
    if (!copyOk) {
      ask('La copie de sécurité d\'avant la mise à jour n\'a pas pu être faite (le téléphone manque peut-être de place). Vos bouteilles ne sont pas touchées. Faites une sauvegarde en fichier : la mise à jour se terminera au prochain lancement.',
        'Sauvegarder', 'Plus tard').then((yes) => { if (yes) exportData(); });
    }
  }
  if (copyOk) lsSet(VERSION_KEY, APP_VERSION);
  if (store && shouldResetDemoToVerdelot(storedConfig, all)) {
    // Appareil de test (seulement des bouteilles d'exemple) resté sur l'ancien rangement : format Verdelot,
    // avec des exemples régénérés à ce format au prochain lancement.
    // Réglage d'abord : si le stockage est bloqué, on ne supprime rien.
    let configSaved = false;
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...DEFAULT_CONFIG, nom: config.nom }));
      localStorage.removeItem('cave-demo');
      configSaved = true;
    } catch { /* stockage bloqué : on continue avec ce qu'on a */ }
    if (configSaved && await persist((st) => st.removeMany(all.map((b) => b.id)))) { location.reload(); return; }
  }
  if (needsLegacyConfig(hasStoredConfig, realRecordCount(all))) {
    // Fiches créées avec la 0.2.0 (alvéoles partout) : on garde ce rangement pour qu'elles restent à leur place.
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(LEGACY_CONFIG)); location.reload(); return; } catch { /* on continue avec le réglage par défaut */ }
  } else if (!hasStoredConfig && store) {   // sans base lisible, on ne peut pas savoir s'il y a des fiches : on n'écrit rien
    // Première installation : on enregistre tout de suite le réglage utilisé, sinon le lancement suivant
    // (avec des fiches, mais toujours sans réglage) croirait à un appareil de la 0.2.0.
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch { /* stockage bloqué : rien à faire */ }
  }
  // Téléphone d'un utilisateur : jamais de bouteilles d'exemple. Celles laissées par une ancienne version sont
  // retirées (seulement les fiches marquées « exemple » : une fiche modifiée par l'utilisateur n'en est plus une).
  // Après la copie de sécurité seulement : une vraie bouteille posée sur des exemples descend dans sa case.
  if (store && !DEV && copyOk && [...records.values()].some((b) => b.demo)) {
    const removed = await clearDemo().catch((e) => { console.error(e); return []; });
    if (removed.length) toast('Bouteilles d\'exemple retirées');
  }
  if (store && records.size && copyOk) await upgradeCases().catch(console.error);
  let demoDone = true; try { demoDone = !!localStorage.getItem('cave-demo'); } catch { /* stockage bloqué */ }
  if (store && DEV && !records.size && !demoDone) { try { localStorage.setItem('cave-demo', '1'); localStorage.setItem('cave-demo-v4', '1'); } catch { /* idem */ } await seedDemo().catch(console.error); }
  rebuildBottles(); applyVisibility(); requestAnimationFrame(frame);
  let welcomed = false; try { welcomed = !!localStorage.getItem('cave-bienvenue'); } catch { /* stockage bloqué */ }
  if (!welcomed) showWelcome();
  else if (copyOk && backupReminderDue({ now: Date.now(), lastBackup: lsGet(BACKUP_KEY), lastReminder: lsGet(REMINDER_KEY), realCount: realRecordCount([...records.values()]) })) {
    lsSet(REMINDER_KEY, String(Date.now()));
    const last = lsGet(BACKUP_KEY);
    ask(`Pensez à sauvegarder vos bouteilles : ${last ? 'la dernière sauvegarde date de plus d\'un mois' : 'elles n\'ont encore jamais été sauvegardées'}. La sauvegarde garde vos fiches même si ce téléphone est perdu ou changé.`,
      'Sauvegarder', 'Plus tard').then((yes) => { if (yes) exportData(); });
  }
  // Demande à l'iPhone de ne jamais vider ce stockage pour faire de la place ; sa réponse est montrée dans le menu
  navigator.storage?.persist?.().then((ok) => { setStorageProtected(!!ok); }).catch(() => {});
  if (location.search.includes('maj=')) {   // retour d'une mise à jour forcée : on dit si elle a bien pris
    history.replaceState(null, '', './');
    let expected = ''; try { expected = sessionStorage.getItem('cave-maj-attendue') || ''; sessionStorage.removeItem('cave-maj-attendue'); } catch { /* sans stockage */ }
    toast(isNewerVersion(expected, APP_VERSION) ? 'La mise à jour n\'a pas abouti : réessayez avec du réseau' : `Application à jour (version ${APP_VERSION})`);
  }
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) checkForUpdate();
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
})();
