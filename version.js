// Numéro de version de l'application et liste de ses fichiers (source unique).
// Chargé par index.html (script classique) et par le service worker (importScripts) :
// changer ce numéro change le nom du cache hors-ligne et force la mise à jour chez l'utilisateur.
// À garder identique à "version" dans package.json et à la dernière entrée de CHANGELOG.md
// (un test automatique le vérifie : `npm test`).
self.APP_VERSION = '1.0.0';

// Fichiers mis en cache pour le mode hors-ligne, et retéléchargés par le bouton « Mettre à jour ».
// Tout nouveau fichier de l'app doit être ajouté ici.
self.APP_FILES = ['./', 'index.html', 'style.css', 'app.js', 'lib.js', 'db.js', 'scan.js', 'version.js',
  'vendor/three.module.min.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-512.png'];
