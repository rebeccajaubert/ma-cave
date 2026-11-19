// Numéro de version de l'application (source unique, versionnement sémantique).
// Chargé par index.html (script classique) et par le service worker (importScripts) :
// changer ce numéro change le nom du cache hors-ligne et force la mise à jour chez l'utilisateur.
// À garder identique à "version" dans package.json et à la dernière entrée de CHANGELOG.md
// (un test automatique le vérifie : `npm test`).
self.APP_VERSION = '0.3.0';
