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

// Supprime les caches des anciennes versions.
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

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
