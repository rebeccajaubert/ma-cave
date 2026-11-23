// Mises à jour de l'application (vérification, bandeau, mise à jour forcée).
import { isNewerVersion } from './lib.js';
import { mode } from './sheet.js';
import { $, APP_FILES, APP_VERSION, ask, toast } from './util.js';

// ---------- Mises à jour de l'application ----------
/** Version publiée sur le site, lue sans aucun cache ; null sans réseau. */
export async function latestVersion() {
  try {
    const res = await fetch(`version.js?v=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? (/APP_VERSION\s*=\s*'([^']+)'/.exec(await res.text())?.[1] || null) : null;
  } catch { return null; }
}
/**
 * Compare la version installée à celle du site. Au démarrage, affiche un bandeau si une nouvelle version existe ;
 * depuis le menu (`manual`), propose directement de mettre à jour.
 */
export async function checkForUpdate({ manual = false } = {}) {
  if (manual) toast('Recherche d\'une mise à jour…');
  const latest = await latestVersion();
  if (!latest) { if (manual) toast('Pas de réseau : impossible de vérifier les mises à jour'); return; }
  if (!isNewerVersion(latest, APP_VERSION)) { if (manual) toast(`Vous avez la dernière version (${APP_VERSION})`); return; }
  if (manual) {
    if (await ask(`Une nouvelle version (${latest}) est disponible. La télécharger maintenant ? Vos bouteilles et réglages sont conservés.`, 'Mettre à jour')) forceUpdate(latest);
    return;
  }
  $('updateText').textContent = `Nouvelle version ${latest} disponible`;
  $('updateBar').hidden = false;
  $('updateBtn').onclick = () => forceUpdate(latest);
}
/**
 * Mise à jour forcée : retélécharge chaque fichier depuis le site (sans cache) ; seulement si TOUS sont arrivés,
 * efface les copies hors-ligne, désinscrit le service worker puis recharge. Sinon on ne touche à rien :
 * l'app reste utilisable hors-ligne. Les fiches (IndexedDB) et les réglages (localStorage) ne sont jamais touchés.
 * @param {string} expected version attendue après la mise à jour (pour confirmer qu'elle a bien pris)
 */
export async function forceUpdate(expected) {
  $('updateBar').hidden = true; toast('Mise à jour en cours…');
  const results = await Promise.all(APP_FILES.map((f) => fetch(f, { cache: 'reload' }).then((r) => r.ok).catch(() => false)));
  if (results.includes(false)) return toast('Mise à jour impossible : vérifiez la connexion et réessayez');
  try {
    if ('caches' in self) for (const k of await caches.keys()) await caches.delete(k);
    for (const reg of (await navigator.serviceWorker?.getRegistrations?.()) || []) await reg.unregister();
    sessionStorage.setItem('cave-maj-attendue', expected || '');
  } catch (e) { console.error(e); }
  location.replace(`./?maj=${Date.now()}`);   // adresse neuve : la page elle-même est rechargée depuis le site
}

// Le service worker annonce qu'une nouvelle version vient de s'activer : on recharge tout de suite,
// sauf si une fiche ou un menu est ouvert (saisie en cours) : dans ce cas, un bandeau propose de le faire.
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type !== 'nouvelle-version') return;
  e.ports?.[0]?.postMessage('ok');   // « je m'en occupe » : le service worker ne recharge pas la page d'office
  if (e.data.version && !isNewerVersion(e.data.version, APP_VERSION)) return;   // déjà à jour
  // Rien en cours (fiche, menu, dialogue, mode copie/déplacement, recherche, lecture d'étiquette, saisie) : on recharge.
  const busy = !$('sheet').hidden || mode || !$('dialog').hidden || !$('banner').hidden || $('search').value.trim()
    || document.querySelector('[data-scanning]') || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (!busy) { location.reload(); return; }
  $('updateText').textContent = `Nouvelle version ${e.data.version || ''} prête`;
  $('updateBtn').onclick = () => location.reload();
  $('updateBar').hidden = false;
});

// Rouvrir l'app depuis l'icône reprend souvent la page restée en mémoire, sans la recharger : aucune mise à jour
// n'est alors cherchée. On vérifie donc aussi à chaque retour au premier plan (au plus toutes les 2 minutes).
// Si une nouvelle version existe, le service worker l'installe puis prévient la page (voir l'écouteur ci-dessus).
export const UPDATE_CHECK_EVERY = 2 * 60 * 1000;
export let lastUpdateCheck = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || ['localhost', '127.0.0.1'].includes(location.hostname)) return;
  if (Date.now() - lastUpdateCheck < UPDATE_CHECK_EVERY) return;
  lastUpdateCheck = Date.now();
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
  checkForUpdate();   // bandeau de secours si le service worker ne peut pas se mettre à jour
});
