# Ma Cave — règles du projet

Application web (PWA) : maquette 3D d'une cave à vin pour l'iPhone d'un public peu à l'aise avec le numérique. Interface et textes **en français**, simples, gros boutons. Voir `README.md` pour l'architecture.

## Commandes
- `npm test` : tests (`node --test`), à lancer avant de conclure toute modification. Il comprend `tests/undeclared.test.js`, qui détecte les variables non déclarées dans tout le code : **ne jamais le désactiver**, une déclaration supprimée par un remplacement de texte a déjà cassé la recherche deux fois.
- `npm run serve` : serveur local (http://localhost:8765, `?debug` expose `window.__cave`).
- Les tests ne couvrent pas `app.js` (scène, interface) : après une modification de `app.js`, **ouvrir l'app en local en format iPhone** (`?debug`), parcourir les fonctions touchées (fiche, recherche, copie/déplacement, menu) et vérifier l'absence d'erreurs dans la console. Le serveur local peut servir d'anciennes copies : recharger en forçant le cache.

## Règles
- **Ne jamais pousser sur GitHub sans accord explicite** : le push sur `main` déploie le site que l'utilisateur utilise. L'utilisateur vérifie d'abord sur son téléphone.
- **Aucun secret dans le dépôt** (clés d'API, jetons). La clé Gemini reste dans le `localStorage` de l'appareil.
- **Tout texte saisi ou lu sur une étiquette passe par `esc()`** avant d'entrer dans du HTML.
- **Les données des utilisateurs sont sacrées** : écrire avant de confirmer, enregistrer la nouvelle place avant de libérer l'ancienne, confirmer toute suppression, garder les anciennes fiches lisibles quand le format évolue.
- **Commentaires en français** sur toute logique non évidente ; JSDoc sur les fonctions exportées ; le « pourquoi » plutôt que le « quoi ».
- **Tests** : toute logique pure va dans `lib.js` / `scan.js` avec un test dans `tests/`.
- **Versionnement** : tout changement visible par l'utilisateur met à jour `version.js`, `package.json` et `CHANGELOG.md` ainsi que les `?v=` de `index.html` (le test `tests/version.test.js` vérifie qu'ils concordent). Un nouveau fichier de l'app doit être ajouté à `APP_FILES` dans `version.js` (utilisée par le service worker et par le bouton « Mettre à jour »).
- **README.md à jour** : fonctionnalités, structure et procédure dès qu'elles changent.

## Relecture obligatoire
Après toute modification de code (`.js`, `.html`, `.css`, `sw.js`, `manifest`), lancer l'agent **`code-reviewer`** avant de conclure, corriger les points « Bloquant » et « Important », puis relancer l'agent si le code a changé. Les hooks de `.claude/settings.json` le rappellent et bloquent la fin de tour tant que la relecture n'est pas faite.
