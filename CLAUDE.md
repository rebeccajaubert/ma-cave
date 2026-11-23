# Ma Cave — règles du projet

Application web (PWA) : maquette 3D d'une cave à vin pour l'iPhone d'un public peu à l'aise avec le numérique. Interface et textes **en français**, simples, gros boutons. Voir `README.md` pour l'architecture.

## Commandes
- `npm test` : tests (`node --test`), à lancer avant de conclure toute modification. Il comprend `tests/undeclared.test.js`, qui détecte les variables non déclarées dans tout le code : **ne jamais le désactiver**, une déclaration supprimée par un remplacement de texte a déjà cassé la recherche deux fois.
- `npm run serve` : serveur local (http://localhost:8765, `?debug` expose `window.__cave`).
- Les tests ne couvrent pas `app.js` (scène, interface) : après une modification de `app.js`, **ouvrir l'app en local en format iPhone** (`?debug`), parcourir les fonctions touchées (fiche, recherche, copie/déplacement, menu) et vérifier l'absence d'erreurs dans la console. Le serveur local peut servir d'anciennes copies : recharger en forçant le cache.

## Règles
- **Ne jamais pousser sur GitHub sans accord explicite** : la fusion dans `main` déploie le site que l'utilisateur utilise. L'utilisateur vérifie d'abord sur son téléphone (voir « Git : une branche par chantier »).
- **Aucun secret dans le dépôt** (clés d'API, jetons). La clé Gemini reste dans le `localStorage` de l'appareil.
- **Tout texte saisi ou lu sur une étiquette passe par `esc()`** avant d'entrer dans du HTML.
- **Les données des utilisateurs sont sacrées** : écrire avant de confirmer, enregistrer la nouvelle place avant de libérer l'ancienne, confirmer toute suppression, garder les anciennes fiches lisibles quand le format évolue.
- **Commentaires en français** sur toute logique non évidente ; JSDoc sur les fonctions exportées ; le « pourquoi » plutôt que le « quoi ».
- **Tests** : toute logique pure va dans `lib.js` / `scan.js` avec un test dans `tests/`.
- **Versionnement** : tout changement visible par l'utilisateur met à jour `version.js`, `package.json` et `CHANGELOG.md` ainsi que les `?v=` de `index.html` (le test `tests/version.test.js` vérifie qu'ils concordent). Un nouveau fichier de l'app doit être ajouté à `APP_FILES` dans `version.js` (utilisée par le service worker et par le bouton « Mettre à jour »).
- **README.md à jour** : fonctionnalités, structure et procédure dès qu'elles changent.

## Git : une branche par chantier
- **Jamais de travail direct sur `main`** : `main` = ce qui est en ligne chez l'utilisateur. Chaque chantier a sa branche `chantier/<nom>` ; plusieurs sessions en parallèle travaillent chacune dans **son propre worktree** (`git worktree add ../app_cave-<nom> -b chantier/<nom> main`), sans jamais changer la branche du dossier partagé.
- **Publier = fusionner la branche dans `main`** par une demande de fusion (PR) GitHub, après l'accord explicite de l'utilisateur. `main` est protégée : pas d'envoi direct, et les tests automatiques (`.github/workflows/tests.yml`, `npm test`) doivent passer avant la fusion.
- **Numéro de version** : `MAJEUR.MINEUR.CORRECTIF` (correctif seul → CORRECTIF, nouvelle fonction → MINEUR, changement qui casse l'existant → MAJEUR). Il est mis à jour sur la branche, juste avant la publication ; si deux chantiers sont en cours, se mettre d'accord avec l'utilisateur sur lequel porte quel numéro.
- **À chaque publication** : tag annoté sur le commit de `main` publié (`git tag -a vX.Y.Z -m "Ma Cave X.Y.Z"`), puis Release GitHub avec les notes de `CHANGELOG.md` (`gh release create vX.Y.Z --title "Ma Cave X.Y.Z" --notes-file …`). Ne jamais déplacer ni supprimer un tag déjà publié.

## Relecture obligatoire
Après toute modification de code (`.js`, `.html`, `.css`, `sw.js`, `manifest`), lancer l'agent **`code-reviewer`** avant de conclure, corriger les points « Bloquant » et « Important », puis relancer l'agent si le code a changé. Les hooks de `.claude/settings.json` le rappellent et bloquent la fin de tour tant que la relecture n'est pas faite.
