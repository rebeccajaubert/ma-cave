# Ma Cave — règles du projet

Application web (PWA) : maquette 3D d'une cave à vin pour l'iPhone d'un public peu à l'aise avec le numérique. Interface et textes **en français**, simples, gros boutons. Voir `README.md` pour l'architecture.

## Commandes
- `npm test` : tests (`node --test`), à lancer avant de conclure toute modification. Il comprend `tests/undeclared.test.js`, qui détecte les variables non déclarées dans tout le code : **ne jamais le désactiver**, une déclaration supprimée par un remplacement de texte a déjà cassé la recherche deux fois.
- `npm run serve` : serveur local (http://localhost:8765, `?debug` expose `window.__cave`).
- Les tests ne couvrent pas l'interface (`js/`, hors `lib.js` et `scan.js`) : après une modification de l'interface, **ouvrir l'app en local en format iPhone** (`?debug`), parcourir les fonctions touchées (fiche, recherche, copie/déplacement, menu) et vérifier l'absence d'erreurs dans la console. Le serveur local peut servir d'anciennes copies : recharger en forçant le cache.

## Règles
- **Ne jamais pousser sur GitHub sans accord explicite**, et ne jamais publier une version (Release) sans son accord : c'est la Release qui met en ligne le site que l'utilisateur utilise. L'utilisateur vérifie d'abord sur son téléphone (voir « Git : une branche par chantier »).
- **Aucun secret dans le dépôt** (clés d'API, jetons). La clé Gemini reste dans le `localStorage` de l'appareil.
- **Tout texte saisi ou lu sur une étiquette passe par `esc()`** avant d'entrer dans du HTML.
- **Les données des utilisateurs sont sacrées** : écrire avant de confirmer, enregistrer la nouvelle place avant de libérer l'ancienne, confirmer toute suppression, garder les anciennes fiches lisibles quand le format évolue.
- **Commentaires en français** sur toute logique non évidente ; JSDoc sur les fonctions exportées ; le « pourquoi » plutôt que le « quoi ».
- **Tests** : toute logique pure va dans `js/lib.js` / `js/scan.js` avec un test dans `tests/`.
- **Modules (`js/`)** : un module ne réassigne jamais une variable d'un autre (passer par une fonction du module qui la possède, le test `undeclared` le vérifie) ; `scene.js` n'importe que `data.js` et `util.js` (sinon la scène démarrerait avant le réglage de la cave). Carte des modules en tête de `js/util.js`.
- **Versionnement** : chaque chantier décrit ses changements visibles dans `CHANGELOG.md`, sous la section `## [Non publié]` en tête (la créer si elle n'existe pas), **sans changer le numéro**. Le numéro (`version.js`, `package.json`, `?v=` et table d'import de `index.html`) n'est changé qu'au moment de publier, quand `[Non publié]` devient `[X.Y.Z]` (le test `tests/version.test.js` vérifie qu'ils concordent). Un nouveau fichier de l'app doit être ajouté à `APP_FILES` dans `version.js` (utilisée par le service worker et par le bouton « Mettre à jour »).
- **README.md à jour** : fonctionnalités, structure et procédure dès qu'elles changent.

## Git : une branche par chantier
- **Jamais de travail direct sur `main`** : `main` = ce qui est en ligne chez l'utilisateur. Chaque chantier a sa branche `chantier/<nom>` ; plusieurs sessions en parallèle travaillent chacune dans **son propre worktree** (`git worktree add ../app_cave-<nom> -b chantier/<nom> main`), sans jamais changer la branche du dossier partagé.
- **Fusionner ≠ publier.** Un chantier terminé (tests, vérification, relecture) est fusionné dans `main` par une demande de fusion (PR), avec l'accord de l'utilisateur : **rien n'est mis en ligne**. `main` est protégée : pas d'envoi direct, les tests automatiques (`.github/workflows/tests.yml`) doivent passer, et la branche doit être à jour avec `main`. `main` rassemble donc ce qui sera dans la prochaine version.
- **Publier = créer une Release GitHub**, seulement quand l'utilisateur le demande (il peut regrouper plusieurs chantiers) : une petite branche `chantier/version-X.Y.Z` change le numéro (`version.js`, `package.json`, `?v=` et table d'import de `index.html`) et renomme `## [Non publié]` en `## [X.Y.Z] - date`, puis PR et fusion ; ensuite tag annoté sur ce commit de `main` (`git tag -a vX.Y.Z -m "Ma Cave X.Y.Z"`, `git push origin vX.Y.Z`) et `gh release create vX.Y.Z --title "Ma Cave X.Y.Z" --notes-file …` (notes de la version dans `CHANGELOG.md`). La Release déclenche `.github/workflows/deploy.yml`, qui relance les tests et met en ligne exactement ce tag. Vérifier ensuite le site en ligne. Ne jamais déplacer ni supprimer un tag déjà publié.
- **Numéro de version** : `MAJEUR.MINEUR.CORRECTIF` (que des corrections → CORRECTIF, au moins une nouvelle fonction → MINEUR, changement qui casse l'existant → MAJEUR), choisi au moment de publier selon tout ce que contient `[Non publié]`.
- **Revenir à une version précédente** : GitHub, onglet Actions, « Mise en ligne », « Run workflow » avec le tag voulu (ou `gh workflow run deploy.yml -f tag=vX.Y.Z`).

## Relecture obligatoire
Après toute modification de code (`.js`, `.html`, `.css`, `sw.js`, `manifest`), lancer l'agent **`code-reviewer`** avant de conclure, corriger les points « Bloquant » et « Important », puis relancer l'agent si le code a changé. Les hooks de `.claude/settings.json` le rappellent et bloquent la fin de tour tant que la relecture n'est pas faite.
