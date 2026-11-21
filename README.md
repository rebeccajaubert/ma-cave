# Ma Cave

Une application iPhone pour retrouver chaque bouteille d'une cave à vin : une **maquette 3D** de la cave (deux couloirs en U autour d'un îlot central, sous une voûte), où l'on touche un emplacement pour voir la bouteille, sa fiche et son étiquette.

Application web installable (PWA) : pas d'App Store, pas de compte, gratuite. Les données restent **sur l'appareil**.

**Version actuelle : voir [CHANGELOG.md](CHANGELOG.md)** · **En ligne : <https://rebeccajaubert.github.io/ma-cave/>**

## Fonctionnalités

- **Vue d'ensemble** de la cave façon plan d'architecte, puis **casiers de face** (boutons en bas : murs gauche/droit, îlot gauche/droit).
- **Fiche de bouteille** : nom, couleur, millésime, appellation, région, cépage, prix, note, « à boire jusqu'en », commentaire, photo de l'étiquette.
- **Quatre types de rangement**, réglables casier par casier : cases maçonnées, casiers métalliques, alvéoles, caisses (voir « Rangement »).
- **Plusieurs bouteilles par emplacement** (− / +) et **même vin à plusieurs endroits** (« J'ai la même ailleurs »).
- **Gérer un casier** : vider une case, une colonne, une rangée ou tout le casier, avec **Annuler** pendant 10 secondes.
- **À boire bientôt**, **filtre par couleur**, **mode d'emploi** au premier lancement.
- **Recherche** par nom, année, appellation, région… ; les résultats s'entourent d'un anneau orange dans la cave.
- **Suggestions de saisie** à partir des fiches existantes.
- **Lecture automatique de l'étiquette** par photo (optionnelle, voir ci-dessous).
- **Sauvegarde et restauration** en fichier, **dimensions réglables**, **mode hors-ligne**.

Un emplacement est soit *enregistré* (une fiche existe : la bouteille apparaît dans le casier), soit *non enregistré* (rien n'apparaît ; au toucher, la bouteille sort sans étiquette et propose de créer sa fiche).

## Installer sur l'iPhone

1. Ouvrir <https://rebeccajaubert.github.io/ma-cave/> dans **Safari** (pas Chrome).
2. Toucher **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Lancer **Ma Cave** depuis l'icône (toujours depuis l'icône, pas depuis Safari : ce sont deux espaces de stockage distincts).

### Mettre à jour

La version installée est affichée **en haut du menu** (bouton ☰ en haut à droite), avec un bouton **« Mettre à jour »**. Au lancement, un bandeau vert annonce aussi toute nouvelle version publiée. La mise à jour retélécharge l'application depuis le site ; les bouteilles, les réglages et la clé de lecture sont conservés.

Les toutes premières versions (avant 0.3.1) n'ont pas ce bouton et peuvent rester bloquées, dans l'app comme dans Safari. **Dépannage** : ouvrir <https://rebeccajaubert.github.io/ma-cave/maj.html> dans Safari. Cette page retélécharge l'application et retire l'ancienne copie hors-ligne, sans toucher aux bouteilles, aux réglages ni à la clé. Pour une icône d'écran d'accueil restée bloquée, la solution reste de la supprimer puis de réinstaller depuis Safari (cela efface les fiches de cette icône).

## Rangement

Chaque casier (mur gauche, îlot gauche, îlot droit, mur droit) a un **type de rangement**, un nombre de **colonnes** (depuis l'entrée) et de **rangées** (depuis le bas) : menu → *Rangement de la cave*. Chaque casier a donc sa propre taille (affichée en mètres pendant le réglage) : l'îlot peut être plus court ou plus long que les murs, et les murs différents entre eux. Les casiers sont centrés dans la longueur de la cave ; l'îlot est fait de deux casiers dos à dos, chacun avec sa propre taille.

| Type | Un emplacement = | Disposition | Quantité par défaut |
|---|---|---|---|
| Cases maçonnées | une case (≈ 60 × 38 cm) | empilées en quinconce | 12 |
| Casier métallique | une place | une bouteille | 1 |
| Alvéoles | un trou | jusqu'à 3 visibles | 1 |
| Caisses | une caisse | 2 rangs de 3 | 6 |

Par choix esthétique, toutes les bouteilles sont montrées **culot vers l'allée** (bouchon caché), même là où elles sont en réalité goulot vers l'allée.

Réglage par défaut (cave de Verdelot) : couloir de gauche en cases maçonnées, couloir de droite en casiers métalliques. Une fiche reste attachée à son numéro de colonne et de rangée : changer le type de rangement d'un casier qui contient des fiches peut les mélanger, l'app le signale avant d'appliquer.

## Lecture automatique de l'étiquette (optionnelle)

La photo est envoyée à l'API **Gemini** de Google pour remplir la fiche. Il faut une clé gratuite :

1. Aller sur <https://aistudio.google.com/apikey>, se connecter, « Create API key » (gratuit, sans carte bancaire).
2. Dans l'app : menu → **Lecture des étiquettes** → coller la clé → **Enregistrer la clé** (elle est testée). À faire une fois sur chaque appareil.

Il n'y a volontairement **pas de fichier `.env`** : l'app n'a pas de serveur, et une clé placée dans le code serait publique sur GitHub.

À savoir :
- La clé est stockée **uniquement sur l'appareil** (jamais dans le code, GitHub ou les sauvegardes).
- Avec l'offre gratuite, Google peut réutiliser le contenu envoyé pour améliorer ses produits : ne photographier que des étiquettes.
- Sans clé ou sans réseau, la saisie manuelle reste disponible. Le modèle utilisé est défini dans `scan.js` (`MODELS`) ; les modèles Gemini changent, voir la documentation Google si la lecture cesse de fonctionner.

## Données et confidentialité

- Les fiches sont dans **IndexedDB** (navigateur de l'appareil). Supprimer l'icône ou effacer les données du site les efface : faire une **sauvegarde** (menu → *Sauvegarder mes données*) de temps en temps.
- Chaque ajout, modification ou suppression est écrit immédiatement sur l'appareil.
- Rien n'est envoyé en ligne, sauf la photo d'étiquette si la lecture automatique est activée.

## Développement

Pas de build : des fichiers statiques et des modules ES natifs.

```bash
npm test          # tests automatiques (Node ≥ 20, sans dépendance)
npm run serve     # serveur local sur http://localhost:8765  (ou : python3 -m http.server 8765)
```

Pour essayer sur un iPhone du même Wi-Fi : `http://<adresse-IP-du-Mac>:8765` (le service worker, donc le mode hors-ligne, ne s'active qu'en HTTPS).
Ajouter `?debug` à l'adresse expose `window.__cave` pour les tests dans le navigateur.

### Structure

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Page, interface (conçue pour un public peu à l'aise avec le numérique : gros boutons, textes clairs) |
| `app.js` | Scène 3D (Three.js), interactions, fiches, menu |
| `lib.js` | Fonctions pures (échappement HTML, identifiants d'emplacements, dimensions, quantités, suggestions) |
| `db.js` | Stockage local IndexedDB |
| `scan.js` | Lecture d'étiquette via Gemini (clé, requête, validation de la réponse) |
| `version.js` | Numéro de version, source unique |
| `sw.js`, `manifest.webmanifest`, `icons/` | Mode hors-ligne et installation iPhone |
| `vendor/` | Three.js (copie locale, licence MIT) |
| `tests/` | Tests `node --test` |
| `.claude/` | Agent de relecture de code et automatisations (voir plus bas) |

Un emplacement s'identifie par `casier:colonne:rangée` (ex. `G:12:4`), colonnes comptées depuis l'entrée, rangées depuis le bas. Casiers : `G` mur gauche, `IG`/`ID` îlot gauche/droit, `D` mur droit.

## Déploiement

Le site est servi par **GitHub Pages** depuis la branche `main` (racine du dépôt) : **pousser sur `main` publie le site** en une à deux minutes. Il n'y a ni serveur ni étape de construction ; les fichiers du dépôt sont les fichiers servis.

### Publier une version

1. Mettre à jour le numéro dans `version.js` **et** `package.json`, et ajouter l'entrée en tête de `CHANGELOG.md` (un test vérifie qu'ils concordent).
2. `npm test`.
3. Commit, puis `git tag vX.Y.Z`.
4. Après vérification sur un téléphone : `git push origin main --tags` (c'est ce push qui déploie).

Revenir en arrière : `git revert <commit>` puis pousser.

## Relecture de code automatisée

Le dossier `.claude/` contient, pour Claude Code :
- l'agent **`code-reviewer`** (`.claude/agents/code-reviewer.md`) : relecture en lecture seule selon les bonnes pratiques du projet (sécurité, données, PWA, ergonomie, 3D, documentation) ;
- des **hooks** (`.claude/settings.json`) : après chaque modification de code, la syntaxe est vérifiée et un marqueur « relecture en attente » est posé ; Claude ne peut pas conclure sans avoir lancé l'agent ;
- `CLAUDE.md` : les règles du projet.

Le plugin *superpowers* (méthodes de travail : tests d'abord, débogage méthodique, vérification avant de conclure) est installé au niveau de l'utilisateur (tous les projets). Il est complémentaire de `code-reviewer` : superpowers apporte une méthode générique, `code-reviewer` une liste de contrôle propre à Ma Cave, rendue obligatoire par les hooks.

## Limites connues / idées

- Les données ne sont pas partagées entre appareils (pas de compte en ligne).
- Affichage prévu en portrait ; le mode paysage n'est pas finalisé.
- Idées : filtres par région ou millésime, export de l'inventaire en tableau, partage entre deux téléphones.
