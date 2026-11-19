// Service worker : l'application fonctionne sans réseau (au fond de la cave).
// Le nom du cache suit le numéro de version : une nouvelle version = un nouveau cache.
importScripts('version.js');
const CACHE = `ma-cave-${self.APP_VERSION}`;
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'lib.js', 'db.js', 'scan.js', 'version.js', 'vendor/three.module.min.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-512.png'];

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
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = () => cache.match(e.request, { ignoreSearch: true });
    let timer;
    try {
      const res = await Promise.race([
        fetch(e.request, { cache: 'no-cache' }),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('délai')), NETWORK_TIMEOUT); }),
      ]);
      if (res.ok) { e.waitUntil(cache.put(e.request, res.clone())); return res; }   // waitUntil : iOS n'interrompt pas l'écriture
      return (await cached()) || res;   // erreur du serveur (ex. 503 de GitHub Pages) : la copie en cache vaut mieux
    } catch {
      return (await cached()) || Response.error();
    } finally { clearTimeout(timer); }
  })());
});
