// Service worker : l'application fonctionne sans réseau (au fond de la cave).
// Le nom du cache suit le numéro de version : une nouvelle version = un nouveau cache.
importScripts('version.js');
const CACHE = `ma-cave-${self.APP_VERSION}`;
const FILES = self.APP_FILES;   // liste définie dans version.js

// cache: 'reload' : on télécharge toujours la dernière version du serveur, jamais la copie gardée par le navigateur
// (GitHub Pages autorise 10 minutes de cache : sans cela, le nouveau cache pourrait recevoir d'anciens fichiers).
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

// Supprime les caches des anciennes versions, prend la main sur les pages ouvertes et, s'il s'agit d'une
// mise à jour, les fait passer tout de suite à la nouvelle version (sans qu'on ait à recharger soi-même).
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const isUpdate = keys.some((k) => k !== CACHE);   // un ancien cache existait : ce n'est pas une première installation
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    // Surtout pas « await » ici : tant que l'activation n'est pas terminée, le navigateur met en attente
    // les requêtes des pages ; recharger une page pendant l'activation la bloquerait indéfiniment.
    if (isUpdate) setTimeout(refreshOpenPages, 0);
  })());
});

/**
 * Prévient chaque page ouverte qu'une nouvelle version est active. Une page récente répond et choisit
 * elle-même (recharger tout de suite, ou proposer un bandeau si une fiche est en cours de saisie) ;
 * une ancienne page, qui ne sait pas répondre en 3 secondes, est rechargée d'office.
 */
async function refreshOpenPages() {
  const pages = await self.clients.matchAll({ type: 'window' });
  await Promise.all(pages.map(async (page) => {
    const handled = await new Promise((resolve) => {
      const channel = new MessageChannel(), timer = setTimeout(() => resolve(false), 3000);   // une page récente répond vite ; 3 s laissent de la marge à une page lente
      channel.port1.onmessage = () => { clearTimeout(timer); resolve(true); };
      page.postMessage({ type: 'nouvelle-version', version: self.APP_VERSION }, [channel.port2]);
    });
    if (!handled) { try { await page.navigate(page.url); } catch { /* navigateur sans navigate() : la page passera à la prochaine ouverture */ } }
  }));
}

// Réseau d'abord (version à jour, et cohérente entre la page et le code), cache si pas de réseau.
// Au fond de la cave, sans réseau, la réponse vient du cache tout de suite ; avec un réseau très lent,
// on n'attend pas plus de 4 secondes avant de se rabattre sur le cache.
// Seuls les fichiers de l'application sont concernés : les appels à l'API Google passent directement.
const NETWORK_TIMEOUT = 4000;
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const network = fetch(e.request, { cache: 'no-cache' });
  // Mise à jour du cache déclarée tout de suite (Safari refuse waitUntil appelé plus tard, après un await).
  // Les requêtes avec paramètres (ex. version.js?v=… pour vérifier les mises à jour) ne sont pas gardées : le cache ne grossit pas.
  const keep = !new URL(e.request.url).search;
  e.waitUntil(network.then((res) => keep && res.ok && caches.open(CACHE).then((c) => c.put(e.request, res.clone()))).catch(() => {}));
  e.respondWith((async () => {
    const cached = async () => (await caches.open(CACHE)).match(e.request, { ignoreSearch: true });
    let timer;
    try {
      const res = await Promise.race([network, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('délai')), NETWORK_TIMEOUT); })]);
      if (res.ok) return res;
      return (await cached()) || res;   // erreur du serveur (ex. 503 de GitHub Pages) : la copie en cache vaut mieux
    } catch {
      return (await cached()) || Response.error();
    } finally { clearTimeout(timer); }
  })());
});
